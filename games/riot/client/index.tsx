import { useEffect, useRef, useState } from "react";
import { translate } from "@low-stress/i18n";
import type { GameProps } from "@low-stress/sdk";
import { Button, Chip } from "@low-stress/ui";

import en from "../locales/en.json";
import id from "../locales/id.json";
import { getRoomAtPosition } from "../shared/collision";
import { ClientPredictionManager } from "./prediction";
import { VirtualJoystick } from "./VirtualJoystick";

const MESSAGES = { id, en };

export default function Game({ locale, onScore, onExit }: GameProps) {
  const t = (key: string) => translate(locale, key, {}, MESSAGES[locale]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [startedAt] = useState(() => Date.now());
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<string | null>("command");

  const inputRef = useRef({ dx: 0, dy: 0 });
  const predictionRef = useRef<ClientPredictionManager>(new ClientPredictionManager(0, 30));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animId: number;
    let renderer: {
      dispose: () => void;
      domElement: HTMLCanvasElement;
    } | null = null;
    let cancelled = false;

    void (async () => {
      // Three.js dimuat secara lazy agar tidak membebani shell aplikasi utama
      const THREE = await import("three");
      if (cancelled) return;

      const width = container.clientWidth || 360;
      const height = Math.min(width, 360);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
      camera.position.set(0, 15, 20);
      camera.lookAt(0, 0, 0);

      const threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      threeRenderer.setSize(width, height);
      container.appendChild(threeRenderer.domElement);
      renderer = threeRenderer;

      // Floor grid indicator
      const gridHelper = new THREE.GridHelper(60, 30, 0x38bdf8, 0x1e293b);
      scene.add(gridHelper);

      // Player mesh (Mochi sphere with visor-less friendly dome)
      const playerGroup = new THREE.Group();
      const bodyGeom = new THREE.SphereGeometry(0.8, 16, 16);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3 });
      const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
      bodyMesh.position.y = 0.8;
      playerGroup.add(bodyMesh);

      // Nose / direction indicator
      const noseGeom = new THREE.ConeGeometry(0.2, 0.5, 8);
      const noseMat = new THREE.MeshStandardMaterial({ color: 0xf43f5e });
      const noseMesh = new THREE.Mesh(noseGeom, noseMat);
      noseMesh.rotation.x = Math.PI / 2;
      noseMesh.position.set(0, 0.8, 0.8);
      playerGroup.add(noseMesh);

      scene.add(playerGroup);

      const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
      dirLight.position.set(5, 15, 10);
      scene.add(dirLight);
      scene.add(new THREE.AmbientLight(0xffffff, 0.6));

      let lastTime = performance.now();

      const animate = () => {
        if (cancelled) return;
        animId = requestAnimationFrame(animate);

        const now = performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        const { dx, dy } = inputRef.current;
        if (dx !== 0 || dy !== 0) {
          predictionRef.current.applyInput(dx, dy, dt);
        }

        const pos = predictionRef.current.getPosition();
        // In 3D: X is x, Z is -y (standard top-down mapping)
        playerGroup.position.set(pos.x, 0, -pos.y);
        playerGroup.rotation.y = -pos.heading + Math.PI / 2;

        // Camera smoothly follows player
        camera.position.x = pos.x;
        camera.position.z = -pos.y + 15;
        camera.lookAt(pos.x, 0, -pos.y);

        // Update current room detection
        const room = getRoomAtPosition(pos.x, pos.y);
        setCurrentRoom(room ? room.id : null);

        threeRenderer.render(scene, camera);
      };
      animate();
    })();

    return () => {
      cancelled = true;
      if (animId) cancelAnimationFrame(animId);
      if (renderer?.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
        renderer.dispose();
      }
    };
  }, []);

  const finish = () => {
    if (finished) return;
    setFinished(true);
    void onScore({ score, durationMs: Date.now() - startedAt });
  };

  return (
    <div className="ls-card ls-stack">
      <div className="ls-row">
        <h1 className="ls-heading-2">{t("title")}</h1>
        <Chip tone="neutral">
          {translate(locale, "score", { score }, MESSAGES[locale])}
        </Chip>
        {currentRoom && (
          <Chip tone="neutral">
            {t(`rooms.${currentRoom}`)}
          </Chip>
        )}
      </div>
      <p className="ls-text-secondary">{t("subtitle")}</p>

      {/* 3D Game Stage Viewport */}
      <div
        ref={containerRef}
        aria-label={t("stageLabel")}
        className="w-full aspect-square max-w-sm mx-auto flex items-center justify-center overflow-hidden rounded-xl border border-border bg-slate-950"
      />

      {/* Movement Controls (Joystick + WASD) */}
      <div className="my-2">
        <VirtualJoystick
          onMove={(mov) => {
            inputRef.current = mov;
          }}
          disabled={finished}
        />
      </div>

      <div className="ls-row">
        <Button onClick={() => setScore((s) => s + 1)}>{t("tap")}</Button>
        <Button variant="secondary" onClick={finish} disabled={finished}>
          {t("finish")}
        </Button>
        <Button variant="ghost" onClick={onExit}>
          {t("exit")}
        </Button>
      </div>
    </div>
  );
}
