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
  const containerRef = useRef<HTMLDivElement>(null);
  const [startedAt] = useState(() => Date.now());
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let game: { destroy: (removeCanvas?: boolean) => void } | null = null;
    let cancelled = false;

    void (async () => {
      // Phaser hanya dimuat oleh game yang memakainya.
      const Phaser = (await import("phaser")).default;
      if (cancelled) return;

      const accent = getComputedStyle(container).getPropertyValue("--accent").trim();
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: container,
        width: STAGE_SIZE,
        height: STAGE_SIZE,
        backgroundColor: accent,
        scene: {
          create: () => {
            // Tambahkan scene game di sini.
          },
        },
      });
    })();

    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, []);

  const finish = () => {
    if (finished) return;
    setFinished(true);
    void onScore({ score: 0, durationMs: Date.now() - startedAt });
  };

  return (
    <div className="ls-card ls-stack">
      <div className="ls-row">
        <h1 className="ls-heading-2">{t("title")}</h1>
        <Chip tone="neutral">{t("subtitle")}</Chip>
      </div>
      <div
        ref={containerRef}
        className="ls-card"
        role="img"
        aria-label={t("stageLabel")}
      />
      <div className="ls-row">
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
