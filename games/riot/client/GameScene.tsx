import { useEffect, useRef, useState } from "react";
import type {
  AmbientLight,
  BufferGeometry,
  DirectionalLight,
  Fog,
  Material,
  Mesh,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import type { Socket } from "socket.io-client";
import { Button, Chip } from "@low-stress/ui";
import { decodeInterestSnapshot, type CompactSnapshotPayload } from "../shared/interest";
import { getTaskById, type StationTaskDefinition } from "../shared/tasks";
import { REPORT_RANGE, ELIMINATION_RANGE } from "../shared/actions";
import {
  CRITICAL_ALARM_STATIONS,
  BLACKOUT_REPAIR_STATION,
  isRoomDoorLocked,
  type SabotageKind,
} from "../shared/sabotage";
import { MAP_DATA, getRoomAtPosition } from "../shared/collision";
import {
  DEFAULT_MOCHI_CUSTOMIZATION,
  sanitizeCharacterCustomization,
} from "../shared/character";
import type { RiotClientRoomView } from "../shared/protocol";
import type { PlayerRole } from "../shared/rules";
import type { TranslateFn } from "./CharacterPicker";
import { MochiCrowd, type CrowdCharacterState } from "./characters/crowd";
import { ClientPredictionManager, RemoteInterpolationManager } from "./prediction";
import { VirtualJoystick } from "./VirtualJoystick";
import { emitAck } from "./net";
import { isMuted, setMuted, sfx } from "./audio";
import { usePrefersReducedMotion } from "./reduced-motion";

interface GameSceneProps {
  socket: Socket;
  view: RiotClientRoomView;
  role: PlayerRole | null;
  locale: "id" | "en";
  t: TranslateFn;
  onExit: () => void;
}

const SABOTAGE_KINDS: SabotageKind[] = ["blackout", "doors", "critical_alarm"];
const INPUT_INTERVAL_MS = 50; // 20 Hz
const INTERP_DELAY_MS = 100;

function taskName(task: StationTaskDefinition, locale: "id" | "en"): string {
  return task.name[locale] ?? task.name.en;
}

export function GameScene({ socket, view, role, locale, t, onExit }: GameSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const crowdRef = useRef<MochiCrowd | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const ambientLightRef = useRef<AmbientLight | null>(null);
  const keyLightRef = useRef<DirectionalLight | null>(null);
  const hologramMeshesRef = useRef<Map<string, Mesh>>(new Map());
  const hologramGeomRef = useRef<BufferGeometry | null>(null);
  const hologramMatRef = useRef<Material | null>(null);
  const framePositionsRef = useRef(new Map<string, { x: number; y: number; heading: number }>());
  const visibleIdsRef = useRef<Set<string>>(new Set([view.viewerId]));
  const wasMovingRef = useRef(false);

  const predictionRef = useRef<ClientPredictionManager | null>(null);
  const interpRef = useRef<RemoteInterpolationManager | null>(null);
  const inputRef = useRef({ dx: 0, dy: 0 });
  const charsRef = useRef(new Map<string, CrowdCharacterState>());

  const [muted, setMutedState] = useState(isMuted());
  const [chatText, setChatText] = useState("");
  const [taskProgress, setTaskProgress] = useState<{ taskId: string; startedAt: number; progress: number } | null>(null);
  const [nearInfo, setNearInfo] = useState<{ kind: "task" | "report" | "eliminate" | "repair"; id: string; label: string } | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [, setTick] = useState(0); // paksa render HUD berkala

  const myId = view.viewerId;
  const myPlayer = view.players.find((p) => p.id === myId);
  const myStatus = view.myStatus;
  const inMeeting = view.phase === "meeting" || view.phase === "voting";

  // --- Skene 3D: lantai, dinding, hologram, kamera mengikuti pemain sendiri ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let raf = 0;
    let renderer: WebGLRenderer | null = null;
    const disposableGeometries: BufferGeometry[] = [];
    const disposableMaterials: Material[] = [];

    void (async () => {
      const THREE = await import("three");
      if (cancelled) return;

      const width = container.clientWidth || 360;
      const height = Math.max(240, Math.min(width, 420));

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0b1020);
      scene.fog = new THREE.Fog(0x0b1020, 30, 90);
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 200);
      cameraRef.current = camera;

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const ambient = new THREE.AmbientLight(0xbfd4ff, 0.75);
      scene.add(ambient);
      ambientLightRef.current = ambient;

      const key = new THREE.DirectionalLight(0xffffff, 1.4);
      key.position.set(20, 40, 10);
      scene.add(key);
      keyLightRef.current = key;

      // Lantai
      const { mapSize } = MAP_DATA;
      const floorGeom = new THREE.PlaneGeometry(mapSize.width + 20, mapSize.height + 20);
      const floorMat = new THREE.MeshStandardMaterial({ color: 0x141b2e, roughness: 0.9 });
      disposableGeometries.push(floorGeom);
      disposableMaterials.push(floorMat);
      const floor = new THREE.Mesh(floorGeom, floorMat);
      floor.rotation.x = -Math.PI / 2;
      scene.add(floor);

      // Petak ruangan (visual pembeda area)
      const padMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.05,
        side: THREE.DoubleSide,
      });
      disposableMaterials.push(padMat);
      for (const room of MAP_DATA.rooms) {
        const w = room.bounds.maxX - room.bounds.minX;
        const h = room.bounds.maxY - room.bounds.minY;
        const padGeom = new THREE.PlaneGeometry(w, h);
        disposableGeometries.push(padGeom);
        const pad = new THREE.Mesh(padGeom, padMat);
        pad.rotation.x = -Math.PI / 2;
        pad.position.set((room.bounds.minX + room.bounds.maxX) / 2, 0.01, -(room.bounds.minY + room.bounds.maxY) / 2);
        scene.add(pad);
      }

      // Dinding greybox dari data kolisi
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.8 });
      disposableMaterials.push(wallMat);
      for (const wall of MAP_DATA.walls) {
        const w = wall.maxX - wall.minX;
        const h = wall.maxY - wall.minY;
        if (w <= 0 || h <= 0) continue;
        const wallGeom = new THREE.BoxGeometry(w, 2.4, h);
        disposableGeometries.push(wallGeom);
        const mesh = new THREE.Mesh(wallGeom, wallMat);
        mesh.position.set((wall.minX + wall.maxX) / 2, 1.2, -(wall.minY + wall.maxY) / 2);
        scene.add(mesh);
      }

      // Garis batas peta
      const borderGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-mapSize.width / 2 - 10, 0.05, -mapSize.height / 2 - 10),
        new THREE.Vector3(mapSize.width / 2 + 10, 0.05, -mapSize.height / 2 - 10),
        new THREE.Vector3(mapSize.width / 2 + 10, 0.05, mapSize.height / 2 + 10),
        new THREE.Vector3(-mapSize.width / 2 - 10, 0.05, mapSize.height / 2 + 10),
      ]);
      const borderMat = new THREE.LineBasicMaterial({ color: 0x38bdf8 });
      disposableGeometries.push(borderGeom);
      disposableMaterials.push(borderMat);
      const border = new THREE.LineLoop(borderGeom, borderMat);
      scene.add(border);

      // Geometri & material bersama untuk penanda hologram eliminasi
      const holoGeom = new THREE.OctahedronGeometry(0.65, 0);
      const holoMat = new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: 0x06b6d4,
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 0.82,
        roughness: 0.2,
      });
      disposableGeometries.push(holoGeom);
      disposableMaterials.push(holoMat);
      hologramGeomRef.current = holoGeom;
      hologramMatRef.current = holoMat;

      const crowd = new MochiCrowd(scene, 32);
      crowd.reducedMotion = reducedMotion;
      crowdRef.current = crowd;
      for (const st of charsRef.current.values()) {
        void crowd.upsert(st);
      }

      const animate = () => {
        if (cancelled) return;
        raf = requestAnimationFrame(animate);
        const now = performance.now();

        // Posisi render: interpolasi remote + prediksi sendiri
        const frame = framePositionsRef.current;
        frame.clear();
        const interp = interpRef.current;
        const renderTime = now - INTERP_DELAY_MS;
        const chars = charsRef.current;
        for (const id of chars.keys()) {
          if (id === myId && predictionRef.current) {
            const p = predictionRef.current.getPosition();
            frame.set(id, { x: p.x, y: p.y, heading: p.heading });
          } else if (interp) {
            const p = interp.getInterpolatedPosition(id, renderTime);
            if (p) frame.set(id, { x: p.x, y: p.y, heading: p.heading });
          }
        }
        crowd.setFramePositions(frame);
        crowd.update(now, visibleIdsRef.current);

        // Putar perlahan penanda hologram yang aktif
        if (!reducedMotion) {
          for (const mesh of hologramMeshesRef.current.values()) {
            mesh.rotation.y = now * 0.002;
          }
        }

        // Kamera mengikuti pemain sendiri
        const cam = cameraRef.current;
        if (cam) {
          const self = frame.get(myId) ?? { x: 0, y: 0 };
          cam.position.set(self.x, 16, -self.y + 13);
          cam.lookAt(self.x, 0, -self.y);
        }

        renderer!.render(scene, camera);
      };
      animate();
    })();

    const hologramMeshes = hologramMeshesRef.current;

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      crowdRef.current?.dispose();
      crowdRef.current = null;
      if (sceneRef.current) {
        for (const mesh of hologramMeshes.values()) {
          sceneRef.current.remove(mesh);
        }
      }
      hologramMeshes.clear();
      hologramGeomRef.current = null;
      hologramMatRef.current = null;
      sceneRef.current = null;
      ambientLightRef.current = null;
      keyLightRef.current = null;
      for (const geom of disposableGeometries) {
        geom.dispose();
      }
      for (const mat of disposableMaterials) {
        mat.dispose();
      }
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
        rendererRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Sinkronisasi karakter ke crowd saat daftar pemain berubah ---
  useEffect(() => {
    if (crowdRef.current) crowdRef.current.reducedMotion = reducedMotion;
  }, [reducedMotion]);

  useEffect(() => {
    const seen = new Set<string>();
    for (const p of view.players) {
      seen.add(p.id);
      const custom = p.character
        ? sanitizeCharacterCustomization(p.character)
        : { ...DEFAULT_MOCHI_CUSTOMIZATION };
      const prev = charsRef.current.get(p.id);
      const state: CrowdCharacterState = {
        id: p.id,
        custom,
        x: prev?.x ?? 0,
        y: prev?.y ?? 0,
        heading: prev?.heading ?? 0,
        ghost: p.status === "ghost",
      };
      charsRef.current.set(p.id, state);
      void crowdRef.current?.upsert(state);
    }
    for (const id of [...charsRef.current.keys()]) {
      if (!seen.has(id)) {
        charsRef.current.delete(id);
        crowdRef.current?.remove(id);
      }
    }
  }, [view.players]);

  // --- Sinkronisasi mesh 3D untuk hologramMarkers ---
  useEffect(() => {
    const scene = sceneRef.current;
    const geom = hologramGeomRef.current;
    const mat = hologramMatRef.current;
    if (!scene || !geom || !mat) return;

    let cancelled = false;
    void (async () => {
      const THREE = await import("three");
      if (cancelled || !sceneRef.current) return;
      const activeIds = new Set<string>();
      for (const m of view.hologramMarkers) {
        if (m.reported) continue;
        activeIds.add(m.id);
        let mesh = hologramMeshesRef.current.get(m.id);
        if (!mesh) {
          mesh = new THREE.Mesh(geom, mat);
          mesh.position.set(m.x, 0.9, -m.y);
          scene.add(mesh);
          hologramMeshesRef.current.set(m.id, mesh);
        } else {
          mesh.position.set(m.x, 0.9, -m.y);
        }
      }
      for (const [id, mesh] of [...hologramMeshesRef.current.entries()]) {
        if (!activeIds.has(id)) {
          scene.remove(mesh);
          hologramMeshesRef.current.delete(id);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [view.hologramMarkers]);

  // --- Efek visual blackout (peredupan lampu & kabut jarak dekat untuk kru) ---
  useEffect(() => {
    const sabKind =
      view.activeSabotage?.kind ??
      (view as unknown as { sabotage?: { active?: { kind?: SabotageKind } } }).sabotage?.active?.kind;
    const isCrewBlackout = sabKind === "blackout" && role !== "infiltrator";
    if (ambientLightRef.current) {
      ambientLightRef.current.intensity = isCrewBlackout ? 0.2 : 0.75;
    }
    if (keyLightRef.current) {
      keyLightRef.current.intensity = isCrewBlackout ? 0.35 : 1.4;
    }
    if (sceneRef.current?.fog) {
      const fog = sceneRef.current.fog as Fog;
      fog.near = isCrewBlackout ? 3.5 : 30;
      fog.far = isCrewBlackout ? 12 : 90;
    }
  }, [view, view.activeSabotage, role]);

  // --- Sinkronisasi playerSpeed & pintu terkunci ke ClientPredictionManager ---
  useEffect(() => {
    if (!predictionRef.current) return;
    predictionRef.current.setSpeedMultiplier(view.options.playerSpeed ?? 1.0);
    const sab = view.activeSabotage
      ? {
          ...view.activeSabotage,
          resolved: false,
          activatedSwitches: new Set<string>(),
        }
      : null;
    if (sab && sab.kind === "doors" && sab.targetRoom) {
      const locked: string[] = [];
      const now = Date.now();
      for (const r of MAP_DATA.rooms) {
        if (isRoomDoorLocked(sab, r.id, now)) {
          locked.push(r.id);
        }
      }
      predictionRef.current.setLockedRooms(locked);
    } else {
      predictionRef.current.setLockedRooms([]);
    }
  }, [view.options.playerSpeed, view.activeSabotage]);

  // --- Snapshot 15 Hz: interpolasi remote + rekonsiliasi prediksi + visibilitas ---
  useEffect(() => {
    if (!interpRef.current) interpRef.current = new RemoteInterpolationManager();
    if (!predictionRef.current) {
      predictionRef.current = new ClientPredictionManager(
        0,
        0,
        view.options.playerSpeed ?? 1.0,
        false,
      );
    }

    const onSnapshot = (payload: CompactSnapshotPayload) => {
      const snap = decodeInterestSnapshot(payload);
      const nextVisible = new Set<string>([myId]);
      for (const p of snap.players) {
        nextVisible.add(p.id);
        interpRef.current!.addSnapshot(p.id, p, payload.ts);
        if (p.id === myId) {
          if (!predictionRef.current!.isInitialized()) {
            predictionRef.current!.setPosition(p.x, p.y, p.heading);
          } else {
            predictionRef.current!.reconcile(p);
          }
        }
      }
      visibleIdsRef.current = nextVisible;
    };
    socket.on("snapshot", onSnapshot);
    return () => {
      socket.off("snapshot", onSnapshot);
    };
  }, [socket, myId, view.options.playerSpeed]);

  // --- Reset prediksi saat masuk fase playing baru ---
  useEffect(() => {
    if (view.phase === "playing") {
      predictionRef.current = new ClientPredictionManager(
        0,
        0,
        view.options.playerSpeed ?? 1.0,
        false,
      );
      interpRef.current = new RemoteInterpolationManager();
      visibleIdsRef.current = new Set([myId]);
      wasMovingRef.current = false;
    }
  }, [view.phase, myId, view.options.playerSpeed]);

  // --- Kirim input 20 Hz (hanya saat bergerak atau berhenti bergerak dengan seq valid) ---
  useEffect(() => {
    if (view.phase !== "playing" || inMeeting) return;
    const timer = setInterval(() => {
      const pred = predictionRef.current;
      if (!pred || !pred.isInitialized()) return;
      const { dx, dy } = inputRef.current;
      if (dx !== 0 || dy !== 0) {
        wasMovingRef.current = true;
        const input = pred.applyInput(dx, dy, INPUT_INTERVAL_MS / 1000);
        socket.emit("input", input);
      } else if (wasMovingRef.current) {
        wasMovingRef.current = false;
        const input = pred.applyInput(0, 0, INPUT_INTERVAL_MS / 1000);
        socket.emit("input", input);
      }
    }, INPUT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [socket, view.phase, inMeeting]);

  // --- HUD berkala: room, near-action, task progress ---
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((n) => n + 1);
      const pos = predictionRef.current?.getPosition() ?? { x: 0, y: 0, heading: 0 };
      const room = getRoomAtPosition(pos.x, pos.y);
      setRoomName(room ? room.name[locale] : null);

      // Cari aksi terdekat yang tersedia
      let found: typeof nearInfo = null;
      if (view.phase === "playing" && myStatus === "alive") {
        // Tugas
        for (const taskId of view.myTasks) {
          if (view.myCompletedTasks.includes(taskId)) continue;
          const task = getTaskById(taskId);
          if (!task) continue;
          const d = Math.hypot(pos.x - task.location.x, pos.y - task.location.y);
          if (d <= task.interactionRadius) {
            found = { kind: "task", id: taskId, label: taskName(task, locale) };
            break;
          }
        }
        // Marker hologram untuk dilaporkan
        if (!found) {
          for (const m of view.hologramMarkers) {
            if (m.reported) continue;
            const d = Math.hypot(pos.x - m.x, pos.y - m.y);
            if (d <= REPORT_RANGE) {
              found = { kind: "report", id: m.id, label: t("lobbyExtra.reportMarker") };
              break;
            }
          }
        }
        // Eliminasi (penyusup) — target dari pemain yang terlihat
        if (!found && role === "infiltrator") {
          for (const p of view.players) {
            if (p.id === myId || p.status !== "alive" || !visibleIdsRef.current.has(p.id)) continue;
            const fp = framePositionsRef.current.get(p.id);
            if (!fp) continue;
            const d = Math.hypot(pos.x - fp.x, pos.y - fp.y);
            if (d <= ELIMINATION_RANGE) {
              found = { kind: "eliminate", id: p.id, label: p.displayName };
              break;
            }
          }
        }
        // Perbaikan sabotase
        if (!found && view.activeSabotage) {
          const stations =
            view.activeSabotage.kind === "critical_alarm"
              ? [...CRITICAL_ALARM_STATIONS]
              : [BLACKOUT_REPAIR_STATION];
          for (const st of stations) {
            const d = Math.hypot(pos.x - st.x, pos.y - st.y);
            if (d <= 3) {
              found = { kind: "repair", id: st.id, label: t("lobbyExtra.send") };
              break;
            }
          }
        }
      }
      setNearInfo((prev) =>
        prev?.kind === found?.kind && prev?.id === found?.id ? prev : found,
      );

      // Progress tugas yang sedang berjalan
      setTaskProgress((tp) => {
        if (!tp) return tp;
        const task = getTaskById(tp.taskId);
        if (!task) return null;
        const elapsed = Date.now() - tp.startedAt;
        const progress = Math.min(1, elapsed / task.minDurationMs);
        if (progress >= 1) {
          void emitAck(socket, "task:complete", {
            taskId: tp.taskId,
            startedAt: tp.startedAt,
            completedAt: Date.now(),
            durationMs: elapsed,
          }).then((res) => {
            if ((res as { success?: boolean }).success) sfx.taskDone();
          }).catch(() => undefined);
          return null;
        }
        return { ...tp, progress };
      });
    }, 100);
    return () => clearInterval(timer);
  }, [view, myId, myStatus, role, locale, socket, t]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  const sendChat = () => {
    const text = chatText.trim();
    if (!text) return;
    void emitAck(socket, "chat:send", { text }).catch(() => undefined);
    setChatText("");
  };

  const vote = (targetId: string | "skip") => {
    sfx.voteCast();
    void emitAck(socket, "vote:cast", { targetId }).catch(() => undefined);
  };

  const alivePlayers = view.players.filter((p) => p.status === "alive" && p.connected);
  const myVoted = myPlayer?.hasVoted;

  return (
    <div className="ls-stack w-full">
      {/* HUD atas */}
      <div className="ls-row flex-wrap">
        {roomName ? <Chip tone="neutral">{roomName}</Chip> : null}
        {view.phase === "playing" ? (
          <Chip tone="neutral">
            {t("lobbyExtra.taskProgress", { done: view.tasksCompleted, total: view.tasksTotal })}
          </Chip>
        ) : null}
        <span className="flex-1" />
        <Button variant="ghost" onClick={toggleMute} aria-pressed={muted}>
          {muted ? t("lobbyExtra.mute") : t("lobbyExtra.unmute")}
        </Button>
        <Button variant="ghost" onClick={onExit}>
          {t("exit")}
        </Button>
      </div>

      {view.phase === "playing" && view.activeSabotage ? (
        <div className="rounded-lg border border-danger bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {t(`lobbyExtra.sabotage_${view.activeSabotage.kind}`)}
        </div>
      ) : null}

      {/* Viewport 3D */}
      <div
        ref={containerRef}
        aria-label={t("stageLabel")}
        className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-[var(--bg-inset)]"
      />

      {/* Panel aksi terdekat */}
      {view.phase === "playing" && nearInfo && !taskProgress ? (
        <div className="ls-row">
          <Button
            onClick={() => {
              if (nearInfo.kind === "task") {
                const task = getTaskById(nearInfo.id);
                if (task) {
                  setTaskProgress({ taskId: task.id, startedAt: Date.now(), progress: 0 });
                }
              } else if (nearInfo.kind === "report") {
                void emitAck(socket, "report", { markerId: nearInfo.id }).catch(() => undefined);
                sfx.meetingStart();
              } else if (nearInfo.kind === "eliminate") {
                void emitAck(socket, "action:eliminate", { targetId: nearInfo.id }).catch(() => undefined);
              } else if (nearInfo.kind === "repair") {
                void emitAck(socket, "sabotage:repair", { stationId: nearInfo.id }).catch(() => undefined);
              }
            }}
          >
            {nearInfo.kind === "task" ? `${t("task")}: ${nearInfo.label}` : nearInfo.label}
          </Button>
        </div>
      ) : null}

      {/* Progress tugas */}
      {taskProgress ? (
        <div className="ls-stack">
          <p className="ls-text-secondary text-sm">
            {taskName(getTaskById(taskProgress.taskId)!, locale)}
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-border" role="progressbar" aria-valuenow={Math.round(taskProgress.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-accent transition-all" style={{ width: `${taskProgress.progress * 100}%` }} />
          </div>
        </div>
      ) : null}

      {/* Tombol darurat + sabotase penyusup */}
      {view.phase === "playing" ? (
        <div className="ls-row flex-wrap">
          {myStatus === "alive" ? (
            <Button
              variant="secondary"
              onClick={() => {
                void emitAck(socket, "meeting:call").catch(() => undefined);
                sfx.meetingStart();
              }}
            >
              {t("lobbyExtra.emergencyButton")}
            </Button>
          ) : null}
          {role === "infiltrator" && myStatus === "alive" ? (
            <span className="ls-row flex-wrap">
              {SABOTAGE_KINDS.map((kind) => (
                <Button
                  key={kind}
                  variant="secondary"
                  onClick={() => {
                    const pos = predictionRef.current?.getPosition() ?? { x: 0, y: 0 };
                    const currRoom = getRoomAtPosition(pos.x, pos.y);
                    const targetRoom =
                      kind === "doors" ? (currRoom?.id ?? "room_command") : undefined;
                    void emitAck(socket, "sabotage:trigger", { kind, targetRoom }).catch(
                      () => undefined,
                    );
                  }}
                >
                  {t(`lobbyExtra.sabotage_${kind}`)}
                </Button>
              ))}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Joystick */}
      {view.phase === "playing" && !inMeeting ? (
        <VirtualJoystick
          onMove={(mov) => {
            inputRef.current = mov;
          }}
          disabled={myStatus !== "alive"}
          ariaLabel={t("lobbyExtra.joystickAriaLabel")}
          knobLabel={t("lobbyExtra.joystickKnob")}
          hintLabel={t("lobbyExtra.joystickHint")}
        />
      ) : null}
      <p className="ls-text-secondary text-center text-xs">{t("joystickHelp")}</p>

      {/* Overlay rapat / voting */}
      {view.phase === "meeting" ? (
        <div className="ls-card ls-stack absolute inset-x-4 top-16 z-10 mx-auto max-w-md">
          <h2 className="ls-heading-3">{t("lobbyExtra.meetingTitle")}</h2>
          <p className="ls-text-secondary text-sm">
            {view.meetingReason === "hologram_reported"
              ? t("lobbyExtra.meetingReasonReport")
              : t("lobbyExtra.meetingReasonButton")}
          </p>
          <div className="ls-stack max-h-40 overflow-y-auto" aria-live="polite">
            {view.chatMessages.map((m) => (
              <p key={m.id} className="text-sm">
                <span className="font-semibold">{m.senderName}:</span> {m.body}
                {m.senderStatus === "ghost" ? ` ${t("lobbyExtra.ghostChatTag")}` : ""}
              </p>
            ))}
          </div>
          {myStatus === "alive" || view.myStatus === "ghost" ? (
            <div className="ls-row">
              <input
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                placeholder={t("lobbyExtra.chatPlaceholder")}
                maxLength={300}
                className="ls-input flex-1"
              />
              <Button variant="secondary" onClick={sendChat}>
                {t("lobbyExtra.send")}
              </Button>
            </div>
          ) : null}
          {view.hostId === myId ? (
            <Button
              onClick={() => {
                void emitAck(socket, "meeting:advance").catch(() => undefined);
              }}
            >
              {t("vote")}
            </Button>
          ) : (
            <p className="ls-text-secondary text-sm">{t("lobbyExtra.discussionHint")}</p>
          )}
        </div>
      ) : null}

      {view.phase === "voting" ? (
        <div className="ls-card ls-stack absolute inset-x-4 top-16 z-10 mx-auto max-w-md">
          <h2 className="ls-heading-3">{t("lobbyExtra.votingTitle")}</h2>
          <p className="ls-text-secondary text-sm">{t("lobbyExtra.votingHint")}</p>
          {view.votingResult ? (
            <p className="text-sm">
              {view.votingResult.ejectedId
                ? t(
                    view.ejectedRole === "infiltrator"
                      ? "lobbyExtra.ejectedInfiltrator"
                      : "lobbyExtra.ejectedCrew",
                    {
                      name:
                        view.players.find((p) => p.id === view.votingResult!.ejectedId)
                          ?.displayName ?? "?",
                    },
                  )
                : t("lobbyExtra.noEjection")}
            </p>
          ) : null}
          <ul className="ls-stack">
            {alivePlayers.map((p) => (
              <li key={p.id} className="ls-row">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {p.displayName}
                  {p.hasVoted ? ` · ${t("lobbyExtra.votedTag")}` : ""}
                </span>
                <Button
                  variant="secondary"
                  disabled={myVoted || p.id === myId}
                  onClick={() => vote(p.id)}
                >
                  {t("vote")}
                </Button>
              </li>
            ))}
          </ul>
          <Button variant="secondary" disabled={myVoted} onClick={() => vote("skip")}>
            {t("skip")}
          </Button>
        </div>
      ) : null}

      {/* Hasil akhir */}
      {view.phase === "finished" ? (
        <div className="ls-card ls-stack absolute inset-x-4 top-16 z-10 mx-auto max-w-md">
          <h2 className="ls-heading-3">{t("lobbyExtra.resultsTitle")}</h2>
          <p className="text-lg font-semibold">
            {view.winner === "crew" ? t("lobbyExtra.winnerCrew") : t("lobbyExtra.winnerInfiltrator")}
          </p>
          <p className="ls-text-secondary text-sm">
            {view.winReason
              ? t(
                  view.winReason === "crew_all_tasks"
                    ? "lobbyExtra.reasonTasks"
                    : view.winReason === "crew_infiltrators_eliminated"
                      ? "lobbyExtra.reasonEliminated"
                      : view.winReason === "infiltrators_parity"
                        ? "lobbyExtra.reasonParity"
                        : "lobbyExtra.reasonSabotage",
                )
              : ""}
          </p>
          {view.scores ? (
            <ul className="ls-stack">
              {Object.entries(view.scores)
                .sort((a, b) => b[1].totalPoints - a[1].totalPoints)
                .map(([id, s]) => {
                  const p = view.players.find((pl) => pl.id === id);
                  return (
                    <li key={id} className="ls-row text-sm">
                      <span className="min-w-0 flex-1 truncate">{p?.displayName ?? id}</span>
                      <span>{t("lobbyExtra.scorePoints", { points: s.totalPoints })}</span>
                    </li>
                  );
                })}
            </ul>
          ) : null}
          {view.hostId === myId ? (
            <Button
              onClick={() => {
                void emitAck(socket, "room:rematch").catch(() => undefined);
              }}
            >
              {t("lobbyExtra.playAgain")}
            </Button>
          ) : (
            <p className="ls-text-secondary text-sm">{t("lobbyExtra.waitingHost")}</p>
          )}
          <Button variant="secondary" onClick={onExit}>
            {t("lobbyExtra.backToLobby")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
