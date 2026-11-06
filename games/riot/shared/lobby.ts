export const MIN_PLAYERS_TO_START = 4;
export const DEFAULT_RIOT_HARD_CAP = 32;
export const DISCONNECT_GRACE_PERIOD_MS = 60_000; // 60 seconds

export interface RiotHostOptions {
  infiltratorCount?: number;
  tasksPerPlayer: number;
  playerSpeed: number;
  visionRadius: number;
  actionCooldownSeconds: number;
  discussionDurationSeconds: number;
  votingDurationSeconds: number;
  emergencyMeetingsPerPlayer: number;
}

export const DEFAULT_HOST_OPTIONS: RiotHostOptions = {
  infiltratorCount: 1,
  tasksPerPlayer: 3,
  playerSpeed: 1.0,
  visionRadius: 8.0,
  actionCooldownSeconds: 25,
  discussionDurationSeconds: 30,
  votingDurationSeconds: 30,
  emergencyMeetingsPerPlayer: 1,
};

/**
 * Sanitizes and validates host options within safe operating limits per RT-33.
 * Ranges:
 * - Infiltrators: 1 - 3
 * - Tasks: 1 - 5
 * - Speed: 0.5 - 2.5
 * - Vision: 4.0 - 16.0
 * - Action cooldown: 10 - 60s
 * - Discussion duration: 15 - 120s
 * - Voting duration: 15 - 120s
 * - Emergency meetings: 1 - 5
 */
export function sanitizeHostOptions(raw: Partial<RiotHostOptions> = {}): RiotHostOptions {
  return {
    infiltratorCount:
      typeof raw.infiltratorCount === "number"
        ? Math.max(1, Math.min(3, Math.round(raw.infiltratorCount)))
        : DEFAULT_HOST_OPTIONS.infiltratorCount,
    tasksPerPlayer: Math.max(1, Math.min(5, Math.round(raw.tasksPerPlayer ?? DEFAULT_HOST_OPTIONS.tasksPerPlayer))),
    playerSpeed: Math.max(0.5, Math.min(2.5, raw.playerSpeed ?? DEFAULT_HOST_OPTIONS.playerSpeed)),
    visionRadius: Math.max(4.0, Math.min(16.0, raw.visionRadius ?? DEFAULT_HOST_OPTIONS.visionRadius)),
    actionCooldownSeconds: Math.max(
      10,
      Math.min(60, Math.round(raw.actionCooldownSeconds ?? DEFAULT_HOST_OPTIONS.actionCooldownSeconds)),
    ),
    discussionDurationSeconds: Math.max(
      15,
      Math.min(120, Math.round(raw.discussionDurationSeconds ?? DEFAULT_HOST_OPTIONS.discussionDurationSeconds)),
    ),
    votingDurationSeconds: Math.max(
      15,
      Math.min(120, Math.round(raw.votingDurationSeconds ?? DEFAULT_HOST_OPTIONS.votingDurationSeconds)),
    ),
    emergencyMeetingsPerPlayer: Math.max(
      1,
      Math.min(5, Math.round(raw.emergencyMeetingsPerPlayer ?? DEFAULT_HOST_OPTIONS.emergencyMeetingsPerPlayer)),
    ),
  };
}
