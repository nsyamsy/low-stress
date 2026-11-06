import { describe, expect, it } from "vitest";
import { RiotGameService } from "../server/service";
import { filterMessagesForViewer, resolveVotes, processChatMessage } from "../shared/meetings";

describe("RT-30: Meetings and Voting", () => {
  it("enforces emergency meeting limits per player", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host", "room_meet_1", { emergencyMeetingsPerPlayer: 1 });
    service.joinRoom(room.id, "p2", "Player 2");
    service.joinRoom(room.id, "p3", "Player 3");
    service.joinRoom(room.id, "p4", "Player 4");
    service.startGame(room.id, "p1");

    // First call succeeds
    const res1 = service.callEmergencyMeeting(room.id, "p1");
    expect(res1.success).toBe(true);
    expect(room.phase).toBe("meeting");

    // Conclude meeting to go back to playing
    service.advanceMeetingToVoting(room.id);
    service.concludeVoting(room.id);
    expect(room.phase).toBe("playing");

    // Second call from p1 fails because emergencyMeetingsRemaining is now 0
    const res2 = service.callEmergencyMeeting(room.id, "p1");
    expect(res2.success).toBe(false);
    expect(res2.reason).toBe("NO_EMERGENCY_MEETINGS_REMAINING");
  });

  it("restricts chat to meeting and voting phases", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host", "room_meet_chat");
    service.joinRoom(room.id, "p2", "Player 2");
    service.joinRoom(room.id, "p3", "Player 3");
    service.joinRoom(room.id, "p4", "Player 4");
    service.startGame(room.id, "p1");

    // Chat in playing phase is rejected
    const resLobby = service.sendChatMessage(room.id, "p1", "Hello team");
    expect(resLobby.success).toBe(false);
    expect(resLobby.reason).toBe("CHAT_ONLY_ALLOWED_IN_MEETING_OR_VOTING");

    // Start meeting
    service.callEmergencyMeeting(room.id, "p1");
    expect(room.phase).toBe("meeting");

    // Chat during meeting succeeds
    const resMeeting = service.sendChatMessage(room.id, "p1", "I saw something suspicious!");
    expect(resMeeting.success).toBe(true);
    expect(resMeeting.message?.body).toBe("I saw something suspicious!");
  });

  it("enforces max 300 characters, rate limiting, and profanity filtering", () => {
    const now = 100000;
    // 1. Max length
    const longMsg = "a".repeat(301);
    const longRes = processChatMessage("p1", "Alice", "alive", longMsg, 0, now);
    expect(longRes.valid).toBe(false);
    expect(longRes.reason).toBe("MESSAGE_TOO_LONG");

    // 2. Rate limiting (less than 1000ms apart)
    const fastRes = processChatMessage("p1", "Alice", "alive", "msg2", now - 500, now);
    expect(fastRes.valid).toBe(false);
    expect(fastRes.reason).toBe("RATE_LIMITED");

    // 3. Profanity filtering via @low-stress/sdk profanity
    const profanityRes = processChatMessage("p1", "Alice", "alive", "You are an idiot anjing", 0, now);
    expect(profanityRes.valid).toBe(true);
    expect(profanityRes.message?.body).not.toContain("anjing");
  });

  it("isolates ghost chat so alive players never receive messages from ghosts", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host", "room_ghost_chat");
    service.joinRoom(room.id, "p2", "Player 2");
    service.joinRoom(room.id, "p3", "Player 3");
    service.joinRoom(room.id, "p4", "Player 4");
    service.startGame(room.id, "p1");

    // Mark p2 as ghost
    const p2 = room.players.get("p2")!;
    p2.status = "ghost";

    // Call meeting
    service.callEmergencyMeeting(room.id, "p1");

    // Ghost p2 sends a message
    const ghostMsg = service.sendChatMessage(room.id, "p2", "I was eliminated in Reactor!", 10000);
    expect(ghostMsg.success).toBe(true);
    expect(ghostMsg.audience).toBe("ghosts_only");

    // Alive p1 sends a message
    const aliveMsg = service.sendChatMessage(room.id, "p1", "Where is everyone?", 10000);
    expect(aliveMsg.success).toBe(true);
    expect(aliveMsg.audience).toBe("all");

    // Check filterMessagesForViewer
    const messagesForAlive = filterMessagesForViewer(room.chatMessages, "alive");
    expect(messagesForAlive).toHaveLength(1);
    expect(messagesForAlive[0]?.senderId).toBe("p1");

    const messagesForGhost = filterMessagesForViewer(room.chatMessages, "ghost");
    expect(messagesForGhost).toHaveLength(2);
  });

  it("resolves voting correctly: single winner ejected, tie produces no ejection, skip produces no ejection", () => {
    const aliveIds = ["p1", "p2", "p3", "p4"];

    // Case 1: Single winner
    const votes1 = new Map<string, string | "skip">([
      ["p1", "p2"],
      ["p2", "p3"],
      ["p3", "p2"],
      ["p4", "p2"],
    ]);
    const res1 = resolveVotes(votes1, aliveIds);
    expect(res1.ejectedId).toBe("p2");
    expect(res1.isTie).toBe(false);
    expect(res1.skipped).toBe(false);

    // Case 2: Tie results in no ejection
    const votes2 = new Map<string, string | "skip">([
      ["p1", "p2"],
      ["p2", "p3"],
      ["p3", "p2"],
      ["p4", "p3"],
    ]);
    const res2 = resolveVotes(votes2, aliveIds);
    expect(res2.ejectedId).toBeNull();
    expect(res2.isTie).toBe(true);
    expect(res2.skipped).toBe(false);

    // Case 3: Skip vote wins results in no ejection
    const votes3 = new Map<string, string | "skip">([
      ["p1", "skip"],
      ["p2", "skip"],
      ["p3", "p2"],
      ["p4", "skip"],
    ]);
    const res3 = resolveVotes(votes3, aliveIds);
    expect(res3.ejectedId).toBeNull();
    expect(res3.isTie).toBe(false);
    expect(res3.skipped).toBe(true);
  });

  it("ejection of infiltrator can trigger crew win if no infiltrators remain", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host", "room_vote_win", { infiltratorCount: 1 });
    service.joinRoom(room.id, "p2", "Player 2");
    service.joinRoom(room.id, "p3", "Player 3");
    service.joinRoom(room.id, "p4", "Player 4");
    service.startGame(room.id, "p1");

    // Find the single infiltrator
    const infiltrator = Array.from(room.players.values()).find((p) => p.role === "infiltrator")!;
    const crewPlayers = Array.from(room.players.values()).filter((p) => p.role === "crew");

    const firstCrew = crewPlayers[0];
    expect(firstCrew).toBeDefined();
    service.callEmergencyMeeting(room.id, firstCrew!.id);
    service.advanceMeetingToVoting(room.id);

    // All players vote to eject the infiltrator
    for (const p of room.players.values()) {
      service.castVote(room.id, p.id, infiltrator.id);
    }

    expect(infiltrator.status).toBe("ghost");
    expect(room.phase).toBe("finished");
    expect(room.winner).toBe("crew");
    expect(room.winReason).toBe("crew_infiltrators_eliminated");
  });
});
