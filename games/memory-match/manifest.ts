import type { GameManifest } from "@low-stress/sdk";

export const manifest: GameManifest = {
  id: "memory-match",
  version: "0.1.0",
  title: {
    id: "Memory Match",
    en: "Memory Match",
  },
  description: {
    id: "Uji daya ingatmu dengan mencocokkan 8 pasang kartu secepat mungkin.",
    en: "Test your memory by matching 8 pairs of cards as fast as possible.",
  },
  icon: "icon.svg",
  mode: "solo",
  mobile: {
    supported: true,
    orientation: "portrait",
  },
  scoring: {
    direction: "higher",
    minScore: 50,
    maxScore: 10000,
    minDurationMs: 2000,
    maxDurationMs: 2 * 60 * 60 * 1000,
    maxSubmitRatePerMin: 20,
    validate: (run) => {
      const r = run as { score: number; durationMs: number; moves?: number; combos?: number };
      if (r.moves !== undefined && r.moves < 8) return false;
      return true;
    },
  },
  client: () => import("./client"),
  permissions: ["scores"],
};

export default manifest;
