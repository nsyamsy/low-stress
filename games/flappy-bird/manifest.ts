import type { GameManifest } from "@low-stress/sdk";

export const manifest: GameManifest = {
  id: "flappy-bird",
  version: "0.1.0",
  title: {
    id: "Flappy Bird",
    en: "Flappy Bird",
  },
  description: {
    id: "Terbangkan burung melewati celah pipa hijau tanpa menabrak.",
    en: "Fly the bird through the green pipe gaps without crashing.",
  },
  icon: "icon.svg",
  mode: "solo",
  mobile: {
    supported: true,
    orientation: "portrait",
  },
  scoring: {
    direction: "higher",
    minScore: 1,
    maxScore: 500,
    minDurationMs: 0,
    maxDurationMs: 2 * 60 * 60 * 1000,
    maxSubmitRatePerMin: 30,
    validate: (run) => {
      if (run.score > 500) return false;
      const maxPossible = Math.floor(run.durationMs / 1000 / 0.85) + 1;
      return run.score <= maxPossible;
    },
  },
  client: () => import("./client"),
  permissions: ["scores"],
};

export default manifest;
