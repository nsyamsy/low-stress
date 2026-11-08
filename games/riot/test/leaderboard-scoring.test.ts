import { describe, expect, it } from "vitest";
import {
  buildLeaderboardScoreEntries,
  matchRecordKey,
} from "../server/leaderboard";
import { RiotGameService } from "../server/service";
import { getTaskById } from "../shared/tasks";

/** Selesaikan satu ronde penuh lewat API service (bot uji). */
function finishRoundByTasks(service: RiotGameService, roomId: string) {
  const room = service.getRoom(roomId)!;
  const crewMembers = Array.from(room.players.values()).filter(
    (p) => p.role === "crew",
  );
  let now = 1000;
  for (const crew of crewMembers) {
    const simPlayer = room.simulation.getPlayer(crew.id)!;
    for (const taskId of crew.assignedTasks) {
      const task = getTaskById(taskId)!;
      simPlayer.x = task.location.x;
      simPlayer.y = task.location.y;
      const duration = task.minDurationMs + 500;
      now += duration;
      service.completeTask(roomId, crew.id, {
        taskId: task.id,
        startedAt: now - duration,
        completedAt: now,
        durationMs: duration,
      });
    }
  }
}

describe("RT-50: Poin ronde ke leaderboard generik", () => {
  it("membangun entri skor hanya untuk pemain berpoin dari room.scores server", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Alice");
    service.joinRoom(room.id, "p2", "Bob");
    service.joinRoom(room.id, "p3", "Charlie");
    service.joinRoom(room.id, "p4", "David");
    service.startGame(room.id, "p1");
    finishRoundByTasks(service, room.id);

    expect(room.phase).toBe("finished");
    const entries = buildLeaderboardScoreEntries(room, Date.now() + 1000);

    // Kru pemenang: 10 poin menang + 3 tugas = 13; penyusup 0 poin tidak dicatat.
    expect(entries.length).toBe(3);
    for (const entry of entries) {
      expect(entry.gameId).toBe("riot");
      expect(entry.score).toBe(13);
      expect(entry.durationMs).toBeGreaterThan(0);
    }
    const ids = entries.map((e) => e.userId);
    const infiltrator = Array.from(room.players.values()).find(
      (p) => p.role === "infiltrator",
    )!;
    expect(ids).not.toContain(infiltrator.id);
  });

  it("mengembalikan kosong sebelum ronde selesai (scores null)", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Alice");
    expect(buildLeaderboardScoreEntries(room)).toEqual([]);
  });

  it("kunci pencatatan berbeda antar ronde (rematch tercatat terpisah)", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Alice");
    const firstKey = matchRecordKey(room);
    service.joinRoom(room.id, "p2", "Bob");
    service.joinRoom(room.id, "p3", "Charlie");
    service.joinRoom(room.id, "p4", "David");
    service.startGame(room.id, "p1");
    const secondKey = matchRecordKey(room);
    expect(secondKey).not.toBe(firstKey);
    expect(secondKey).toContain(room.id);
  });
});
