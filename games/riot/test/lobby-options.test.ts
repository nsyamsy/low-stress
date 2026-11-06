import { describe, expect, it } from "vitest";
import { RiotGameService } from "../server/service";
import { DEFAULT_HOST_OPTIONS, sanitizeHostOptions } from "../shared/lobby";

describe("RT-33: Lobby and Host Options", () => {
  it("sanitizes host options within defined safety ranges", () => {
    const rawOptions = {
      infiltratorCount: 99, // Clamped to 3
      tasksPerPlayer: 0, // Clamped to 1
      playerSpeed: 100, // Clamped to 2.5
      visionRadius: 1, // Clamped to 4.0
      actionCooldownSeconds: 5, // Clamped to 10
      discussionDurationSeconds: 500, // Clamped to 120
      votingDurationSeconds: 5, // Clamped to 15
      emergencyMeetingsPerPlayer: 10, // Clamped to 5
    };

    const sanitized = sanitizeHostOptions(rawOptions);
    expect(sanitized.infiltratorCount).toBe(3);
    expect(sanitized.tasksPerPlayer).toBe(1);
    expect(sanitized.playerSpeed).toBe(2.5);
    expect(sanitized.visionRadius).toBe(4.0);
    expect(sanitized.actionCooldownSeconds).toBe(10);
    expect(sanitized.discussionDurationSeconds).toBe(120);
    expect(sanitized.votingDurationSeconds).toBe(15);
    expect(sanitized.emergencyMeetingsPerPlayer).toBe(5);
  });

  it("applies default host options when none provided", () => {
    const defaultOpts = sanitizeHostOptions();
    expect(defaultOpts).toEqual(DEFAULT_HOST_OPTIONS);
    expect(defaultOpts.infiltratorCount).toBe(1);
    expect(defaultOpts.tasksPerPlayer).toBe(3);
    expect(defaultOpts.playerSpeed).toBe(1.0);
    expect(defaultOpts.visionRadius).toBe(8.0);
  });

  it("allows host to update options in lobby but not in-game", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host", "room_opts_1");
    service.joinRoom(room.id, "p2", "Player 2");
    service.joinRoom(room.id, "p3", "Player 3");
    service.joinRoom(room.id, "p4", "Player 4");

    // Non-host cannot update options
    const nonHostRes = service.updateHostOptions(room.id, "p2", { tasksPerPlayer: 5 });
    expect(nonHostRes.success).toBe(false);
    expect(nonHostRes.reason).toBe("NOT_ROOM_HOST");

    // Host updates options in lobby
    const hostRes = service.updateHostOptions(room.id, "p1", { tasksPerPlayer: 5, infiltratorCount: 2 });
    expect(hostRes.success).toBe(true);
    expect(room.options.tasksPerPlayer).toBe(5);
    expect(room.options.infiltratorCount).toBe(2);

    // Start game
    service.startGame(room.id, "p1");
    expect(room.phase).toBe("playing");

    // Host cannot update options while game is running
    const midGameRes = service.updateHostOptions(room.id, "p1", { tasksPerPlayer: 1 });
    expect(midGameRes.success).toBe(false);
    expect(midGameRes.reason).toBe("CANNOT_CHANGE_OPTIONS_IN_GAME");
  });

  it("enforces minimum 4 players before allowing start", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host", "room_min_players");

    // 1 player (host only): fails
    const res1 = service.startGame(room.id, "p1");
    expect(res1.success).toBe(false);
    expect(res1.reason).toBe("MIN_PLAYERS_NOT_MET");

    // 2 players: fails
    service.joinRoom(room.id, "p2", "Player 2");
    const res2 = service.startGame(room.id, "p1");
    expect(res2.success).toBe(false);
    expect(res2.reason).toBe("MIN_PLAYERS_NOT_MET");

    // 3 players: fails
    service.joinRoom(room.id, "p3", "Player 3");
    const res3 = service.startGame(room.id, "p1");
    expect(res3.success).toBe(false);
    expect(res3.reason).toBe("MIN_PLAYERS_NOT_MET");

    // 4 players: succeeds
    service.joinRoom(room.id, "p4", "Player 4");
    const res4 = service.startGame(room.id, "p1");
    expect(res4.success).toBe(true);
    expect(room.phase).toBe("playing");
  });

  it("enforces hard player cap on room join", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host", "room_cap");

    // Set low hard cap for testing
    const originalCap = process.env.RIOT_HARD_CAP;
    process.env.RIOT_HARD_CAP = "5";

    try {
      service.joinRoom(room.id, "p2", "Player 2");
      service.joinRoom(room.id, "p3", "Player 3");
      service.joinRoom(room.id, "p4", "Player 4");
      const join5 = service.joinRoom(room.id, "p5", "Player 5");
      expect(join5.success).toBe(true);

      // 6th player rejected because hard cap of 5 reached
      const join6 = service.joinRoom(room.id, "p6", "Player 6");
      expect(join6.success).toBe(false);
      expect(join6.reason).toBe("ROOM_CAPACITY_REACHED");
    } finally {
      process.env.RIOT_HARD_CAP = originalCap;
    }
  });
});
