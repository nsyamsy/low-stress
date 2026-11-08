import { useEffect, useRef } from "react";
import type { Group, Material, Mesh, Scene, WebGLRenderer } from "three";
import type { RiotCharacterCustomization } from "../shared/character";
import { buildHumanoidAvatar } from "./characters/humanoid";
import { buildMochiAvatar } from "./characters/mochi";

interface AvatarPreviewProps {
  custom: RiotCharacterCustomization;
  size?: number;
  ghost?: boolean;
}

function disposeAvatarMaterials(group: Group): void {
  group.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (m && typeof (m as Material).dispose === "function") {
        (m as Material).dispose();
      }
    }
  });
}

/**
 * Preview 3D kecil untuk satu kustomisasi karakter (RT-42).
 * Memakai geometri/loader yang sama dengan render dunia. Renderer dibuat
 * sekali; hanya grup avatar yang dibangun ulang saat kustomisasi berubah.
 */
export function AvatarPreview({ custom, size = 96, ghost = false }: AvatarPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const avatarRef = useRef<Group | null>(null);

  // Renderer + scene + kamera + lampu (sekali per ukuran).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let renderer: WebGLRenderer | null = null;
    let raf = 0;

    void (async () => {
      const THREE = await import("three");
      if (cancelled) return;

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(size, size);
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      sceneRef.current = scene;
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
      camera.position.set(0, 1.1, 3.2);
      camera.lookAt(0, 0.9, 0);

      scene.add(new THREE.AmbientLight(0xffffff, 0.9));
      const key = new THREE.DirectionalLight(0xffffff, 1.6);
      key.position.set(2, 4, 3);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x88aaff, 0.5);
      rim.position.set(-2, 2, -2);
      scene.add(rim);

      const animate = () => {
        if (cancelled) return;
        raf = requestAnimationFrame(animate);
        if (avatarRef.current) avatarRef.current.rotation.y += 0.01;
        renderer!.render(scene, camera);
      };
      animate();
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (avatarRef.current) {
        sceneRef.current?.remove(avatarRef.current);
        disposeAvatarMaterials(avatarRef.current);
        avatarRef.current = null;
      }
      sceneRef.current = null;
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
      }
    };
  }, [size]);

  // Bangun ulang avatar saat kustomisasi berubah.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const avatar =
        custom.type === "mochi"
          ? await buildMochiAvatar(custom, { ghost })
          : await buildHumanoidAvatar(custom);
      if (cancelled || !sceneRef.current) {
        disposeAvatarMaterials(avatar);
        return;
      }
      if (avatarRef.current) {
        sceneRef.current.remove(avatarRef.current);
        disposeAvatarMaterials(avatarRef.current);
      }
      avatarRef.current = avatar;
      sceneRef.current.add(avatar);
    })();

    return () => {
      cancelled = true;
    };
  }, [custom, ghost]);

  return (
    <div
      ref={hostRef}
      role="img"
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="shrink-0"
    />
  );
}
