import { describe, expect, it } from "vitest";
import { RiotGameService } from "../server/service";
import { POINTS_PER_TASK, POINTS_WIN } from "../shared/scoring";
import { getTaskById } from "../shared/tasks";

describe("Riot Win/Loss Flow, Scoring & Bot Simulation (RT-24)", () => {
  it("simulates a full complete round where bots complete all crew tasks to victory", () => {
    const service = new RiotGameService();
    const room = service.createRoom("bot_1", "Alice");
    service.joinRoom(room.id, "bot_2", "Bob");
    service.joinRoom(room.id, "bot_3", "Charlie");
    service.joinRoom(room.id, "bot_4", "David");

    // Host starts the game
    const startRes = service.startGame(room.id, "bot_1");
    expect(startRes.success).toBe(true);
    expect(room.phase).toBe("playing");

    const crewMembers = Array.from(room.players.values()).filter((p) => p.role === "crew");
    const infiltrator = Array.from(room.players.values()).find((p) => p.role === "infiltrator")!;

    expect(crewMembers.length).toBe(3);
    expect(infiltrator).toBeDefined();

    // Total tasks = 3 crew * 3 tasks = 9 tasks
    expect(room.tasksTotal).toBe(9);
    expect(room.tasksCompleted).toBe(0);

    let currentTime = 1000;

    // Simulate each crew member moving to stations and completing tasks
    for (const crew of crewMembers) {
      const simPlayer = room.simulation.getPlayer(crew.id)!;

      for (const taskId of crew.assignedTasks) {
        const task = getTaskById(taskId)!;
        // 1. Move bot to task location
        simPlayer.x = task.location.x;
        simPlayer.y = task.location.y;

        // 2. Simulate human execution duration
        const duration = task.minDurationMs + 500;
        currentTime += duration;

        const completeRes = service.completeTask(room.id, crew.id, {
          taskId: task.id,
          startedAt: currentTime - duration,
          completedAt: currentTime,
          durationMs: duration,
        });

        expect(completeRes.success).toBe(true);
      }
    }

    // After all 9 tasks are completed:
    expect(room.tasksCompleted).toBe(9);
    expect(room.phase).toBe("finished");
    expect(room.winner).toBe("crew");
    expect(room.winReason).toBe("crew_all_tasks");

    // View results screen for Alice
    const finalView = service.getClientRoomView(room.id, "bot_1");
    expect(finalView).toBeDefined();
    expect(finalView!.phase).toBe("finished");
    expect(finalView!.winner).toBe("crew");
    expect(finalView!.winReason).toBe("crew_all_tasks");

    // On results screen, scores and points breakdown are populated
    expect(finalView!.scores).toBeDefined();

    // Each crew member receives POINTS_WIN (10) + 3 tasks * POINTS_PER_TASK (3) = 13 pts
    for (const crew of crewMembers) {
      const crewScore = finalView!.scores![crew.id];
      expect(crewScore).toBeDefined();
      expect(crewScore!.isWinner).toBe(true);
      expect(crewScore!.winPoints).toBe(POINTS_WIN);
      expect(crewScore!.taskPoints).toBe(3 * POINTS_PER_TASK);
      expect(crewScore!.totalPoints).toBe(POINTS_WIN + 3 * POINTS_PER_TASK);
    }

    // Infiltrator receives 0 points
    const infScore = finalView!.scores![infiltrator.id];
    expect(infScore!.isWinner).toBe(false);
    expect(infScore!.winPoints).toBe(0);
    expect(infScore!.totalPoints).toBe(0);
  });

  it("simulates a full complete round where infiltrator eliminates crew until parity victory", () => {
    const service = new RiotGameService();
    const room = service.createRoom("bot_1", "Alice");
    service.joinRoom(room.id, "bot_2", "Bob");
    service.joinRoom(room.id, "bot_3", "Charlie");
    service.joinRoom(room.id, "bot_4", "David");

    service.startGame(room.id, "bot_1");

    const crewMembers = Array.from(room.players.values()).filter((p) => p.role === "crew");
    const infiltrator = Array.from(room.players.values()).find((p) => p.role === "infiltrator")!;

    const target1 = crewMembers[0]!;
    const target2 = crewMembers[1]!;

    const infSim = room.simulation.getPlayer(infiltrator.id)!;
    const t1Sim = room.simulation.getPlayer(target1.id)!;
    const t2Sim = room.simulation.getPlayer(target2.id)!;

    let time = 100000;
    infiltrator.lastActionAt = 0;

    // Elimination 1: target 1
    infSim.x = 0;
    infSim.y = 0;
    t1Sim.x = 1.0;
    t1Sim.y = 0;

    const res1 = service.performInfiltratorAction(room.id, infiltrator.id, target1.id, time);
    expect(res1.success).toBe(true);
    expect(res1.winResult).toBeNull(); // Game continues (2 alive crew vs 1 infiltrator)

    // Wait for cooldown (25s)
    time += 26000;

    // Elimination 2: target 2
    infSim.x = 5.0;
    infSim.y = 5.0;
    t2Sim.x = 5.5;
    t2Sim.y = 5.0;

    const res2 = service.performInfiltratorAction(room.id, infiltrator.id, target2.id, time);
    expect(res2.success).toBe(true);

    // Parity achieved: 1 alive crew vs 1 alive infiltrator -> Infiltrators Win!
    expect(res2.winResult).toEqual({
      winner: "infiltrator",
      reason: "infiltrators_parity",
    });

    expect(room.phase).toBe("finished");
    expect(room.winner).toBe("infiltrator");
    expect(room.winReason).toBe("infiltrators_parity");

    const results = service.getClientRoomView(room.id, infiltrator.id);
    expect(results!.scores![infiltrator.id]!.winPoints).toBe(POINTS_WIN);
    expect(results!.scores![infiltrator.id]!.totalPoints).toBe(POINTS_WIN);
  });
});
