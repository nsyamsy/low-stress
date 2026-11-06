import { describe, expect, it } from "vitest";
import { RiotGameService } from "../server/service";

describe("Riot Authoritative Server Loop & Role Isolation (RT-21)", () => {
  it("enforces secret role isolation: client room view NEVER leaks other players' roles", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "HostAlice");
    service.joinRoom(room.id, "p2", "Bob");
    service.joinRoom(room.id, "p3", "Charlie");
    service.joinRoom(room.id, "p4", "David");

    const startRes = service.startGame(room.id, "p1");
    expect(startRes.success).toBe(true);

    // Get client view for Player 1
    const p1View = service.getClientRoomView(room.id, "p1");
    expect(p1View).toBeDefined();
    expect(p1View!.myRole).toBeDefined(); // Player 1 knows their own role

    // In the public players list, role MUST NOT exist
    for (const p of p1View!.players) {
      expect((p as unknown as Record<string, unknown>)["role"]).toBeUndefined();
    }

    // Get client view for Player 2
    const p2View = service.getClientRoomView(room.id, "p2");
    expect(p2View!.myRole).toBeDefined();

    // Verify Player 1 cannot know Player 2's role from any room view field
    const p2PublicInP1View = p1View!.players.find((p) => p.id === "p2");
    expect(p2PublicInP1View).toBeDefined();
    expect((p2PublicInP1View as unknown as Record<string, unknown>)["role"]).toBeUndefined();
  });

  it("ensures snapshots contain only spatial/interest data with zero role information", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "HostAlice");
    service.joinRoom(room.id, "p2", "Bob");
    service.joinRoom(room.id, "p3", "Charlie");
    service.joinRoom(room.id, "p4", "David");
    service.startGame(room.id, "p1");

    const snapshot = service.getClientSnapshot(room.id, "p1");
    expect(snapshot).toBeDefined();

    // Snapshot tuple format: [id, x, y, vx, vy, heading, lastSeq]
    for (const tuple of snapshot!.p) {
      expect(tuple.length).toBe(7);
      expect(typeof tuple[0]).toBe("string"); // id
      expect(typeof tuple[1]).toBe("number"); // x
      expect(typeof tuple[2]).toBe("number"); // y
      // Roles ("crew" or "infiltrator") must not be present
      expect(tuple[0] !== "crew" && tuple[0] !== "infiltrator").toBe(true);
    }
  });

  it("cleans up expired rooms using computeExpirationCutoff", () => {
    const service = new RiotGameService();
    const r1 = service.createRoom("p1", "Alice", "room_old");
    // Artificially age the room by 2 days
    r1.updatedAt = Date.now() - 48 * 60 * 60 * 1000;

    service.createRoom("p2", "Bob", "room_fresh");

    expect(service.getAllRooms().length).toBe(2);

    // Clean up rooms older than 1 day
    const removed = service.cleanupExpiredRooms(1);
    expect(removed).toBe(1);

    expect(service.getRoom("room_old")).toBeUndefined();
    expect(service.getRoom("room_fresh")).toBeDefined();
  });
});
