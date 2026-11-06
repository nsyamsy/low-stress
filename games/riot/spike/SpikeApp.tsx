import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { getRoomAtPosition, getSpawnPoint, MAP_DATA, resolveMovement } from "../shared/collision";
import { VirtualJoystick } from "../client/VirtualJoystick";
import idMessages from "../locales/id.json";
import enMessages from "../locales/en.json";

type Locale = "id" | "en";
const LOCALES = { id: idMessages, en: enMessages };

export function SpikeApp() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [locale, setLocale] = useState<Locale>("id");
  const [characterCount, setCharacterCount] = useState<20 | 32>(20);
  const [copied, setCopied] = useState(false);
  const [rttMs, setRttMs] = useState<number | null>(null);
  const [rttTested, setRttTested] = useState(false);

  // Performance telemetry states
  const [fpsCurrent, setFpsCurrent] = useState(60);
  const [fpsAvg, setFpsAvg] = useState(60);
  const [fpsMin, setFpsMin] = useState(60);
  const [drawCalls, setDrawCalls] = useState(0);
  const [triangles, setTriangles] = useState(0);
  const [screenSize, setScreenSize] = useState({ width: 0, height: 0 });
  const [dpr, setDpr] = useState(1);
  const [orientation, setOrientation] = useState("");
  const [currentRoom, setCurrentRoom] = useState("command");

  const inputRef = useRef({ dx: 0, dy: 0 });
  const playerPosRef = useRef({ x: 0, y: 32 });

  const t = (path: string, params: Record<string, string | number> = {}): string => {
    const keys = path.split(".");
    let val: unknown = LOCALES[locale];
    for (const k of keys) {
      if (val && typeof val === "object" && k in val) {
        val = (val as Record<string, unknown>)[k];
      } else {
        return path;
      }
    }
    if (typeof val === "string") {
      let str = val;
      for (const [pk, pv] of Object.entries(params)) {
        str = str.replace(new RegExp(`{{${pk}}}`, "g"), String(pv));
      }
      return str;
    }
    return path;
  };

  // Measure Real Network RTT if backend is reachable
  useEffect(() => {
    let cancelled = false;
    const measureRtt = async () => {
      const t0 = performance.now();
      try {
        const res = await fetch("/api/health", { method: "HEAD", cache: "no-store" });
        if (!cancelled && res.ok) {
          const t1 = performance.now();
          setRttMs(Math.round(t1 - t0));
        }
      } catch {
        if (!cancelled) setRttMs(null);
      } finally {
        if (!cancelled) setRttTested(true);
      }
    };
    void measureRtt();
    const interval = setInterval(measureRtt, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Update screen and orientation info
  useEffect(() => {
    const updateDeviceInfo = () => {
      setScreenSize({ width: window.innerWidth, height: window.innerHeight });
      setDpr(Math.round(window.devicePixelRatio * 100) / 100);
      setOrientation(
        window.screen?.orientation?.type ??
          (window.innerWidth > window.innerHeight ? "landscape" : "portrait"),
      );
    };
    updateDeviceInfo();
    window.addEventListener("resize", updateDeviceInfo);
    window.addEventListener("orientationchange", updateDeviceInfo);
    return () => {
      window.removeEventListener("resize", updateDeviceInfo);
      window.removeEventListener("orientationchange", updateDeviceInfo);
    };
  }, []);

  // Main Three.js Scene with 20/32 InstancedMesh Characters and Greybox Map
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animId: number;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Scene & Camera
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);
    scene.fog = new THREE.FogExp2(0x020617, 0.012);

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.5, 300);
    camera.position.set(0, 18, 22);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight.position.set(20, 40, 20);
    scene.add(dirLight);

    // 1. Greybox Map Floors and Grid (120x90)
    const floorGeom = new THREE.PlaneGeometry(120, 90);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.8,
      metalness: 0.2,
    });
    const floorMesh = new THREE.Mesh(floorGeom, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    scene.add(floorMesh);

    const gridHelper = new THREE.GridHelper(120, 60, 0x38bdf8, 0x1e293b);
    gridHelper.position.y = 0.02;
    scene.add(gridHelper);

    // 2. Greybox Walls from MAP_DATA.walls
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.5,
      metalness: 0.5,
    });
    for (const wall of MAP_DATA.walls) {
      const wWidth = Math.max(wall.maxX - wall.minX, 0.4);
      const wDepth = Math.max(wall.maxY - wall.minY, 0.4);
      const wHeight = 3.0;

      const wallGeom = new THREE.BoxGeometry(wWidth, wHeight, wDepth);
      const wallMesh = new THREE.Mesh(wallGeom, wallMat);

      const centerX = (wall.minX + wall.maxX) / 2;
      const centerZ = -(wall.minY + wall.maxY) / 2; // Invert Y to Z
      wallMesh.position.set(centerX, wHeight / 2, centerZ);
      scene.add(wallMesh);
    }

    // 3. Room Floor Indicators
    const roomColors = [
      0x38bdf8, 0x4ade80, 0xfacc15, 0xf43f5e, 0xa855f7,
      0x06b6d4, 0xec4899, 0x10b981, 0x6366f1, 0x64748b,
    ];
    MAP_DATA.rooms.forEach((room, idx) => {
      const rWidth = room.bounds.maxX - room.bounds.minX;
      const rDepth = room.bounds.maxY - room.bounds.minY;
      const padGeom = new THREE.PlaneGeometry(rWidth * 0.9, rDepth * 0.9);
      const padMat = new THREE.MeshBasicMaterial({
        color: roomColors[idx % roomColors.length] ?? 0x38bdf8,
        transparent: true,
        opacity: 0.12,
      });
      const padMesh = new THREE.Mesh(padGeom, padMat);
      padMesh.rotation.x = -Math.PI / 2;
      padMesh.position.set(
        (room.bounds.minX + room.bounds.maxX) / 2,
        0.05,
        -(room.bounds.minY + room.bounds.maxY) / 2,
      );
      scene.add(padMesh);
    });

    // 4. InstancedMesh Characters (20 or 32 instances)
    const charGeom = new THREE.SphereGeometry(0.8, 16, 16);
    const charMat = new THREE.MeshStandardMaterial({
      roughness: 0.3,
      metalness: 0.2,
    });
    const instancedMesh = new THREE.InstancedMesh(charGeom, charMat, characterCount);
    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Initial transforms and colors for all characters
    const dummy = new THREE.Object3D();
    const characterData: Array<{ x: number; y: number; baseAngle: number; speed: number }> = [];

    const instancePalette = [
      0x38bdf8, 0xf43f5e, 0x22c55e, 0xeab308, 0xa855f7, 0xec4899,
      0x06b6d4, 0xf97316, 0x14b8a6, 0x8b5cf6, 0x64748b, 0xd946ef,
    ];

    for (let i = 0; i < characterCount; i++) {
      const spawn = getSpawnPoint(i);
      const startX = i === 0 ? playerPosRef.current.x : spawn.x;
      const startY = i === 0 ? playerPosRef.current.y : spawn.y;

      characterData.push({
        x: startX,
        y: startY,
        baseAngle: (i * Math.PI) / 6,
        speed: 1.5 + (i % 3) * 0.5,
      });

      dummy.position.set(startX, 0.8, -startY);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);

      // Local player is bright cyan (0), others have varied mochi palette
      const colorHex = i === 0 ? 0x38bdf8 : instancePalette[i % instancePalette.length]!;
      instancedMesh.setColorAt(i, new THREE.Color(colorHex));
    }
    instancedMesh.instanceColor!.needsUpdate = true;
    instancedMesh.instanceMatrix.needsUpdate = true;
    scene.add(instancedMesh);

    // FPS and Telemetry measurement trackers
    const frameTimes: number[] = [];
    let lastFrameTime = performance.now();
    let statsTimer = 0;

    const onWindowResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onWindowResize);

    // Animation Loop
    const animate = () => {
      animId = requestAnimationFrame(animate);

      const now = performance.now();
      const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
      lastFrameTime = now;

      // Frame time window (last 60 frames)
      frameTimes.push(dt);
      if (frameTimes.length > 60) frameTimes.shift();

      statsTimer += dt;
      if (statsTimer >= 0.25) {
        statsTimer = 0;
        const totalDuration = frameTimes.reduce((a, b) => a + b, 0);
        const avgF = Math.round(frameTimes.length / totalDuration);
        const maxDelta = Math.max(...frameTimes);
        const minF = Math.round(1 / maxDelta);

        setFpsCurrent(Math.round(1 / dt));
        setFpsAvg(avgF);
        setFpsMin(minF);
        setDrawCalls(renderer.info.render.calls);
        setTriangles(renderer.info.render.triangles);
      }

      // 1. Process Controlled Player (Instance 0)
      const { dx, dy } = inputRef.current;
      if (dx !== 0 || dy !== 0) {
        const speed = 5.0;
        const targetX = playerPosRef.current.x + dx * speed * dt;
        const targetY = playerPosRef.current.y + dy * speed * dt;

        const resolved = resolveMovement(
          playerPosRef.current,
          { x: targetX, y: targetY },
          0.8,
        );
        playerPosRef.current = resolved;
      }

      // Update current room display
      const r = getRoomAtPosition(playerPosRef.current.x, playerPosRef.current.y);
      if (r) setCurrentRoom(r.id);

      // 2. Update Instance 0 (Player) in InstancedMesh
      dummy.position.set(playerPosRef.current.x, 0.8 + Math.sin(now * 0.008) * 0.06, -playerPosRef.current.y);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(0, dummy.matrix);

      // 3. Update Other Instances (Mochi Characters wandering slightly)
      for (let i = 1; i < characterCount; i++) {
        const cd = characterData[i]!;
        const bob = Math.sin(now * 0.005 + i) * 0.08;
        const wanderX = cd.x + Math.sin(now * 0.001 * cd.speed + cd.baseAngle) * 0.6;
        const wanderZ = -(cd.y + Math.cos(now * 0.001 * cd.speed + cd.baseAngle) * 0.6);

        dummy.position.set(wanderX, 0.8 + bob, wanderZ);
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(i, dummy.matrix);
      }
      instancedMesh.instanceMatrix.needsUpdate = true;

      // 4. Smooth Camera Tracking
      const camTargetX = playerPosRef.current.x;
      const camTargetZ = -playerPosRef.current.y;
      camera.position.x += (camTargetX - camera.position.x) * 0.08;
      camera.position.z += (camTargetZ + 20 - camera.position.z) * 0.08;
      camera.lookAt(camera.position.x, 0, camera.position.z - 20);

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onWindowResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [characterCount]);

  // Automated R5 Budget Comparison
  const isFpsPass = fpsAvg >= 30;
  const isDrawCallsPass = drawCalls <= 150;
  const isTrianglesPass = triangles <= 100000;
  const isOverallPass = isFpsPass && isDrawCallsPass && isTrianglesPass;

  // Copy structured report to clipboard
  const handleCopyReport = async () => {
    const report = {
      timestamp: new Date().toISOString(),
      characterCount,
      metrics: {
        fps: { current: fpsCurrent, avg: fpsAvg, min: fpsMin, budget: ">= 30", pass: isFpsPass },
        drawCalls: { count: drawCalls, budget: "<= 150", pass: isDrawCallsPass },
        triangles: { count: triangles, budget: "<= 100000", pass: isTrianglesPass },
        overallR5Verdict: isOverallPass ? "PASS" : "FAIL",
      },
      device: {
        screen: `${screenSize.width}x${screenSize.height}`,
        devicePixelRatio: dpr,
        orientation,
        userAgent: navigator.userAgent,
      },
      network: {
        rttMs: rttMs !== null ? rttMs : "UNREACHABLE_STANDALONE",
        note: rttMs === null ? "Standalone spike running without local server backend" : "OK",
      },
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback if clipboard API is blocked
      prompt("Salin laporan JSON di bawah:", JSON.stringify(report));
    }
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      {/* 3D WebGL Canvas */}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Floating Telemetry & R5 HUD Panel (Top-Left) */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          maxWidth: 340,
          backgroundColor: "rgba(15, 23, 42, 0.88)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(56, 189, 248, 0.3)",
          borderRadius: 12,
          padding: 12,
          fontSize: 12,
          lineHeight: 1.5,
          color: "#f8fafc",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.6)",
          zIndex: 20,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <strong style={{ fontSize: 13, color: "#38bdf8" }}>{t("spike.title")}</strong>
          <button
            onClick={() => setLocale(locale === "id" ? "en" : "id")}
            style={{
              padding: "2px 8px",
              borderRadius: 6,
              background: "#334155",
              color: "#f8fafc",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {locale.toUpperCase()}
          </button>
        </div>

        {/* FPS */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>FPS:</span>
          <strong>
            {fpsCurrent} (avg: {fpsAvg}, min: {fpsMin})
          </strong>
        </div>

        {/* Three.js Info */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Draw Calls:</span>
          <strong>{drawCalls} / 150</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{t("spike.triangles", { count: "" }).split(":")[0]}:</span>
          <strong>{triangles.toLocaleString()} / 100,000</strong>
        </div>

        {/* Device Metrics */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>DPR / Layar:</span>
          <span>
            {dpr}x ({screenSize.width}x{screenSize.height})
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Orientasi:</span>
          <span>{orientation}</span>
        </div>

        {/* Room & RTT */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Ruangan:</span>
          <span style={{ color: "#38bdf8", fontWeight: 600 }}>{t(`rooms.${currentRoom}`)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8" }}>
          <span>RTT Jaringan:</span>
          <span>{rttMs !== null ? `${rttMs} ms` : rttTested ? "Offline/Spike" : "Mengukur..."}</span>
        </div>

        {/* R5 Verdict Badge */}
        <div
          style={{
            marginTop: 8,
            padding: "4px 8px",
            borderRadius: 6,
            textAlign: "center",
            fontWeight: "bold",
            letterSpacing: 0.5,
            backgroundColor: isOverallPass ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)",
            color: isOverallPass ? "#4ade80" : "#f87171",
            border: `1px solid ${isOverallPass ? "#22c55e" : "#ef4444"}`,
          }}
        >
          {t("spike.r5Budget")}: {isOverallPass ? t("spike.pass") : t("spike.fail")}
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button
            onClick={() => setCharacterCount(characterCount === 20 ? 32 : 20)}
            style={{
              flex: 1,
              padding: "6px 8px",
              minHeight: 44,
              borderRadius: 8,
              backgroundColor: "#1e293b",
              border: "1px solid #475569",
              color: "#f8fafc",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {characterCount === 20 ? t("spike.test32") : t("spike.test20")}
          </button>
          <button
            onClick={handleCopyReport}
            style={{
              flex: 1,
              padding: "6px 8px",
              minHeight: 44,
              borderRadius: 8,
              backgroundColor: copied ? "#16a34a" : "#0284c7",
              border: "none",
              color: "#ffffff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {copied ? t("spike.copied") : t("spike.copyReport")}
          </button>
        </div>
      </div>

      {/* Virtual Joystick for Mobile Touch Controls (Bottom-Left) */}
      <div
        style={{
          position: "absolute",
          bottom: 24,
          left: 24,
          zIndex: 20,
        }}
      >
        <VirtualJoystick
          onMove={(mov) => {
            inputRef.current = mov;
          }}
        />
      </div>
    </div>
  );
}
