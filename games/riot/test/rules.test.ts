import { describe, expect, it } from "vitest";
import {
  assignRoles,
  calculateInfiltratorCount,
  canTransitionPhase,
  evaluateWinCondition,
  type GameRuleState,
  type PlayerRuleState,
} from "../shared/rules";

describe("Riot Game Rules Engine & State Machine (RT-20)", () => {
  describe("Role Assignment (R3 Property Guarantees)", () => {
    it("throws error if player count is below minimum of 4", () => {
      expect(() => calculateInfiltratorCount(3)).toThrow(/MIN_PLAYERS_NOT_MET/);
    });

    it("ensures infiltratorCount < crewCount across all player scales: 4, 5, 12, 20, 32", () => {
      const counts = [4, 5, 12, 20, 32];
      for (const n of counts) {
        const inf = calculateInfiltratorCount(n);
        const crew = n - inf;
        expect(inf).toBeGreaterThanOrEqual(1);
        expect(inf).toBeLessThan(crew); // Strict invariant: infiltrators ALWAYS fewer than crew
      }
    });

    it("matches specific R3 default counts", () => {
      expect(calculateInfiltratorCount(4)).toBe(1); // ceil(4/6) = 1
      expect(calculateInfiltratorCount(5)).toBe(1); // ceil(5/6) = 1
      expect(calculateInfiltratorCount(12)).toBe(2); // ceil(12/6) = 2
      expect(calculateInfiltratorCount(20)).toBe(4); // ceil(20/6) = 4
      expect(calculateInfiltratorCount(32)).toBe(6); // ceil(32/6) = 6
    });

    it("clamps custom host infiltrator count within strict upper bound floor((N-1)/2)", () => {
      // For 4 players, max allowed is floor(3/2) = 1
      expect(calculateInfiltratorCount(4, 3)).toBe(1);

      // For 12 players, max allowed is floor(11/2) = 5
      expect(calculateInfiltratorCount(12, 5)).toBe(5);
      expect(calculateInfiltratorCount(12, 10)).toBe(5); // clamped

      // For 32 players, max allowed is floor(31/2) = 15
      expect(calculateInfiltratorCount(32, 15)).toBe(15);
      expect(calculateInfiltratorCount(32, 25)).toBe(15); // clamped
    });

    it("assigns exact role partition to player IDs with no duplicates or missing roles", () => {
      const pIds = Array.from({ length: 20 }, (_, i) => `p_${i + 1}`);
      const roles = assignRoles(pIds);

      expect(roles.size).toBe(20);
      let infCount = 0;
      let crewCount = 0;

      for (const [id, role] of roles.entries()) {
        expect(pIds).toContain(id);
        if (role === "infiltrator") infCount++;
        if (role === "crew") crewCount++;
      }

      expect(infCount).toBe(4);
      expect(crewCount).toBe(16);
      expect(infCount).toBeLessThan(crewCount);
    });
  });

  describe("Win Condition Evaluation", () => {
    function createMockState(
      crewAlive: number,
      infAlive: number,
      tasksCompleted = 0,
      tasksTotal = 10,
      criticalSabotage = false,
    ): GameRuleState {
      const players = new Map<string, PlayerRuleState>();
      for (let i = 0; i < crewAlive; i++) {
        players.set(`crew_${i}`, { id: `crew_${i}`, role: "crew", status: "alive" });
      }
      for (let i = 0; i < infAlive; i++) {
        players.set(`inf_${i}`, { id: `inf_${i}`, role: "infiltrator", status: "alive" });
      }

      return {
        phase: "playing",
        players,
        tasksCompleted,
        tasksTotal,
        criticalSabotageActive: criticalSabotage,
      };
    }

    it("declares crew winner when all infiltrators are eliminated", () => {
      const state = createMockState(5, 0);
      const res = evaluateWinCondition(state);
      expect(res).toEqual({
        winner: "crew",
        reason: "crew_infiltrators_eliminated",
      });
    });

    it("declares infiltrators winner when parity is reached (alive infiltrators >= alive crew)", () => {
      // 2 crew vs 2 infiltrators -> parity reached!
      const state = createMockState(2, 2);
      const res = evaluateWinCondition(state);
      expect(res).toEqual({
        winner: "infiltrator",
        reason: "infiltrators_parity",
      });
    });

    it("declares crew winner when all tasks are completed", () => {
      // 4 crew alive, 1 infiltrator alive, all 10 tasks completed
      const state = createMockState(4, 1, 10, 10);
      const res = evaluateWinCondition(state);
      expect(res).toEqual({
        winner: "crew",
        reason: "crew_all_tasks",
      });
    });

    it("declares infiltrator winner when critical sabotage timer expires", () => {
      const state = createMockState(4, 1, 0, 10, true);
      const res = evaluateWinCondition(state);
      expect(res).toEqual({
        winner: "infiltrator",
        reason: "infiltrators_critical_sabotage",
      });
    });

    it("returns null when game is ongoing and win conditions are not yet met", () => {
      const state = createMockState(4, 1, 3, 10);
      const res = evaluateWinCondition(state);
      expect(res).toBeNull();
    });
  });

  describe("State Machine Transitions", () => {
    it("permits standard game progression flow", () => {
      expect(canTransitionPhase("lobby", "playing")).toBe(true);
      expect(canTransitionPhase("playing", "meeting")).toBe(true);
      expect(canTransitionPhase("meeting", "voting")).toBe(true);
      expect(canTransitionPhase("voting", "playing")).toBe(true);
      expect(canTransitionPhase("playing", "finished")).toBe(true);
      expect(canTransitionPhase("finished", "lobby")).toBe(true);
    });

    it("rejects illegal transitions", () => {
      expect(canTransitionPhase("lobby", "voting")).toBe(false);
      expect(canTransitionPhase("lobby", "finished")).toBe(false);
      expect(canTransitionPhase("meeting", "lobby")).toBe(false);
      expect(canTransitionPhase("voting", "meeting")).toBe(false);
    });
  });
});
