import type { PlayerRole, PlayerStatus } from "./rules";

export const DEFAULT_ACTION_COOLDOWN_MS = 25_000; // 25 seconds
export const ELIMINATION_RANGE = 2.2; // meters
export const REPORT_RANGE = 2.5; // meters

export interface HologramMarker {
  id: string;
  victimId: string;
  x: number;
  y: number;
  createdAt: number;
  reported: boolean;
}

export interface InfiltratorActionContext {
  id: string;
  role: PlayerRole;
  status: PlayerStatus;
  pos: { x: number; y: number };
  lastActionAt: number;
}

export interface TargetActionContext {
  id: string;
  role: PlayerRole;
  status: PlayerStatus;
  pos: { x: number; y: number };
}

/**
 * Validates neutral elimination action by an infiltrator against a crew member.
 */
export function validateInfiltratorAction(
  infiltrator: InfiltratorActionContext,
  target: TargetActionContext,
  cooldownMs = DEFAULT_ACTION_COOLDOWN_MS,
  serverTime = Date.now(),
): { valid: boolean; reason?: string } {
  // 1. Role verification
  if (infiltrator.role !== "infiltrator") {
    return { valid: false, reason: "NOT_AN_INFILTRATOR" };
  }
  if (infiltrator.status !== "alive") {
    return { valid: false, reason: "CALLER_NOT_ALIVE" };
  }

  // 2. Target verification
  if (target.id === infiltrator.id) {
    return { valid: false, reason: "CANNOT_TARGET_SELF" };
  }
  if (target.status !== "alive") {
    return { valid: false, reason: "TARGET_NOT_ALIVE" };
  }
  if (target.role === "infiltrator") {
    return { valid: false, reason: "CANNOT_TARGET_FELLOW_INFILTRATOR" };
  }

  // 3. Cooldown check
  const timeSinceLastAction = serverTime - infiltrator.lastActionAt;
  if (timeSinceLastAction < cooldownMs) {
    return { valid: false, reason: "ACTION_ON_COOLDOWN" };
  }

  // 4. Proximity check
  const dx = infiltrator.pos.x - target.pos.x;
  const dy = infiltrator.pos.y - target.pos.y;
  const distance = Math.hypot(dx, dy);

  if (distance > ELIMINATION_RANGE) {
    return { valid: false, reason: "TARGET_OUT_OF_RANGE" };
  }

  return { valid: true };
}

/**
 * Creates a neutral hologram marker at victim position.
 */
export function createHologramMarker(
  victimId: string,
  pos: { x: number; y: number },
  serverTime = Date.now(),
): HologramMarker {
  return {
    id: `holo_${victimId}_${serverTime}`,
    victimId,
    x: Math.round(pos.x * 100) / 100,
    y: Math.round(pos.y * 100) / 100,
    createdAt: serverTime,
    reported: false,
  };
}

/**
 * Validates report proximity to a hologram marker.
 */
export function canReportHologram(
  playerPos: { x: number; y: number },
  marker: HologramMarker,
): boolean {
  if (marker.reported) return false;
  const dx = playerPos.x - marker.x;
  const dy = playerPos.y - marker.y;
  return Math.hypot(dx, dy) <= REPORT_RANGE;
}
