import type { GameManifest } from "@low-stress/sdk";

export const manifest: GameManifest = {
  id: "__GAME_ID__",
  version: "0.1.0",
  title: {
    id: "__GAME_TITLE__",
    en: "__GAME_TITLE__",
  },
  description: {
    id: "__GAME_DESCRIPTION_ID__",
    en: "__GAME_DESCRIPTION_EN__",
  },
  icon: "icon.svg",
  mode: "solo",
  mobile: {
    supported: true,
    orientation: "portrait",
  },
  scoring: {
    direction: "higher",
    minScore: 0,
    maxScore: 100000,
    maxScorePerSecond: 200,
    minDurationMs: 1000,
    maxDurationMs: 60 * 60 * 1000,
  },
  client: () => import("./client"),
  permissions: ["scores"],
};

export default manifest;
