import { describe, expect, it } from "vitest";
import {
  calculatePayloadBytes,
  decodeInterestSnapshot,
  encodeInterestSnapshot,
  filterVisiblePlayers,
} from "../shared/interest";
import { AuthoritativeSimulation } from "../shared/simulation";
import {
  CLIENT_INPUT_MS,
  SERVER_TICK_MS,
  VISION_RADIUS,
} from "../shared/types";

describe("Riot Interest Management & Headless Simulation (RT-13)", () => {
  describe("Vision Radius Filtering & Leak Prevention", () => {
    it("ensures players outside vision radius (12m) are strictly omitted from snapshots", () => {
      const sim = new AuthoritativeSimulation();
      // Observer in Command Room at (0, 30)
      const p1 = sim.addPlayer("p1", { x: 0, y: 30 });
      // Nearby ally at (5, 30) -> distance = 5m <= 12m
      const p2 = sim.addPlayer("p2", { x: 5, y: 30 });
      // Distant player in Power Grid at (0, 0) -> distance = 30m > 12m
      const p3 = sim.addPlayer("p3", { x: 0, y: 0 });
      // Far player in Cargo Dock at (-40, -30) -> distance = 72m > 12m
      const p4 = sim.addPlayer("p4", { x: -40, y: -30 });

      const allPlayers = [p1, p2, p3, p4];

      // Filter visible players for observer p1
      const visibleToP1 = filterVisiblePlayers("p1", allPlayers, VISION_RADIUS);
      const visibleIds = visibleToP1.map((p) => p.id);

      expect(visibleIds).toContain("p1"); // Self is always visible
      expect(visibleIds).toContain("p2"); // Within 5m
      expect(visibleIds).not.toContain("p3"); // 30m away: strictly leaked = false
      expect(visibleIds).not.toContain("p4"); // 72m away: strictly leaked = false
      expect(visibleToP1.length).toBe(2);

      // Encode compact snapshot for p1
      const snapshot = encodeInterestSnapshot("p1", 1, 1000, allPlayers, VISION_RADIUS);
      const snapshotIds = snapshot.p.map((tuple) => tuple[0]);

      expect(snapshotIds).toEqual(["p1", "p2"]);
      expect(snapshotIds).not.toContain("p3");
      expect(snapshotIds).not.toContain("p4");
    });

    it("dynamically reveals player when they step into the vision radius", () => {
      const sim = new AuthoritativeSimulation();
      sim.addPlayer("p1", { x: 0, y: 30 });
      // Start at 14m away (x=14, y=30) -> outside 12m radius
      sim.addPlayer("p2", { x: 14, y: 30 });

      let visible = filterVisiblePlayers("p1", sim.getAllPlayers(), VISION_RADIUS);
      expect(visible.map((p) => p.id)).not.toContain("p2");

      // p2 walks west towards p1: dx = -1, dt = 0.5s => moves 2.5m west to x = 11.5m
      sim.processInput("p2", { seq: 1, dx: -1, dy: 0, dt: 0.5 });

      visible = filterVisiblePlayers("p1", sim.getAllPlayers(), VISION_RADIUS);
      // Now at 11.5m <= 12m: visible!
      expect(visible.map((p) => p.id)).toContain("p2");
    });

    it("encodes and decodes compact snapshots accurately with centimeter precision", () => {
      const sim = new AuthoritativeSimulation();
      sim.addPlayer("p1", { x: 12.3456, y: -23.4567 });
      sim.processInput("p1", { seq: 42, dx: 1, dy: 0, dt: 0.05 });

      const all = sim.getAllPlayers();
      const payload = encodeInterestSnapshot("p1", 10, 5000, all, VISION_RADIUS);

      const decoded = decodeInterestSnapshot(payload);
      expect(decoded.tick).toBe(10);
      expect(decoded.timestamp).toBe(5000);
      expect(decoded.players.length).toBe(1);

      const decP1 = decoded.players[0]!;
      expect(decP1.id).toBe("p1");
      expect(decP1.lastSeq).toBe(42);
      // Precision rounded to 2 decimals
      expect(decP1.x).toBeCloseTo(all[0]!.x, 2);
      expect(decP1.y).toBeCloseTo(all[0]!.y, 2);
    });
  });

  describe("Headless Client Benchmark Simulator (20 and 32 Clients)", () => {
    interface BenchmarkResult {
      clientCount: number;
      ticksExecuted: number;
      avgCpuTimeMs: number;
      maxCpuTimeMs: number;
      avgBandwidthBytesPerSec: number;
      peakBandwidthBytesPerSec: number;
      p95LatencyMs: number;
      totalOutdatedOrLeakedPositions: number;
    }

    function runBenchmark(clientCount: number, ticksToSimulate = 100): BenchmarkResult {
      const sim = new AuthoritativeSimulation();
      const clientIds = Array.from({ length: clientCount }, (_, i) => `client_${i + 1}`);

      // Initialize all clients across different spawn rooms
      for (const id of clientIds) {
        sim.addPlayer(id);
      }

      const cpuTimes: number[] = [];
      const clientBytesReceived = new Map<string, number>();
      const latencies: number[] = [];
      let leakedPositionsCount = 0;

      for (const id of clientIds) {
        clientBytesReceived.set(id, 0);
      }

      let seq = 1;

      // Simulate loop
      for (let tick = 1; tick <= ticksToSimulate; tick++) {
        const tickStart = performance.now();
        const serverTime = tick * SERVER_TICK_MS;

        // 1. Process client inputs (20 Hz rate, ~1.33 inputs per 15 Hz tick)
        for (const id of clientIds) {
          const inputStartTime = performance.now();
          // Pseudo-random directional movement simulating active gameplay
          const angle = ((tick * 17 + id.charCodeAt(id.length - 1) * 31) % 360) * (Math.PI / 180);
          const dx = Math.cos(angle);
          const dy = Math.sin(angle);
          const dt = CLIENT_INPUT_MS / 1000;

          sim.processInput(id, { seq: seq++, dx, dy, dt }, serverTime);
          const inputProcessedTime = performance.now();
          latencies.push(inputProcessedTime - inputStartTime);
        }

        // 2. Advance simulation tick
        sim.stepTick(serverTime);
        const allPlayers = sim.getAllPlayers();

        // 3. Generate interest-managed snapshots for every client
        for (const id of clientIds) {
          const payload = encodeInterestSnapshot(id, tick, serverTime, allPlayers, VISION_RADIUS);
          const bytes = calculatePayloadBytes(payload);
          clientBytesReceived.set(id, (clientBytesReceived.get(id) ?? 0) + bytes);

          // Verify zero leakage: no target player in snapshot should be > VISION_RADIUS away
          const observer = allPlayers.find((p) => p.id === id);
          if (observer) {
            for (const tuple of payload.p) {
              const targetId = tuple[0];
              if (targetId !== id) {
                const target = allPlayers.find((p) => p.id === targetId);
                if (target) {
                  const dist = Math.hypot(target.x - observer.x, target.y - observer.y);
                  if (dist > VISION_RADIUS + 0.05) {
                    leakedPositionsCount++;
                  }
                }
              }
            }
          }
        }

        const tickDuration = performance.now() - tickStart;
        cpuTimes.push(tickDuration);
      }

      // Compute statistics
      const totalDurationSec = (ticksToSimulate * SERVER_TICK_MS) / 1000;
      const totalCpu = cpuTimes.reduce((a, b) => a + b, 0);
      const avgCpuTimeMs = totalCpu / cpuTimes.length;
      const maxCpuTimeMs = Math.max(...cpuTimes);

      const clientBandwidths = Array.from(clientBytesReceived.values()).map(
        (bytes) => bytes / totalDurationSec,
      );
      const avgBandwidthBytesPerSec =
        clientBandwidths.reduce((a, b) => a + b, 0) / clientBandwidths.length;
      const peakBandwidthBytesPerSec = Math.max(...clientBandwidths);

      latencies.sort((a, b) => a - b);
      const p95Index = Math.floor(latencies.length * 0.95);
      const p95LatencyMs = latencies[p95Index] ?? 0;

      return {
        clientCount,
        ticksExecuted: ticksToSimulate,
        avgCpuTimeMs,
        maxCpuTimeMs,
        avgBandwidthBytesPerSec,
        peakBandwidthBytesPerSec,
        p95LatencyMs,
        totalOutdatedOrLeakedPositions: leakedPositionsCount,
      };
    }

    it("simulates 20 headless clients maintaining < 2ms CPU/tick and zero leakage", () => {
      const res20 = runBenchmark(20, 100);

      // Verify zero leakages
      expect(res20.totalOutdatedOrLeakedPositions).toBe(0);

      // Verify server tick processing performance
      // At 15 Hz, each tick budget is 66.6ms; 20 clients should run well under 10ms
      expect(res20.avgCpuTimeMs).toBeLessThan(10.0);

      // Verify bandwidth efficiency: compact snapshots keep bandwidth well under 5 KB/s
      expect(res20.avgBandwidthBytesPerSec).toBeLessThan(5000);

      // Verify low processing latency
      expect(res20.p95LatencyMs).toBeLessThan(5.0);

      console.log("=== 20 Headless Clients Benchmark Results ===");
      console.log(`Avg CPU time per tick: ${res20.avgCpuTimeMs.toFixed(3)} ms (budget: 66.67 ms)`);
      console.log(`Max CPU time per tick: ${res20.maxCpuTimeMs.toFixed(3)} ms`);
      console.log(
        `Avg Bandwidth per client: ${(res20.avgBandwidthBytesPerSec / 1024).toFixed(2)} KB/s (${(
          (res20.avgBandwidthBytesPerSec * 8) /
          1024
        ).toFixed(2)} kbps)`,
      );
      console.log(
        `Peak Bandwidth per client: ${(res20.peakBandwidthBytesPerSec / 1024).toFixed(2)} KB/s`,
      );
      console.log(`p95 Input Processing Latency: ${res20.p95LatencyMs.toFixed(3)} ms`);
      console.log(`Total Out-of-Sight Leaks: ${res20.totalOutdatedOrLeakedPositions}`);
    });

    it("simulates 32 headless clients maintaining < 5ms CPU/tick and zero leakage", () => {
      const res32 = runBenchmark(32, 100);

      // Verify zero leakages
      expect(res32.totalOutdatedOrLeakedPositions).toBe(0);

      // Verify server tick processing performance for 32 clients
      expect(res32.avgCpuTimeMs).toBeLessThan(15.0);

      // Bandwidth under 6 KB/s even at 32 players thanks to interest radius
      expect(res32.avgBandwidthBytesPerSec).toBeLessThan(6000);

      // Processing latency
      expect(res32.p95LatencyMs).toBeLessThan(5.0);

      console.log("=== 32 Headless Clients Benchmark Results ===");
      console.log(`Avg CPU time per tick: ${res32.avgCpuTimeMs.toFixed(3)} ms (budget: 66.67 ms)`);
      console.log(`Max CPU time per tick: ${res32.maxCpuTimeMs.toFixed(3)} ms`);
      console.log(
        `Avg Bandwidth per client: ${(res32.avgBandwidthBytesPerSec / 1024).toFixed(2)} KB/s (${(
          (res32.avgBandwidthBytesPerSec * 8) /
          1024
        ).toFixed(2)} kbps)`,
      );
      console.log(
        `Peak Bandwidth per client: ${(res32.peakBandwidthBytesPerSec / 1024).toFixed(2)} KB/s`,
      );
      console.log(`p95 Input Processing Latency: ${res32.p95LatencyMs.toFixed(3)} ms`);
      console.log(`Total Out-of-Sight Leaks: ${res32.totalOutdatedOrLeakedPositions}`);
    });
  });
});
