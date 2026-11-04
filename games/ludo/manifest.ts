import type { GameManifest } from "@low-stress/sdk";

export const manifest: GameManifest = {
  id: "ludo",
  version: "0.1.0",
  title: {
    id: "Ludo",
    en: "Ludo",
  },
  description: {
    id: "Permainan papan multipemain santai untuk 2 hingga 12 pemain.",
    en: "Casual multiplayer board game for 2 to 12 players.",
  },
  icon: "icon.svg",
  mode: "multiplayer",
  mobile: {
    supported: true,
    orientation: "any",
  },
  client: () => import("./client"),
  permissions: ["realtime", "db"],
};

export default manifest;
