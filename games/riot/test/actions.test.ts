import { describe, expect, it } from "vitest";
import { RiotGameService } from "../server/service";

describe("Riot Neutral Infiltrator Actions & Hologram Markers (RT-23)", () => {
  it("allows infiltrator to eliminate nearby crew member, turning them to a ghost and dropping a hologram marker", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host");
    service.joinRoom(room.id, "p2", "Bob");
    service.joinRoom(room.id, "p3", "Charlie");
    service.joinRoom(room.id, "p4", "David");
    service.startGame(room.id, "p1");

    const infiltrator = Array.from(room.players.values()).find((p) => p.role === "infiltrator")!;
    const crew = Array.from(room.players.values()).find((p) => p.role === "crew")!;

    // Position them next to each other (1.0m apart)
    const infSim = room.simulation.getPlayer(infiltrator.id)!;
    const crewSim = room.simulation.getPlayer(crew.id)!;
    infSim.x = 0;
    infSim.y = 0;
    crewSim.x = 1.0;
    crewSim.y = 0;

    // Reset cooldown for test
    infiltrator.lastActionAt = 0;

    const res = service.performInfiltratorAction(room.id, infiltrator.id, crew.id, 100000);
    expect(res.success).toBe(true);
    expect(res.marker).toBeDefined();

    // Victim is now a ghost
    expect(crew.status).toBe("ghost");

    // Hologram marker dropped at victim position
    expect(res.marker!.victimId).toBe(crew.id);
    expect(res.marker!.x).toBeCloseTo(1.0, 2);
    expect(res.marker!.y).toBeCloseTo(0, 2);
    expect(res.marker!.reported).toBe(false);

    expect(room.hologramMarkers.length).toBe(1);
  });

  it("enforces action cooldown and rejects premature subsequent attacks", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host");
    service.joinRoom(room.id, "p2", "Bob");
    service.joinRoom(room.id, "p3", "Charlie");
    service.joinRoom(room.id, "p4", "David");
    service.startGame(room.id, "p1");

    const infiltrator = Array.from(room.players.values()).find((p) => p.role === "infiltrator")!;
    const crewList = Array.from(room.players.values()).filter((p) => p.role === "crew");
    const crew1 = crewList[0]!;
    const crew2 = crewList[1]!;

    const infSim = room.simulation.getPlayer(infiltrator.id)!;
    infSim.x = 0;
    infSim.y = 0;
    room.simulation.getPlayer(crew1.id)!.x = 0.5;
    room.simulation.getPlayer(crew1.id)!.y = 0;
    room.simulation.getPlayer(crew2.id)!.x = 0.5;
    room.simulation.getPlayer(crew2.id)!.y = 0;

    infiltrator.lastActionAt = 0;

    // First action at t = 100,000ms succeeds
    const res1 = service.performInfiltratorAction(room.id, infiltrator.id, crew1.id, 100000);
    expect(res1.success).toBe(true);

    // Attempt second action 5 seconds later (cooldown is 25 seconds)
    const res2 = service.performInfiltratorAction(room.id, infiltrator.id, crew2.id, 105000);
    expect(res2.success).toBe(false);
    expect(res2.reason).toBe("ACTION_ON_COOLDOWN");
  });

  it("rejects actions if target is out of range", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host");
    service.joinRoom(room.id, "p2", "Bob");
    service.joinRoom(room.id, "p3", "Charlie");
    service.joinRoom(room.id, "p4", "David");
    service.startGame(room.id, "p1");

    const infiltrator = Array.from(room.players.values()).find((p) => p.role === "infiltrator")!;
    const crew = Array.from(room.players.values()).find((p) => p.role === "crew")!;

    // 10 meters apart (> 2.2m range)
    room.simulation.getPlayer(infiltrator.id)!.x = 0;
    room.simulation.getPlayer(crew.id)!.x = 10;
    infiltrator.lastActionAt = 0;

    const res = service.performInfiltratorAction(room.id, infiltrator.id, crew.id, 100000);
    expect(res.success).toBe(false);
    expect(res.reason).toBe("TARGET_OUT_OF_RANGE");
  });

  it("allows discovering player to report a nearby hologram marker, calling emergency meeting", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host");
    service.joinRoom(room.id, "p2", "Bob");
    service.joinRoom(room.id, "p3", "Charlie");
    service.joinRoom(room.id, "p4", "David");
    service.startGame(room.id, "p1");

    // Add a hologram marker at (10, 10)
    room.hologramMarkers.push({
      id: "holo_victim_1",
      victimId: "victim_1",
      x: 10,
      y: 10,
      createdAt: Date.now(),
      reported: false,
    });

    const reporter = Array.from(room.players.values())[0]!;
    const reporterSim = room.simulation.getPlayer(reporter.id)!;

    // Reporter is 1.0m away from marker (within 2.5m range)
    reporterSim.x = 10.5;
    reporterSim.y = 10.0;

    expect(room.phase).toBe("playing");

    const reportRes = service.reportHologramMarker(room.id, reporter.id, "holo_victim_1");
    expect(reportRes.success).toBe(true);

    // Phase transitions immediately to meeting!
    expect(room.phase).toBe("meeting");
    expect(room.hologramMarkers[0]!.reported).toBe(true);
  });
});
