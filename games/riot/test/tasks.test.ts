import { describe, expect, it } from "vitest";
import { RiotGameService } from "../server/service";
import { STATION_TASKS, getTaskById, validateTaskCompletion } from "../shared/tasks";

describe("Riot Task Framework & Initial 3 Tasks (RT-22)", () => {
  it("defines exactly 3 initial station tasks with touch-friendly rules and realistic minimum durations", () => {
    expect(STATION_TASKS.length).toBe(3);
    const comms = getTaskById("comms_calibrate");
    const hydro = getTaskById("hydroponics_water");
    const cargo = getTaskById("cargo_sort");

    expect(comms).toBeDefined();
    expect(hydro).toBeDefined();
    expect(cargo).toBeDefined();

    expect(comms!.minDurationMs).toBeGreaterThanOrEqual(2000);
    expect(hydro!.minDurationMs).toBeGreaterThanOrEqual(2000);
    expect(cargo!.minDurationMs).toBeGreaterThanOrEqual(2000);
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

  it("accepts legitimate crew task completion within interaction range and proper duration", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host");
    service.joinRoom(room.id, "p2", "Bob");
    service.joinRoom(room.id, "p3", "Charlie");
    service.joinRoom(room.id, "p4", "David");
    service.startGame(room.id, "p1");

    // Find a crew member
    const crew = Array.from(room.players.values()).find((p) => p.role === "crew")!;
    const simPlayer = room.simulation.getPlayer(crew.id)!;
    simPlayer.x = -45;
    simPlayer.y = -5;

    const initialCompleted = room.tasksCompleted;

    const res = service.completeTask(room.id, crew.id, {
      taskId: "comms_calibrate",
      startedAt: 1000,
      completedAt: 4000,
      durationMs: 3000,
    });

    expect(res.success).toBe(true);
    expect(room.tasksCompleted).toBe(initialCompleted + 1);
    expect(crew.tasksCompleted).toBe(1);
  });
});
