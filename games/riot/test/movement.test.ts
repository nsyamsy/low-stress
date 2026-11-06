import { describe, expect, it } from "vitest";
import {
  ClientPredictionManager,
  RemoteInterpolationManager,
} from "../client/prediction";
import { AuthoritativeSimulation } from "../shared/simulation";
import {
  CLIENT_INPUT_MS,
  MAX_PLAYER_SPEED,
  SERVER_TICK_MS,
} from "../shared/types";

describe("Riot Multiplayer Movement & Authoritative Simulation (RT-12)", () => {
  describe("Authoritative Server Simulation (15 Hz)", () => {
    it("spawns players at valid map positions with zero initial velocity", () => {
      const sim = new AuthoritativeSimulation();
      const p1 = sim.addPlayer("p1");
      const p2 = sim.addPlayer("p2");

      expect(p1.id).toBe("p1");
      expect(p1.vx).toBe(0);
      expect(p1.vy).toBe(0);
      expect(p1.lastProcessedSeq).toBe(0);

      // p1 and p2 should have different spawn points
      expect(p1.x !== p2.x || p1.y !== p2.y).toBe(true);
    });

    it("processes valid client inputs at 20 Hz (50ms dt) and updates velocity & position", () => {
      const sim = new AuthoritativeSimulation();
      sim.addPlayer("p1", { x: 0, y: 30 }); // Command room open area

      const dt = CLIENT_INPUT_MS / 1000; // 0.05s
      const res = sim.processInput("p1", {
        seq: 1,
        dx: 1, // moving east
        dy: 0,
        dt,
      });

      expect(res.accepted).toBe(true);
      expect(res.state).toBeDefined();

      const state = res.state!;
      expect(state.lastProcessedSeq).toBe(1);
      // Expected displacement: speed * dt = 5.0 * 0.05 = 0.25m
      expect(state.x).toBeCloseTo(0.25, 2);
      expect(state.y).toBeCloseTo(30, 2);
      expect(state.vx).toBeCloseTo(MAX_PLAYER_SPEED, 2);
      expect(state.vy).toBeCloseTo(0, 2);
      expect(state.heading).toBeCloseTo(0, 2);
    });

    it("rejects outdated or duplicate sequence numbers", () => {
      const sim = new AuthoritativeSimulation();
      sim.addPlayer("p1", { x: 0, y: 30 });

      const res1 = sim.processInput("p1", { seq: 5, dx: 0, dy: 1, dt: 0.05 });
      expect(res1.accepted).toBe(true);

      // Duplicate seq 5
      const res2 = sim.processInput("p1", { seq: 5, dx: 0, dy: 1, dt: 0.05 });
      expect(res2.accepted).toBe(false);
      expect(res2.reason).toBe("OUTDATED_SEQUENCE");

      // Older seq 3
      const res3 = sim.processInput("p1", { seq: 3, dx: 0, dy: 1, dt: 0.05 });
      expect(res3.accepted).toBe(false);
      expect(res3.reason).toBe("OUTDATED_SEQUENCE");
    });

    it("rejects invalid delta times (dt <= 0 or dt > 0.5s)", () => {
      const sim = new AuthoritativeSimulation();
      sim.addPlayer("p1", { x: 0, y: 30 });

      expect(sim.processInput("p1", { seq: 1, dx: 1, dy: 0, dt: 0 }).accepted).toBe(false);
      expect(sim.processInput("p1", { seq: 2, dx: 1, dy: 0, dt: -0.1 }).accepted).toBe(false);
      expect(sim.processInput("p1", { seq: 3, dx: 1, dy: 0, dt: 1.0 }).accepted).toBe(false);
    });

    it("rejects speed hack attempts exceeding maximum allowed speed", () => {
      const sim = new AuthoritativeSimulation();
      sim.addPlayer("p1", { x: 0, y: 30 });

      // Input with magnitude > 1.05
      const hackRes = sim.processInput("p1", {
        seq: 1,
        dx: 10, // speed hack attempt
        dy: 10,
        dt: 0.05,
      });

      expect(hackRes.accepted).toBe(false);
      expect(hackRes.reason).toBe("INPUT_MAGNITUDE_EXCEEDED");
    });

    it("enforces wall collision and prevents teleportation through obstacles", () => {
      const sim = new AuthoritativeSimulation();
      // Position player just 0.1m away from north wall (wall at y=43, radius=0.8, contact at y=42.2)
      sim.addPlayer("p1", { x: 0, y: 42.1 });

      // Player attempts to walk north directly into wall
      const res = sim.processInput("p1", {
        seq: 1,
        dx: 0,
        dy: 1,
        dt: 0.05,
      });

      expect(res.accepted).toBe(true);
      // Player should be stopped at or before wall threshold 42.2
      expect(res.state!.y).toBeLessThanOrEqual(42.2);
    });

    it("advances 15 Hz tick simulation and dampens velocity on idle players", () => {
      const sim = new AuthoritativeSimulation();
      sim.addPlayer("p1", { x: 0, y: 30 });

      const now = 100000;
      sim.processInput("p1", { seq: 1, dx: 1, dy: 0, dt: 0.05 }, now);

      // Immediately after input, velocity is positive
      const tick1 = sim.stepTick(now + SERVER_TICK_MS);
      expect(tick1.tick).toBe(1);
      expect(tick1.players[0]!.vx).toBeGreaterThan(0);

      // After 200ms of no input (> 150ms idle threshold), velocity dampens to 0
      const tick2 = sim.stepTick(now + 250);
      expect(tick2.tick).toBe(2);
      expect(tick2.players[0]!.vx).toBe(0);
      expect(tick2.players[0]!.vy).toBe(0);
    });
  });

  describe("Client Prediction & Reconciliation", () => {
    it("immediately predicts local movement and tracks pending input queue", () => {
      const prediction = new ClientPredictionManager(0, 30);
      expect(prediction.getPosition()).toEqual({ x: 0, y: 30, heading: 0 });
      expect(prediction.getPendingQueueLength()).toBe(0);

      // Apply 2 local inputs
      const input1 = prediction.applyInput(1, 0, 0.05);
      expect(input1.seq).toBe(1);
      expect(prediction.getPosition().x).toBeCloseTo(0.25, 2);
      expect(prediction.getPendingQueueLength()).toBe(1);

      const input2 = prediction.applyInput(1, 0, 0.05);
      expect(input2.seq).toBe(2);
      expect(prediction.getPosition().x).toBeCloseTo(0.5, 2);
      expect(prediction.getPendingQueueLength()).toBe(2);
    });

    it("reconciles server snapshots and replays unacknowledged inputs seamlessly", () => {
      const prediction = new ClientPredictionManager(0, 30);

      // Client performs 3 steps locally (seq 1, 2, 3)
      prediction.applyInput(1, 0, 0.05); // x: 0.25
      prediction.applyInput(1, 0, 0.05); // x: 0.50
      prediction.applyInput(1, 0, 0.05); // x: 0.75
      expect(prediction.getPendingQueueLength()).toBe(3);

      // Server acknowledges seq 2 with position x: 0.50
      prediction.reconcile({
        id: "local",
        x: 0.5,
        y: 30,
        vx: MAX_PLAYER_SPEED,
        vy: 0,
        heading: 0,
        lastSeq: 2,
      });

      // Seq 1 and 2 are removed, seq 3 replayed: final pos = 0.50 + 0.25 = 0.75
      expect(prediction.getPendingQueueLength()).toBe(1);
      expect(prediction.getPosition().x).toBeCloseTo(0.75, 2);
      expect(prediction.getPosition().y).toBeCloseTo(30, 2);
    });

    it("corrects prediction error when server reports wall collision", () => {
      const prediction = new ClientPredictionManager(0, 42.1);
      // Client aggressively predicted walking through wall
      prediction.applyInput(0, 1, 0.05);
      prediction.applyInput(0, 1, 0.05);

      // Server authoritative snapshot clamped at y: 42.15
      prediction.reconcile({
        id: "local",
        x: 0,
        y: 42.15,
        vx: 0,
        vy: 0,
        heading: Math.PI / 2,
        lastSeq: 2,
      });

      expect(prediction.getPendingQueueLength()).toBe(0);
      expect(prediction.getPosition().y).toBeCloseTo(42.15, 2);
    });
  });

  describe("Remote Player Interpolation", () => {
    it("interpolates smoothly between two server snapshot timestamps", () => {
      const remote = new RemoteInterpolationManager();
      const pId = "remote-1";

      // Snapshot at t = 1000ms: x = 10, y = 20
      remote.addSnapshot(pId, { id: pId, x: 10, y: 20, vx: 5, vy: 0, heading: 0, lastSeq: 1 }, 1000);
      // Snapshot at t = 1066ms: x = 10.33, y = 20
      remote.addSnapshot(pId, { id: pId, x: 10.33, y: 20, vx: 5, vy: 0, heading: 0, lastSeq: 2 }, 1066);

      // Midpoint render at t = 1033ms (t = 0.5)
      const mid = remote.getInterpolatedPosition(pId, 1033);
      expect(mid).toBeDefined();
      expect(mid!.x).toBeCloseTo(10.165, 2);
      expect(mid!.y).toBeCloseTo(20, 2);
    });

    it("interpolates heading smoothly across radian wrap boundaries", () => {
      const remote = new RemoteInterpolationManager();
      const pId = "remote-2";

      // Turning from 3.0 rad to -3.0 rad (crossing PI boundary)
      remote.addSnapshot(pId, { id: pId, x: 0, y: 0, vx: 0, vy: 0, heading: 3.0, lastSeq: 1 }, 1000);
      remote.addSnapshot(pId, { id: pId, x: 0, y: 0, vx: 0, vy: 0, heading: -3.0, lastSeq: 2 }, 1100);

      const mid = remote.getInterpolatedPosition(pId, 1050);
      expect(mid).toBeDefined();
      // Shortest angle turn crosses PI (~3.1415), so at t=0.5 heading should be near PI / -PI
      expect(Math.abs(mid!.heading)).toBeGreaterThan(3.0);
    });
  });
});
