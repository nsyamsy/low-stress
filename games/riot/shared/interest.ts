import {
  type CompactPlayerSnapshot,
  type PlayerMovementState,
  type ServerTickSnapshot,
  VISION_RADIUS,
} from "./types";

/**
 * Compact tuple format for minimal serialization footprint:
 * [id, x, y, vx, vy, heading, lastSeq]
 */
export type CompactPlayerTuple = [
  id: string,
  x: number,
  y: number,
  vx: number,
  vy: number,
  heading: number,
  lastSeq: number,
];

export interface CompactSnapshotPayload {
  t: number; // tick number
  ts: number; // server timestamp (ms)
  p: CompactPlayerTuple[];
}

/**
 * Determines whether the observer can see a target position within Euclidean vision radius.
 */
export function canSeeTarget(
  observerPos: { x: number; y: number },
  targetPos: { x: number; y: number },
  visionRadius = VISION_RADIUS,
): boolean {
  const dx = targetPos.x - observerPos.x;
  const dy = targetPos.y - observerPos.y;
  return dx * dx + dy * dy <= visionRadius * visionRadius;
}

/**
 * Filters the list of players to only those visible to the given observer.
 * The observer themselves is always included.
 * Players outside visionRadius are completely omitted (zero data leakage).
 */
export function filterVisiblePlayers(
  observerId: string,
  allPlayers: readonly PlayerMovementState[],
  visionRadius = VISION_RADIUS,
): PlayerMovementState[] {
  const observer = allPlayers.find((p) => p.id === observerId);
  if (!observer) {
    return [];
  }

  const obsPos = { x: observer.x, y: observer.y };

  return allPlayers.filter((p) => {
    if (p.id === observerId) return true;
    return canSeeTarget(obsPos, { x: p.x, y: p.y }, visionRadius);
  });
}

/**
 * Encodes an observer-specific interest snapshot with compact numerical precision.
 * Positions are rounded to 2 decimals (1 cm precision), velocities to 1 decimal, heading to 2 decimals.
 */
export function encodeInterestSnapshot(
  observerId: string,
  tick: number,
  timestamp: number,
  allPlayers: readonly PlayerMovementState[],
  visionRadius = VISION_RADIUS,
): CompactSnapshotPayload {
  const visible = filterVisiblePlayers(observerId, allPlayers, visionRadius);

  const tuples: CompactPlayerTuple[] = visible.map((p) => [
    p.id,
    Math.round(p.x * 100) / 100,
    Math.round(p.y * 100) / 100,
    Math.round(p.vx * 10) / 10,
    Math.round(p.vy * 10) / 10,
    Math.round(p.heading * 100) / 100,
    p.lastProcessedSeq,
  ]);

  return {
    t: tick,
    ts: timestamp,
    p: tuples,
  };
}

/**
 * Decodes compact snapshot payload back to rich ServerTickSnapshot.
 */
export function decodeInterestSnapshot(
  payload: CompactSnapshotPayload,
): ServerTickSnapshot {
  const players: CompactPlayerSnapshot[] = payload.p.map((tuple) => ({
    id: tuple[0],
    x: tuple[1],
    y: tuple[2],
    vx: tuple[3],
    vy: tuple[4],
    heading: tuple[5],
    lastSeq: tuple[6],
  }));

  return {
    tick: payload.t,
    timestamp: payload.ts,
    players,
  };
}

/**
 * Calculates raw byte size of a payload when transmitted over JSON/WebSocket.
 */
export function calculatePayloadBytes(payload: CompactSnapshotPayload): number {
  const json = JSON.stringify(payload);
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(json).length;
  }
  return json.length;
}
