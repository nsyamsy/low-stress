import { describe, expect, it } from "vitest";
import { RiotGameService } from "../server/service";
import {
  BLACKOUT_VISION_RADIUS_CREW,
  CRITICAL_ALARM_DURATION_MS,
  DOOR_LOCK_DURATION_MS,
  getEffectiveVisionRadius,
} from "../shared/sabotage";

describe("RT-31: Sabotage System", () => {
  it("enforces blackout vision reduction on server interest management", () => {
    const defaultVision = 8.0;

    // Normal vision without sabotage
    expect(getEffectiveVisionRadius("crew", null, defaultVision)).toBe(8.0);
    expect(getEffectiveVisionRadius("infiltrator", null, defaultVision)).toBe(8.0);

    // Vision during blackout
    const blackoutSabotage = {
      kind: "blackout" as const,
      startedAt: Date.now(),
      durationMs: 0,
      resolved: false,
      activatedSwitches: new Set<string>(),
    };
    expect(getEffectiveVisionRadius("crew", blackoutSabotage, defaultVision)).toBe(BLACKOUT_VISION_RADIUS_CREW);
    expect(getEffectiveVisionRadius("infiltrator", blackoutSabotage, defaultVision)).toBe(8.0);

    // Once resolved, normal vision restored
    blackoutSabotage.resolved = true;
    expect(getEffectiveVisionRadius("crew", blackoutSabotage, defaultVision)).toBe(8.0);
  });

  it("server interest management excludes players beyond blackout radius", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host", "room_sab_interest", { infiltratorCount: 1 });
    service.joinRoom(room.id, "p2", "Player 2");
    service.joinRoom(room.id, "p3", "Player 3");
    service.joinRoom(room.id, "p4", "Player 4");
    service.startGame(room.id, "p1");

    // Position p1 at (0, 0) and p2 at (5, 0)
    const p1Sim = room.simulation.getPlayer("p1")!;
    const p2Sim = room.simulation.getPlayer("p2")!;
    p1Sim.x = 0;
    p1Sim.y = 0;
    p2Sim.x = 5.0; // Distance = 5.0m
    p2Sim.y = 0;

    const p1 = room.players.get("p1")!;
    p1.role = "crew";
    const infiltrator = Array.from(room.players.values()).find((p) => p.role === "infiltrator")!;

    // In normal conditions with default 8m vision, p1 sees p2 (distance 5.0 <= 8.0)
    const normalSnapshot = service.getClientSnapshot(room.id, "p1", Date.now());
    expect(normalSnapshot?.p.some((tuple) => tuple[0] === "p2")).toBe(true);

    // Infiltrator triggers blackout
    const sabRes = service.triggerSabotage(room.id, infiltrator.id, "blackout", undefined, Date.now());
    expect(sabRes.success).toBe(true);

    // During blackout, crew vision is 3.5m. Distance 5.0m > 3.5m, so p2 is NOT in p1's snapshot!
    const blackoutSnapshot = service.getClientSnapshot(room.id, "p1", Date.now());
    expect(blackoutSnapshot?.p.some((tuple) => tuple[0] === "p2")).toBe(false);

    // Crew repairs blackout
    service.repairSabotage(room.id, "p1", "breaker_1", Date.now());
    const restoredSnapshot = service.getClientSnapshot(room.id, "p1", Date.now());
    expect(restoredSnapshot?.p.some((tuple) => tuple[0] === "p2")).toBe(true);
  });

  it("handles door locks and automatic unlocking after duration", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host", "room_doors");
    service.joinRoom(room.id, "p2", "Player 2");
    service.joinRoom(room.id, "p3", "Player 3");
    service.joinRoom(room.id, "p4", "Player 4");
    service.startGame(room.id, "p1");

    const infiltrator = Array.from(room.players.values()).find((p) => p.role === "infiltrator")!;
    const t0 = 100000;

    const res = service.triggerSabotage(room.id, infiltrator.id, "doors", "laboratory", t0);
    expect(res.success).toBe(true);
    expect(room.activeSabotage?.kind).toBe("doors");
    expect(room.activeSabotage?.resolved).toBe(false);

    // 5 seconds in: still locked
    service.processServerTick(room.id, t0 + 5000);
    expect(room.activeSabotage?.resolved).toBe(false);

    // At duration (10s): auto resolves
    service.processServerTick(room.id, t0 + DOOR_LOCK_DURATION_MS);
    expect(room.activeSabotage?.resolved).toBe(true);
  });

  it("handles critical alarm: dual-point disarm required; timer expiration leads to infiltrator win", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host", "room_crit_alarm");
    service.joinRoom(room.id, "p2", "Player 2");
    service.joinRoom(room.id, "p3", "Player 3");
    service.joinRoom(room.id, "p4", "Player 4");
    service.startGame(room.id, "p1");

    const infiltrator = Array.from(room.players.values()).find((p) => p.role === "infiltrator")!;
    const crew = Array.from(room.players.values()).find((p) => p.role === "crew")!;
    const t0 = 200000;

    // Trigger critical alarm
    const res = service.triggerSabotage(room.id, infiltrator.id, "critical_alarm", undefined, t0);
    expect(res.success).toBe(true);

    // Station 1 activated: still unresolved
    const rep1 = service.repairSabotage(room.id, crew.id, "station_cooling", t0 + 5000);
    expect(rep1.success).toBe(true);
    expect(rep1.resolved).toBe(false);
    expect(room.activeSabotage?.resolved).toBe(false);

    // If second station not activated within CRITICAL_ALARM_DURATION_MS (45s), infiltrators win
    const tickRes = service.processServerTick(room.id, t0 + CRITICAL_ALARM_DURATION_MS + 100);
    expect(tickRes.winResult).toBeDefined();
    expect(tickRes.winResult?.winner).toBe("infiltrator");
    expect(tickRes.winResult?.reason).toBe("infiltrators_critical_sabotage");
    expect(room.phase).toBe("finished");
    expect(room.winner).toBe("infiltrator");
  });

  it("critical alarm resolved when both stations are activated before countdown expires", () => {
    const service = new RiotGameService();
    const room = service.createRoom("p1", "Host", "room_crit_disarm");
    service.joinRoom(room.id, "p2", "Player 2");
    service.joinRoom(room.id, "p3", "Player 3");
    service.joinRoom(room.id, "p4", "Player 4");
    service.startGame(room.id, "p1");

    const infiltrator = Array.from(room.players.values()).find((p) => p.role === "infiltrator")!;
    const crew = Array.from(room.players.values()).find((p) => p.role === "crew")!;
    const t0 = 300000;

    service.triggerSabotage(room.id, infiltrator.id, "critical_alarm", undefined, t0);

    // First station activated
    service.repairSabotage(room.id, crew.id, "station_cooling", t0 + 1000);
    expect(room.activeSabotage?.resolved).toBe(false);

    // Second station activated
    const rep2 = service.repairSabotage(room.id, crew.id, "station_power", t0 + 2000);
    expect(rep2.success).toBe(true);
    expect(rep2.resolved).toBe(true);
    expect(room.activeSabotage?.resolved).toBe(true);

    // Timer expiration after resolve does NOT cause infiltrator win
    const tickRes = service.processServerTick(room.id, t0 + CRITICAL_ALARM_DURATION_MS + 100);
    expect(tickRes.winResult).toBeUndefined();
    expect(room.phase).toBe("playing");
  });
});
