export type GamePhase = "lobby" | "playing" | "meeting" | "voting" | "finished";

export type PlayerRole = "crew" | "infiltrator";

export type PlayerStatus = "alive" | "ghost";

export type WinWinner = "crew" | "infiltrator";

export type WinReason =
  | "crew_all_tasks"
  | "crew_infiltrators_eliminated"
  | "infiltrators_parity"
  | "infiltrators_critical_sabotage";

export interface WinConditionResult {
  winner: WinWinner;
  reason: WinReason;
}

export interface PlayerRuleState {
  id: string;
  role: PlayerRole;
  status: PlayerStatus;
}

export interface GameRuleState {
  phase: GamePhase;
  players: Map<string, PlayerRuleState>;
  tasksTotal: number;
  tasksCompleted: number;
  criticalSabotageActive?: boolean;
}

/**
 * Calculates number of infiltrators following R3:
 * Default: Math.ceil(playerCount / 6)
 * Upper Bound: Math.floor((playerCount - 1) / 2)
 * Ensures infiltrators < crew at start for all N >= 4.
 */
export function calculateInfiltratorCount(playerCount: number, customCount?: number): number {
  if (playerCount < 4) {
    throw new Error("MIN_PLAYERS_NOT_MET: Minimum 4 players required");
  }

  const maxAllowed = Math.floor((playerCount - 1) / 2);
  const defaultCount = Math.ceil(playerCount / 6);

  if (typeof customCount === "number" && customCount > 0) {
    return Math.max(1, Math.min(customCount, maxAllowed));
  }

  return Math.max(1, Math.min(defaultCount, maxAllowed));
}

/**
 * Deterministically or randomly assigns secret roles to player IDs.
 */
export function assignRoles(
  playerIds: readonly string[],
  customInfiltratorCount?: number,
  rng: () => number = Math.random,
): Map<string, PlayerRole> {
  const count = playerIds.length;
  const infiltratorTarget = calculateInfiltratorCount(count, customInfiltratorCount);

  // Fisher-Yates shuffle
  const shuffled = [...playerIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = temp;
  }

  const roleMap = new Map<string, PlayerRole>();
  for (let i = 0; i < shuffled.length; i++) {
    const pId = shuffled[i]!;
    if (i < infiltratorTarget) {
      roleMap.set(pId, "infiltrator");
    } else {
      roleMap.set(pId, "crew");
    }
  }

  return roleMap;
}

/**
 * Evaluates whether a win condition is fulfilled.
 */
export function evaluateWinCondition(state: GameRuleState): WinConditionResult | null {
  // If game is in lobby, cannot evaluate win
  if (state.phase === "lobby") {
    return null;
  }

  // Critical sabotage countdown reached zero
  if (state.criticalSabotageActive) {
    return {
      winner: "infiltrator",
      reason: "infiltrators_critical_sabotage",
    };
  }

  let aliveCrew = 0;
  let aliveInfiltrators = 0;

  for (const player of state.players.values()) {
    if (player.status === "alive") {
      if (player.role === "infiltrator") {
        aliveInfiltrators++;
      } else {
        aliveCrew++;
      }
    }
  }

  // 1. Crew wins: All infiltrators have been eliminated / voted out
  if (aliveInfiltrators === 0) {
    return {
      winner: "crew",
      reason: "crew_infiltrators_eliminated",
    };
  }

  // 2. Infiltrators win: Parity achieved (alive infiltrators >= alive crew)
  if (aliveInfiltrators >= aliveCrew) {
    return {
      winner: "infiltrator",
      reason: "infiltrators_parity",
    };
  }

  // 3. Crew wins: All assigned tasks completed
  if (state.tasksTotal > 0 && state.tasksCompleted >= state.tasksTotal) {
    return {
      winner: "crew",
      reason: "crew_all_tasks",
    };
  }

  return null;
}

/**
 * Validates state machine phase transitions.
 */
export function canTransitionPhase(from: GamePhase, to: GamePhase): boolean {
  switch (from) {
    case "lobby":
      return to === "playing";
    case "playing":
      return to === "meeting" || to === "finished";
    case "meeting":
      return to === "voting" || to === "finished";
    case "voting":
      return to === "playing" || to === "finished";
    case "finished":
      return to === "lobby";
    default:
      return false;
  }
}
