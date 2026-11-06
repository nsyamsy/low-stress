import { useEffect, useRef, useState } from "react";
import { translate } from "@low-stress/i18n";
import type { GameProps } from "@low-stress/sdk";
import { Button, Chip } from "@low-stress/ui";

import en from "../locales/en.json";
import id from "../locales/id.json";

const MESSAGES = { id, en };

export default function Game({ locale, onScore, onExit }: GameProps) {
  const t = (key: string) => translate(locale, key, {}, MESSAGES[locale]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [startedAt] = useState(() => Date.now());
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

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
      camera.position.z = 5;

      const threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      threeRenderer.setSize(width, height);
      container.appendChild(threeRenderer.domElement);
      renderer = threeRenderer;

      const geometry = new THREE.BoxGeometry(2, 2, 2);
      const material = new THREE.MeshStandardMaterial({ color: 0x4fc3f7 });
      const cube = new THREE.Mesh(geometry, material);
      scene.add(cube);

      const light = new THREE.DirectionalLight(0xffffff, 1.5);
      light.position.set(2, 4, 3);
      scene.add(light);
      scene.add(new THREE.AmbientLight(0xffffff, 0.5));

      const animate = () => {
        if (cancelled) return;
        animId = requestAnimationFrame(animate);
        cube.rotation.x += 0.01;
        cube.rotation.y += 0.015;
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
      </div>
      <p className="ls-text-secondary">{t("subtitle")}</p>
      <div
        ref={containerRef}
        className="w-full aspect-square max-w-sm mx-auto flex items-center justify-center overflow-hidden rounded-xl"
      />
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
