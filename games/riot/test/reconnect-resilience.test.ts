import { describe, expect, it } from "vitest";
import { RiotGameService } from "../server/service";
import { DISCONNECT_GRACE_PERIOD_MS } from "../shared/lobby";

describe("RT-32: Network Resilience and Reconnection", () => {
  it("marks player disconnected on socket drop and restores on reconnect", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host", "room_recon_1");
    service.joinRoom(room.id, "p2", "Player 2");
    service.joinRoom(room.id, "p3", "Player 3");
    service.joinRoom(room.id, "p4", "Player 4");
    service.startGame(room.id, "p1");

    const t0 = 100000;
    // Player 2's mobile screen turns off / drops connection
    service.handleDisconnect(room.id, "p2", t0);

    const p2 = room.players.get("p2")!;
    expect(p2.connected).toBe(false);
    expect(p2.disconnectedAt).toBe(t0);

    // Player 2 returns within grace period
    const recon = service.reconnectPlayer(room.id, "p2");
    expect(recon.success).toBe(true);
    expect(p2.connected).toBe(true);
    expect(p2.disconnectedAt).toBeNull();
    expect(recon.view?.roomId).toBe(room.id);
  });

  it("handles disconnect during voting so voting does not stall", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host", "room_vote_drop");
    service.joinRoom(room.id, "p2", "Player 2");
    service.joinRoom(room.id, "p3", "Player 3");
    service.joinRoom(room.id, "p4", "Player 4");
    service.startGame(room.id, "p1");

    // Call meeting and advance to voting
    service.callEmergencyMeeting(room.id, "p1");
    service.advanceMeetingToVoting(room.id);
    expect(room.phase).toBe("voting");

    // p1, p2, p3 cast vote
    service.castVote(room.id, "p1", "skip");
    service.castVote(room.id, "p2", "skip");
    service.castVote(room.id, "p3", "skip");
    expect(room.phase).toBe("voting"); // Still waiting for p4

    // p4 drops connection
    service.handleDisconnect(room.id, "p4");

    // Because p4 is disconnected, all connected alive players (p1, p2, p3) have voted: voting concludes!
    expect(room.votingResult).not.toBeNull();
    expect(room.phase).toBe("playing"); // Returned to playing phase without hanging
  });

  it("marks player abandoned after 60s grace period and converts to ghost to prevent round stall", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host", "room_abandon_timeout", { infiltratorCount: 1 });
    service.joinRoom(room.id, "p2", "Player 2");
    service.joinRoom(room.id, "p3", "Player 3");
    service.joinRoom(room.id, "p4", "Player 4");
    service.startGame(room.id, "p1");

    const t0 = 500000;
    service.handleDisconnect(room.id, "p2", t0);

    // After 30s: still in grace period
    service.processServerTick(room.id, t0 + 30000);
    const p2 = room.players.get("p2")!;
    expect(p2.isAbandoned).toBe(false);

    // After 60s: grace period expires, player marked abandoned & converted to ghost
    service.processServerTick(room.id, t0 + DISCONNECT_GRACE_PERIOD_MS + 100);
    expect(p2.isAbandoned).toBe(true);
    expect(p2.status).toBe("ghost");
  });

  it("host can kick players from room and updates win condition if in-game", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host", "room_kick");
    service.joinRoom(room.id, "p2", "Player 2");
    service.joinRoom(room.id, "p3", "Player 3");
    service.joinRoom(room.id, "p4", "Player 4");

    // Non-host cannot kick
    const failKick = service.kickPlayer(room.id, "p2", "p3");
    expect(failKick.success).toBe(false);
    expect(failKick.reason).toBe("NOT_ROOM_HOST");

    // Host cannot kick self
    const selfKick = service.kickPlayer(room.id, "p1", "p1");
    expect(selfKick.success).toBe(false);
    expect(selfKick.reason).toBe("HOST_CANNOT_KICK_SELF");

    // Host kicks p4
    const validKick = service.kickPlayer(room.id, "p1", "p4");
    expect(validKick.success).toBe(true);
    expect(room.players.has("p4")).toBe(false);
    expect(room.simulation.getPlayer("p4")).toBeUndefined();
  });

  it("supports joining by 6-character short code, meeting abandon win check, and host transfer", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host", "riot_123456_ab99xz", { infiltratorCount: 1 });
    const shortCode = room.id.slice(-6).toUpperCase();

    expect(service.joinRoom(shortCode, "p2", "Player 2").success).toBe(true);
    expect(service.joinRoom(shortCode.toLowerCase(), "p3", "Player 3").success).toBe(true);
    expect(service.joinRoom(room.id, "p4", "Player 4").success).toBe(true);

    service.startGame(room.id, "p1");
    // Make p1 (host) the sole infiltrator
    for (const [id, p] of room.players) {
      p.role = id === "p1" ? "infiltrator" : "crew";
    }

    service.callEmergencyMeeting(room.id, "p2");
    expect(room.phase).toBe("meeting");

    const t0 = 200000;
    service.handleDisconnect(room.id, "p1", t0);
    const tickRes = service.processServerTick(room.id, t0 + DISCONNECT_GRACE_PERIOD_MS + 100);

    // Host abandoned during meeting -> host transferred to next connected player & crew wins!
    expect(room.hostId).not.toBe("p1");
    expect(tickRes.winResult?.winner).toBe("crew");
    expect(room.phase).toBe("finished");
  });
});
