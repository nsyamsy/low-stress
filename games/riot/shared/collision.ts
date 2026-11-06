import mapDataJson from "./collision.json";

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

export interface SpawnPoint {
  x: number;
  y: number;
}

export interface RoomDefinition {
  id: string;
  name: {
    id: string;
    en: string;
  };
  bounds: AABB;
  spawnPoints: SpawnPoint[];
}

export interface MapCollisionData {
  mapSize: {
    width: number;
    height: number;
  };
  rooms: RoomDefinition[];
  walls: AABB[];
}

export const MAP_DATA: MapCollisionData = mapDataJson as MapCollisionData;

/**
 * Circle to Axis-Aligned Bounding Box (AABB) intersection test.
 */
export function checkCircleAABBCollision(circle: Circle, box: AABB): boolean {
  const closestX = Math.max(box.minX, Math.min(circle.x, box.maxX));
  const closestY = Math.max(box.minY, Math.min(circle.y, box.maxY));

  const distanceX = circle.x - closestX;
  const distanceY = circle.y - closestY;

  return distanceX * distanceX + distanceY * distanceY < circle.radius * circle.radius;
}

/**
 * Check if a player (represented as a circle) collides with any wall.
 */
export function isPositionColliding(
  x: number,
  y: number,
  radius: number,
  walls: readonly AABB[] = MAP_DATA.walls,
): boolean {
  const circle: Circle = { x, y, radius };
  for (const wall of walls) {
    if (checkCircleAABBCollision(circle, wall)) {
      return true;
    }
  }
  return false;
}

/**
 * Resolves a single small step with wall sliding along orthogonal axes.
 */
function resolveSingleStep(
  current: { x: number; y: number },
  desired: { x: number; y: number },
  radius: number,
  walls: readonly AABB[],
): { x: number; y: number } {
  // If desired position is free, accept full movement
  if (!isPositionColliding(desired.x, desired.y, radius, walls)) {
    return { x: desired.x, y: desired.y };
  }

  // Try horizontal slide
  if (!isPositionColliding(desired.x, current.y, radius, walls)) {
    return { x: desired.x, y: current.y };
  }

  // Try vertical slide
  if (!isPositionColliding(current.x, desired.y, radius, walls)) {
    return { x: current.x, y: desired.y };
  }

  // Fully blocked, remain in current position
  return { x: current.x, y: current.y };
}

/**
 * Resolves movement with continuous collision detection (substepping) and wall sliding.
 * Prevents tunneling through thin walls.
 */
export function resolveMovement(
  current: { x: number; y: number },
  desired: { x: number; y: number },
  radius: number,
  walls: readonly AABB[] = MAP_DATA.walls,
): { x: number; y: number } {
  const dx = desired.x - current.x;
  const dy = desired.y - current.y;
  const dist = Math.hypot(dx, dy);

  if (dist < 1e-5) {
    return { x: current.x, y: current.y };
  }

  // Use substepping smaller than player radius to prevent tunneling
  const maxStep = Math.max(radius * 0.4, 0.1);
  const steps = Math.ceil(dist / maxStep);

  let curr = { x: current.x, y: current.y };
  for (let i = 1; i <= steps; i++) {
    const fraction = i / steps;
    const target = {
      x: current.x + dx * fraction,
      y: current.y + dy * fraction,
    };
    const next = resolveSingleStep(curr, target, radius, walls);
    if (Math.abs(next.x - curr.x) < 1e-5 && Math.abs(next.y - curr.y) < 1e-5) {
      // Cannot move any further in this direction
      break;
    }
    curr = next;
  }

  return curr;
}

/**
 * Returns which room contains the given coordinate, or null if in corridors / outside.
 */
export function getRoomAtPosition(
  x: number,
  y: number,
  rooms: readonly RoomDefinition[] = MAP_DATA.rooms,
): RoomDefinition | null {
  for (const room of rooms) {
    if (
      x >= room.bounds.minX &&
      x <= room.bounds.maxX &&
      y >= room.bounds.minY &&
      y <= room.bounds.maxY
    ) {
      return room;
    }
  }
  return null;
}

/**
 * Retrieve all spawn points across all rooms.
 */
export function getAllSpawnPoints(): SpawnPoint[] {
  return MAP_DATA.rooms.flatMap((room) => room.spawnPoints);
}

/**
 * Get deterministic spawn point by index.
 */
export function getSpawnPoint(index: number): SpawnPoint {
  const allSpawns = getAllSpawnPoints();
  if (allSpawns.length === 0) {
    return { x: 0, y: 0 };
  }
  const safeIndex = Math.abs(index) % allSpawns.length;
  return allSpawns[safeIndex]!;
}
