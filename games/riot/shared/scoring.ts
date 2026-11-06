import type { PlayerRole, WinWinner } from "./rules";

export const POINTS_WIN = 10;
export const POINTS_PER_TASK = 1;
export const POINTS_CORRECT_VOTE = 2;

export interface PlayerRoundData {
  id: string;
  role: PlayerRole;
  tasksCompleted: number;
  correctVotes: number;
}

export interface PlayerScoreBreakdown {
  id: string;
  role: PlayerRole;
  isWinner: boolean;
  winPoints: number;
  taskPoints: number;
  votePoints: number;
  totalPoints: number;
}

/**
 * Calculates end-of-round scores strictly following R8 rules.
 */
export function calculateRoundScores(
  players: readonly PlayerRoundData[],
  winner: WinWinner,
): Map<string, PlayerScoreBreakdown> {
  const result = new Map<string, PlayerScoreBreakdown>();

  for (const player of players) {
    const isWinner = player.role === winner;
    const winPoints = isWinner ? POINTS_WIN : 0;
    const taskPoints = player.role === "crew" ? player.tasksCompleted * POINTS_PER_TASK : 0;
    const votePoints = player.correctVotes * POINTS_CORRECT_VOTE;
    const totalPoints = winPoints + taskPoints + votePoints;

    result.set(player.id, {
      id: player.id,
      role: player.role,
      isWinner,
      winPoints,
      taskPoints,
      votePoints,
      totalPoints,
    });
  }

  return result;
}
