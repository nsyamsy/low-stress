import { describe, expect, it } from "vitest";
import {
  checkCircleAABBCollision,
  getAllSpawnPoints,
  getRoomAtPosition,
  getSpawnPoint,
  isPositionColliding,
  MAP_DATA,
  resolveMovement,
} from "../shared/collision";

describe("Riot Collision & Map (RT-11)", () => {
  it("defines between 9 and 11 original rooms (exactly 10 rooms)", () => {
    expect(MAP_DATA.rooms.length).toBeGreaterThanOrEqual(9);
    expect(MAP_DATA.rooms.length).toBeLessThanOrEqual(11);
    expect(MAP_DATA.rooms.length).toBe(10);
  });

  it("ensures every room has bilingual names, valid bounds, and spawn points", () => {
    for (const room of MAP_DATA.rooms) {
      expect(room.id).toBeTruthy();
      expect(room.name.id).toBeTruthy();
      expect(room.name.en).toBeTruthy();
      expect(room.bounds.minX).toBeLessThan(room.bounds.maxX);
      expect(room.bounds.minY).toBeLessThan(room.bounds.maxY);
      expect(room.spawnPoints.length).toBeGreaterThanOrEqual(2);

      // Verify each spawn point is within room bounds
      for (const sp of room.spawnPoints) {
        expect(sp.x).toBeGreaterThanOrEqual(room.bounds.minX);
        expect(sp.x).toBeLessThanOrEqual(room.bounds.maxX);
        expect(sp.y).toBeGreaterThanOrEqual(room.bounds.minY);
        expect(sp.y).toBeLessThanOrEqual(room.bounds.maxY);
      }
    }
  });

  it("has sufficient spawn points for up to 28-32 players", () => {
    const allSpawns = getAllSpawnPoints();
    expect(allSpawns.length).toBeGreaterThanOrEqual(28);
  });

  it("detects circle and AABB collision correctly", () => {
    const box = { minX: 10, minY: 10, maxX: 20, maxY: 20 };
    // Inside box
    expect(checkCircleAABBCollision({ x: 15, y: 15, radius: 1 }, box)).toBe(true);
    // Overlapping edge
    expect(checkCircleAABBCollision({ x: 9.5, y: 15, radius: 1 }, box)).toBe(true);
    // Clearly outside
    expect(checkCircleAABBCollision({ x: 5, y: 15, radius: 1 }, box)).toBe(false);
    expect(checkCircleAABBCollision({ x: 15, y: 25, radius: 1 }, box)).toBe(false);
  });

  it("blocks player when intersecting outer boundary wall or obstacle", () => {
    const radius = 0.8;
    // Outer wall north: y = 43 to 45
    expect(isPositionColliding(0, 44, radius)).toBe(true);
    // Outer wall south: y = -45 to -43
    expect(isPositionColliding(0, -44, radius)).toBe(true);
    // Center obstacle: x in [-2, 2], y in [0, 4]
    expect(isPositionColliding(0, 2, radius)).toBe(true);

    // Free corridor / open room: (0, 32) in command room
    expect(isPositionColliding(0, 32, radius)).toBe(false);
  });

  it("slides along walls when diagonal movement collides", () => {
    const radius = 0.8;
    // Moving towards north outer wall at y = 42.5 (wall starts at 43)
    const current = { x: 5, y: 41 };
    const desired = { x: 7, y: 43.5 }; // Desired Y hits wall at 43

    const resolved = resolveMovement(current, desired, radius);
    // X axis should move forward (slide), Y should be stopped before penetrating wall at 43 (radius 0.8 => max Y <= 42.2)
    expect(resolved.x).toBe(7);
    expect(resolved.y).toBeLessThanOrEqual(42.2);
    expect(resolved.y).toBeGreaterThan(41);
  });

  it("remains stationary when completely boxed in", () => {
    const radius = 0.8;
    // Custom tight wall surrounding point
    const tightWalls = [
      { minX: -2, minY: 1, maxX: 2, maxY: 3 }, // North
      { minX: -2, minY: -3, maxX: 2, maxY: -1 }, // South
      { minX: 1, minY: -2, maxX: 3, maxY: 2 }, // East
      { minX: -3, minY: -2, maxX: -1, maxY: 2 }, // West
    ];
    const current = { x: 0, y: 0 };
    const desired = { x: 5, y: 5 };
    const resolved = resolveMovement(current, desired, radius, tightWalls);
    expect(resolved).toEqual(current);
  });

  it("identifies room at given coordinates or null outside", () => {
    const cmd = getRoomAtPosition(0, 32);
    expect(cmd?.id).toBe("command");

    const hydro = getRoomAtPosition(-35, 25);
    expect(hydro?.id).toBe("hydroponics");

    const outside = getRoomAtPosition(0, 20); // Corridor between command and power
    expect(outside).toBeNull();
  });

  it("retrieves deterministic spawn points with index wrap", () => {
    const sp0 = getSpawnPoint(0);
    const spTotal = getAllSpawnPoints().length;
    const spWrap = getSpawnPoint(spTotal);
    expect(sp0).toEqual(spWrap);
  });
});
