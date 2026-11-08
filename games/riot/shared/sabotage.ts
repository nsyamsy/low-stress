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

export function normalizeSabotageRoomId(roomId: string): string {
  return roomId.trim().replace(/^room_/, "");
}

/**
 * Checks if a room's doors are currently locked by sabotage.
 * Supports both (roomId, activeSabotage, serverTime) and (activeSabotage, roomId, serverTime).
 */
export function isRoomDoorLocked(
  roomIdOrSabotage: string | ActiveSabotage | null | undefined,
  sabotageOrRoomId: ActiveSabotage | null | undefined | string,
  serverTime = Date.now(),
): boolean {
  let roomId: string | undefined;
  let activeSabotage: ActiveSabotage | null | undefined;

  if (typeof roomIdOrSabotage === "string") {
    roomId = roomIdOrSabotage;
    activeSabotage =
      typeof sabotageOrRoomId === "object" ? sabotageOrRoomId : null;
  } else if (typeof sabotageOrRoomId === "string") {
    activeSabotage = roomIdOrSabotage;
    roomId = sabotageOrRoomId;
  }

  if (
    !roomId ||
    !activeSabotage ||
    activeSabotage.kind !== "doors" ||
    activeSabotage.resolved ||
    !activeSabotage.targetRoom
  ) {
    return false;
  }
  if (
    normalizeSabotageRoomId(activeSabotage.targetRoom) !==
    normalizeSabotageRoomId(roomId)
  ) {
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
