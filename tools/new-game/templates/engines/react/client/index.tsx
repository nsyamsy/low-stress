import { useState } from "react";
import { translate } from "@low-stress/i18n";
import type { GameProps } from "@low-stress/sdk";
import { Button, Chip } from "@low-stress/ui";

import en from "../locales/en.json";
import id from "../locales/id.json";

const MESSAGES = { id, en };

export default function Game({ locale, onScore, onExit }: GameProps) {
  const t = (key: string) => translate(locale, key, {}, MESSAGES[locale]);
  const [score, setScore] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const [finished, setFinished] = useState(false);

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
