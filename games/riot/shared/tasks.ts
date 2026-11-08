export interface StationTaskDefinition {
  id: string;
  name: {
    id: string;
    en: string;
  };
  roomId: string;
  location: { x: number; y: number };
  interactionRadius: number; // meters
  minDurationMs: number; // minimum human execution time
}

export const STATION_TASKS: readonly StationTaskDefinition[] = [
  {
    id: "comms_calibrate",
    name: {
      id: "Kalibrasi Antena Komunikasi",
      en: "Calibrate Comms Array",
    },
    roomId: "comms",
    location: { x: -45, y: -5 },
    interactionRadius: 2.5,
    minDurationMs: 2000,
  },
  {
    id: "hydroponics_water",
    name: {
      id: "Kebun Hidroponik",
      en: "Water Hydroponics Bay",
    },
    roomId: "hydroponics",
    location: { x: -35, y: 25 },
    interactionRadius: 2.5,
    minDurationMs: 2500,
  },
  {
    id: "cargo_sort",
    name: {
      id: "Susun Kargo Dok",
      en: "Sort Cargo Bay Containers",
    },
    roomId: "cargo",
    location: { x: -32, y: -25 },
    interactionRadius: 2.5,
    minDurationMs: 3000,
  },
  {
    id: "command_align",
    name: {
      id: "Sejajarkan Konsole Komando",
      en: "Align Command Consoles",
    },
    roomId: "command",
    location: { x: 0, y: 33 },
    interactionRadius: 2.5,
    minDurationMs: 2500,
  },
  {
    id: "quarters_clean",
    name: {
      id: "Rapikan Kamar Kru",
      en: "Tidy Crew Quarters",
    },
    roomId: "quarters",
    location: { x: 0, y: -33 },
    interactionRadius: 2.5,
    minDurationMs: 2000,
  },
  {
    id: "cooling_purge",
    name: {
      id: "Bersihkan Sistem Pendingin",
      en: "Purge Cooling Loop",
    },
    roomId: "cooling",
    location: { x: 32, y: -30 },
    interactionRadius: 2.5,
    minDurationMs: 3500,
  },
  {
    id: "biolab_sample",
    name: {
      id: "Ambil Sampel Biolab",
      en: "Collect Biolab Sample",
    },
    roomId: "biolab",
    location: { x: 37, y: 25 },
    interactionRadius: 2.5,
    minDurationMs: 3000,
  },
  {
    id: "observation_scan",
    name: {
      id: "Pindai Kubah Observasi",
      en: "Scan Observation Dome",
    },
    roomId: "observation",
    location: { x: 45, y: -5 },
    interactionRadius: 2.5,
    minDurationMs: 2500,
  },
  {
    id: "power_balance",
    name: {
      id: "Seimbangkan Grid Daya",
      en: "Balance Power Grid",
    },
    roomId: "power",
    location: { x: 8, y: 8 },
    interactionRadius: 2.5,
    minDurationMs: 4000,
  },
  {
    id: "tunnels_inspect",
    name: {
      id: "Periksa Terowongan",
      en: "Inspect Maintenance Tunnels",
    },
    roomId: "tunnels",
    location: { x: -20, y: 0 },
    interactionRadius: 2.5,
    minDurationMs: 2000,
  },
] as const;

export function getTaskById(taskId: string): StationTaskDefinition | undefined {
  return STATION_TASKS.find((t) => t.id === taskId);
}

export interface TaskCompletionProof {
  taskId: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  checksum?: string;
}

/**
 * Validates task completion timing and interaction radius.
 */
export function validateTaskCompletion(
  task: StationTaskDefinition,
  playerPos: { x: number; y: number },
  proof: TaskCompletionProof,
): { valid: boolean; reason?: string } {
  // 1. Proximity check
  const dx = playerPos.x - task.location.x;
  const dy = playerPos.y - task.location.y;
  const dist = Math.hypot(dx, dy);

  if (dist > task.interactionRadius + 0.5) {
    return { valid: false, reason: "TASK_OUT_OF_RANGE" };
  }

  // 2. Minimum human duration check
  if (proof.durationMs < task.minDurationMs) {
    return { valid: false, reason: "TASK_COMPLETED_TOO_FAST" };
  }

  // 3. Timestamp consistency check
  if (proof.completedAt <= proof.startedAt) {
    return { valid: false, reason: "INVALID_TASK_TIMESTAMPS" };
  }

  return { valid: true };
}
