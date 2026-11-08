import { describe, expect, it } from "vitest";
import { RiotGameService } from "../server/service";
import {
  STATION_TASKS,
  getTaskById,
  validateTaskCompletion,
} from "../shared/tasks";
import { MAP_DATA } from "../shared/collision";

function taskLocation(taskId: string): { x: number; y: number } {
  const task = getTaskById(taskId)!;
  return task.location;
}

describe("Riot Task Framework (RT-22, RT-43: 10 tugas stasiun)", () => {
  it("defines 10 station tasks with touch-friendly rules and realistic minimum durations", () => {
    expect(STATION_TASKS.length).toBe(10);

    for (const task of STATION_TASKS) {
      expect(task.minDurationMs).toBeGreaterThanOrEqual(2000);
      expect(task.interactionRadius).toBeGreaterThanOrEqual(2);
      // Setiap lokasi tugas harus berada di dalam bounds ruangan yang dituju
      const room = MAP_DATA.rooms.find((r) => r.id === task.roomId);
      expect(room, `room ${task.roomId} untuk tugas ${task.id}`).toBeDefined();
      expect(task.location.x).toBeGreaterThanOrEqual(room!.bounds.minX);
      expect(task.location.x).toBeLessThanOrEqual(room!.bounds.maxX);
      expect(task.location.y).toBeGreaterThanOrEqual(room!.bounds.minY);
      expect(task.location.y).toBeLessThanOrEqual(room!.bounds.maxY);
      // Nama tugas tersedia di kedua bahasa
      expect(task.name.id.length).toBeGreaterThan(0);
      expect(task.name.en.length).toBeGreaterThan(0);
    }
  });

  it("covers every station room with at least one task", () => {
    const covered = new Set(STATION_TASKS.map((t) => t.roomId));
    for (const room of MAP_DATA.rooms) {
      expect(covered.has(room.id), `ruangan ${room.id} tanpa tugas`).toBe(true);
    }
  });

  it("rejects task completion when player is too far away (out of range)", () => {
    const task = getTaskById("comms_calibrate")!; // at (-45, -5)
    const farPlayerPos = { x: 0, y: 0 }; // 45m away

    const validation = validateTaskCompletion(task, farPlayerPos, {
      taskId: task.id,
      startedAt: 1000,
      completedAt: 4000,
      durationMs: 3000,
    });

    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe("TASK_OUT_OF_RANGE");
  });

  it("rejects task completion when completed unrealistically fast (speed hack / macro)", () => {
    const task = getTaskById("comms_calibrate")!; // requires >= 2000ms
    const nearbyPos = { x: -45, y: -5 };

    const validation = validateTaskCompletion(task, nearbyPos, {
      taskId: task.id,
      startedAt: 1000,
      completedAt: 1400,
      durationMs: 400, // only 400ms!
    });

    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe("TASK_COMPLETED_TOO_FAST");
  });

  it("rejects infiltrators attempting to complete crew tasks on the server", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host");
    service.joinRoom(room.id, "p2", "Bob");
    service.joinRoom(room.id, "p3", "Charlie");
    service.joinRoom(room.id, "p4", "David");
    service.startGame(room.id, "p1");

    // Find the infiltrator in this game
    const infiltrator = Array.from(room.players.values()).find((p) => p.role === "infiltrator")!;

    // Beri infiltrator tugas palsu agar lolos cek penugasan, lalu coba selesai
    const task = getTaskById("comms_calibrate")!;
    infiltrator.assignedTasks = [task.id];

    // Teleport infiltrator to task station for test
    const simPlayer = room.simulation.getPlayer(infiltrator.id)!;
    simPlayer.x = -45;
    simPlayer.y = -5;

    const res = service.completeTask(room.id, infiltrator.id, {
      taskId: "comms_calibrate",
      startedAt: 1000,
      completedAt: 4000,
      durationMs: 3000,
    });

    expect(res.success).toBe(false);
    expect(res.reason).toBe("INFILTRATOR_CANNOT_DO_CREW_TASK");
  });

  it("rejects tasks that were never assigned to the player", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host");
    service.joinRoom(room.id, "p2", "Bob");
    service.joinRoom(room.id, "p3", "Charlie");
    service.joinRoom(room.id, "p4", "David");
    service.startGame(room.id, "p1");

    const crew = Array.from(room.players.values()).find((p) => p.role === "crew")!;
    const unassigned = STATION_TASKS.map((t) => t.id).find(
      (id) => !crew.assignedTasks.includes(id),
    )!;
    const pos = taskLocation(unassigned);
    const simPlayer = room.simulation.getPlayer(crew.id)!;
    simPlayer.x = pos.x;
    simPlayer.y = pos.y;

    const res = service.completeTask(room.id, crew.id, {
      taskId: unassigned,
      startedAt: 1000,
      completedAt: 6000,
      durationMs: 5000,
    });

    expect(res.success).toBe(false);
    expect(res.reason).toBe("TASK_NOT_ASSIGNED");
  });

  it("rejects completing the same assigned task twice", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host");
    service.joinRoom(room.id, "p2", "Bob");
    service.joinRoom(room.id, "p3", "Charlie");
    service.joinRoom(room.id, "p4", "David");
    service.startGame(room.id, "p1");

    const crew = Array.from(room.players.values()).find((p) => p.role === "crew")!;
    const taskId = crew.assignedTasks[0]!;
    const pos = taskLocation(taskId);
    const simPlayer = room.simulation.getPlayer(crew.id)!;
    simPlayer.x = pos.x;
    simPlayer.y = pos.y;

    const proof = {
      taskId,
      startedAt: 1000,
      completedAt: 6000,
      durationMs: 5000,
    };
    expect(service.completeTask(room.id, crew.id, proof).success).toBe(true);

    const res = service.completeTask(room.id, crew.id, {
      ...proof,
      startedAt: 7000,
      completedAt: 12000,
      durationMs: 5000,
    });
    expect(res.success).toBe(false);
    expect(res.reason).toBe("TASK_ALREADY_DONE");
  });

  it("accepts legitimate crew task completion within interaction range and proper duration", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host");
    service.joinRoom(room.id, "p2", "Bob");
    service.joinRoom(room.id, "p3", "Charlie");
    service.joinRoom(room.id, "p4", "David");
    service.startGame(room.id, "p1");

    // Find a crew member and pakai tugas yang benar-benar ditugaskan
    const crew = Array.from(room.players.values()).find((p) => p.role === "crew")!;
    const taskId = crew.assignedTasks[0]!;
    const pos = taskLocation(taskId);
    const simPlayer = room.simulation.getPlayer(crew.id)!;
    simPlayer.x = pos.x;
    simPlayer.y = pos.y;

    const initialCompleted = room.tasksCompleted;

    const res = service.completeTask(room.id, crew.id, {
      taskId,
      startedAt: 1000,
      completedAt: 6000,
      durationMs: 5000,
    });

    expect(res.success).toBe(true);
    expect(room.tasksCompleted).toBe(initialCompleted + 1);
    expect(crew.tasksCompleted).toBe(1);
    expect(crew.completedTasks).toContain(taskId);
  });
});

