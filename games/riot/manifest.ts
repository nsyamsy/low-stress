import type { GameManifest } from "@low-stress/sdk";

export const manifest: GameManifest = {
  id: "riot",
  version: "0.1.0",
  title: {
    id: "Riot",
    en: "Riot",
  },
  description: {
    id: "Game deduksi sosial 3D luar angkasa multipemain.",
    en: "3D multiplayer social deduction space game.",
  },
  icon: "icon.svg",
  mode: "multiplayer",
  mobile: {
    supported: true,
    orientation: "any",
  },
  scoring: {
    direction: "higher",
    minScore: 0,
    maxScore: 1000,
  },
  client: () => import("./client"),
  permissions: ["scores", "realtime", "db"],
};

export default manifest;
