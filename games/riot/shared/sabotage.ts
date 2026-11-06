import type { PlayerRole } from "./rules";

export type SabotageKind = "blackout" | "doors" | "critical_alarm";

export const BLACKOUT_VISION_RADIUS_CREW = 3.5; // meters
export const DOOR_LOCK_DURATION_MS = 10_000; // 10s
export const CRITICAL_ALARM_DURATION_MS = 45_000; // 45s
export const SABOTAGE_COOLDOWN_MS = 30_000; // 30s

export interface ActiveSabotage {
  kind: SabotageKind;
  targetRoom?: string;
  startedAt: number;
  durationMs: number;
  resolved: boolean;
  activatedSwitches: Set<string>; // station IDs
}

export const CRITICAL_ALARM_STATIONS = [
  { id: "station_cooling", roomId: "cooling", x: 32, y: -25 },
  { id: "station_power", roomId: "power", x: 0, y: 0 },
] as const;

export const BLACKOUT_REPAIR_STATION = {
  id: "blackout_generator",
  roomId: "power",
  x: 0,
  y: 0,
};

/**
 * Returns effective vision radius for a player.
 * During blackout, crew vision collapses to 3.5m while infiltrators retain full 12.0m vision.
 */
export function getEffectiveVisionRadius(
  role: PlayerRole,
  activeSabotage: ActiveSabotage | null,
  normalVisionRadius = 12.0,
): number {
  if (activeSabotage && activeSabotage.kind === "blackout" && !activeSabotage.resolved) {
    if (role === "crew") {
      return BLACKOUT_VISION_RADIUS_CREW;
    }
  }
  return normalVisionRadius;
}

/**
 * Checks if a room's doors are currently locked by sabotage.
 */
export function isRoomDoorLocked(
  roomId: string,
  activeSabotage: ActiveSabotage | null,
  serverTime = Date.now(),
): boolean {
  if (!activeSabotage || activeSabotage.kind !== "doors" || activeSabotage.resolved) {
    return false;
  }
  if (activeSabotage.targetRoom !== roomId) {
    return false;
  }
  return serverTime - activeSabotage.startedAt < activeSabotage.durationMs;
}

/**
 * Validates critical alarm countdown.
 * Returns true if the timer has expired without resolution (infiltrator win).
 */
export function isCriticalAlarmExpired(
  activeSabotage: ActiveSabotage | null,
  serverTime = Date.now(),
): boolean {
  if (!activeSabotage || activeSabotage.kind !== "critical_alarm" || activeSabotage.resolved) {
    return false;
  }
  return serverTime - activeSabotage.startedAt >= activeSabotage.durationMs;
}
