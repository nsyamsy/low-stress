import type { GameManifest } from "@low-stress/sdk";

export const manifest: GameManifest = {
  id: "riot",
  version: "0.1.0",
  title: {
    id: "Gaduh di Stasiun Hening",
    en: "Uproar on the Silent Station",
  },
  description: {
    id: "Game deduksi sosial 3D luar angkasa multipemain di Stasiun Orbital Hening.",
    en: "3D multiplayer social deduction space game on Silent Orbital Station.",
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
