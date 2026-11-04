import { useEffect, useRef, useState } from "react";
import { translate } from "@low-stress/i18n";
import type { GameProps } from "@low-stress/sdk";
import { Button, Chip } from "@low-stress/ui";

import en from "../locales/en.json";
import id from "../locales/id.json";

const MESSAGES = { id, en };
const STAGE_SIZE = 320;

export default function Game({ locale, onScore, onExit }: GameProps) {
  const t = (key: string) => translate(locale, key, {}, MESSAGES[locale]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const styles = getComputedStyle(canvas);
    const surface = styles.getPropertyValue("--bg-surface").trim();
    const accent = styles.getPropertyValue("--accent").trim();

    context.fillStyle = surface;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = accent;
    context.beginPath();
    context.arc(
      canvas.width / 2,
      canvas.height / 2,
      Math.min(canvas.width, canvas.height) * 0.2 + score,
      0,
      Math.PI * 2,
    );
    context.fill();
  }, [score]);

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
      <canvas
        ref={canvasRef}
        className="ls-card"
        width={STAGE_SIZE}
        height={STAGE_SIZE}
        role="img"
        aria-label={t("stageLabel")}
      />
      <div className="ls-row">
        <Button onClick={() => setScore((current) => current + 1)}>
          {t("tap")}
        </Button>
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