describe("Riot rematch & reveal peran (RT-42 lanjutan)", () => {
  it("returnToLobby me-reset ronde dan hanya untuk host", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host");
    service.joinRoom(room.id, "p2", "Bob");
    service.joinRoom(room.id, "p3", "Charlie");
    service.joinRoom(room.id, "p4", "David");
    service.startGame(room.id, "p1");

    // Non-host ditolak
    expect(service.returnToLobby(room.id, "p2").success).toBe(false);
    // Host saat masih playing ditolak
    expect(service.returnToLobby(room.id, "p1").success).toBe(false);

    // Paksa selesai
    room.phase = "finished";
    room.winner = "crew";
    room.winReason = "crew_all_tasks";

    const res = service.returnToLobby(room.id, "p1");
    expect(res.success).toBe(true);
    expect(room.phase).toBe("lobby");
    for (const p of room.players.values()) {
      expect(p.role).toBe("crew");
      expect(p.status).toBe("alive");
      expect(p.assignedTasks).toEqual([]);
      expect(p.votedFor).toBeNull();
    }
    expect(room.tasksTotal).toBe(0);
    expect(room.winner).toBeNull();
  });

  it("view mengekspos ejectedRole hanya setelah voting selesai", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host");
    service.joinRoom(room.id, "p2", "Bob");
    service.joinRoom(room.id, "p3", "Charlie");
    service.joinRoom(room.id, "p4", "David");
    service.startGame(room.id, "p1");

    const infiltrator = Array.from(room.players.values()).find((p) => p.role === "infiltrator")!;

    // Selama playing: belum ada ejectedRole
    let view = service.getClientRoomView(room.id, "p1")!;
    expect(view.ejectedRole ?? null).toBeNull();

    // Simulasikan voting yang mengeluarkan penyusup
    room.phase = "voting";
    room.votes.set("p2", infiltrator.id);
    room.votes.set("p3", infiltrator.id);
    room.votes.set("p4", "skip");
    const crewVoter = Array.from(room.players.values()).find(
      (p) => p.role === "crew" && p.id !== infiltrator.id,
    )!;
    room.votes.set(crewVoter.id, infiltrator.id);

    // Picu resolusi via castVote terakhir? votes diisi manual; panggil resolve
    // melalui castVote agar state konsisten.
    room.votes.clear();
    service.castVote(room.id, "p2", infiltrator.id);
    service.castVote(room.id, "p3", infiltrator.id);
    service.castVote(room.id, "p4", "skip");
    service.castVote(room.id, crewVoter.id, infiltrator.id);

    view = service.getClientRoomView(room.id, "p1")!;
    expect(view.votingResult?.ejectedId).toBe(infiltrator.id);
    expect(view.ejectedRole).toBe("infiltrator");
  });
});
