import { describe, expect, it } from "vitest";
import {
  armAngle,
  autoMove,
  cellPoint,
  cpuMove,
  defaultPawns,
  EXIT_RULES,
  geometry,
  isExitRule,
  isPawnCharacter,
  legalPawns,
  letsOut,
  LUDO_COLORS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  move,
  newState,
  pawnPoint,
  PAWN_CHARACTERS,
  PAWNS,
  ringCell,
  ringIndex,
  roll,
  safeSquares,
  seatsFor,
  skip,
  startIndex,
  yardAngle,
  yardPoint,
} from "../shared/engine";

describe("P7-01: Ludo Shared Engine & 2-12 Players Geometry", () => {
  it("defines engine constants, 12 max players, and 12 unique colors", () => {
    expect(MIN_PLAYERS).toBe(2);
    expect(MAX_PLAYERS).toBe(12);
    expect(PAWNS).toBe(4);
    expect(PAWN_CHARACTERS).toHaveLength(8);
    expect(EXIT_RULES).toHaveLength(3);
    expect(LUDO_COLORS).toHaveLength(12);

    // Verify colors 10 (Lime) and 11 (Slate)
    expect(LUDO_COLORS[10].main).toBe("#84CC16");
    expect(LUDO_COLORS[10].dark).toBe("#4D7C0F");
    expect(LUDO_COLORS[11].main).toBe("#64748B");
    expect(LUDO_COLORS[11].dark).toBe("#334155");

    // All main colors are unique
    const mainColors = new Set(LUDO_COLORS.map((c) => c.main));
    expect(mainColors.size).toBe(12);
  });

  it("calculates defaultPawns for 2 to 12 players (11-12 players = 2 pawns)", () => {
    expect(defaultPawns(2)).toBe(4);
    expect(defaultPawns(4)).toBe(4);
    expect(defaultPawns(6)).toBe(4);
    expect(defaultPawns(7)).toBe(3);
    expect(defaultPawns(8)).toBe(3);
    expect(defaultPawns(9)).toBe(2);
    expect(defaultPawns(10)).toBe(2);
    expect(defaultPawns(11)).toBe(2);
    expect(defaultPawns(12)).toBe(2);
  });

  it("calculates seating for 2 to 12 players (2 players sit opposite each other)", () => {
    expect(seatsFor(2)).toEqual([0, 2]);
    expect(seatsFor(3)).toEqual([0, 1, 2]);
    expect(seatsFor(4)).toEqual([0, 1, 2, 3]);
    expect(seatsFor(12)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("verifies geometry properties and non-overlapping track cells for 2 to 12 players", () => {
    for (let p = 2; p <= 12; p++) {
      const g = geometry(p);
      const expectedArms = Math.max(4, p);
      expect(g.arms).toBe(expectedArms);
      expect(g.theta).toBeCloseTo(360 / expectedArms, 4);
      expect(g.hub).toBeGreaterThan(0);
      expect(g.yard).toBeGreaterThan(0);
      expect(g.yardRadius).toBeGreaterThan(g.hub);
      expect(g.length).toBeGreaterThanOrEqual(6);
      expect(g.ring).toBe(g.arms * (2 * g.length + 1));
      expect(g.homeCells).toBe(g.length - 1);
      expect(g.finalPos).toBe(g.ring + g.homeCells);

      // Verify safe squares count
      const safe = safeSquares(g);
      expect(safe.size).toBe(2 * g.arms);
      for (const sq of safe) {
        expect(sq).toBeGreaterThanOrEqual(0);
        expect(sq).toBeLessThan(g.ring);
      }

      // Verify every ring cell is unique and produces valid coordinate values
      const cellSet = new Set<string>();
      for (let idx = 0; idx < g.ring; idx++) {
        const cell = ringCell(g, idx);
        expect(cell.arm).toBeGreaterThanOrEqual(0);
        expect(cell.arm).toBeLessThan(g.arms);
        expect([0, 1, 2]).toContain(cell.col);
        expect(cell.row).toBeGreaterThanOrEqual(0);
        expect(cell.row).toBeLessThan(g.length);

        const key = `${cell.arm}:${cell.col}:${cell.row}`;
        expect(cellSet.has(key)).toBe(false);
        cellSet.add(key);

        const pt = cellPoint(g, cell);
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      }
      expect(cellSet.size).toBe(g.ring);

      // Verify yard point and angles
      for (let a = 0; a < g.arms; a++) {
        const yp = yardPoint(g, a);
        expect(Number.isFinite(yp.x)).toBe(true);
        expect(Number.isFinite(yp.y)).toBe(true);

        const aa = armAngle(g, a);
        const ya = yardAngle(g, a);
        expect(Number.isFinite(aa)).toBe(true);
        expect(Number.isFinite(ya)).toBe(true);

        // Verify pawnPoint at progress 0, track, home col, finalPos
        const pawnYard = pawnPoint(g, a, 0, 0);
        expect(Number.isFinite(pawnYard.x)).toBe(true);
        expect(Number.isFinite(pawnYard.y)).toBe(true);

        const pawnTrack = pawnPoint(g, a, 5, 0);
        expect(Number.isFinite(pawnTrack.x)).toBe(true);

        const pawnHomeCol = pawnPoint(g, a, g.ring + 2, 0);
        expect(Number.isFinite(pawnHomeCol.x)).toBe(true);

        const pawnFinal = pawnPoint(g, a, g.finalPos, 0);
        expect(Number.isFinite(pawnFinal.x)).toBe(true);
      }
    }
  });

  it("handles exit rules correctly (double, sixes, six)", () => {
    // double
    expect(letsOut([1, 1], "double")).toBe(true);
    expect(letsOut([6, 6], "double")).toBe(true);
    expect(letsOut([3, 5], "double")).toBe(false);
    expect(letsOut([6, 2], "double")).toBe(false);

    // sixes (only 6+6)
    expect(letsOut([6, 6], "sixes")).toBe(true);
    expect(letsOut([1, 1], "sixes")).toBe(false);
    expect(letsOut([6, 5], "sixes")).toBe(false);

    // six (any 6)
    expect(letsOut([6, 1], "six")).toBe(true);
    expect(letsOut([2, 6], "six")).toBe(true);
    expect(letsOut([6, 6], "six")).toBe(true);
    expect(letsOut([3, 4], "six")).toBe(false);
  });

  it("initializes state and legal pawn moves", () => {
    const s = newState(4, 4, "double", 1);
    expect(s.arms).toBe(4);
    expect(s.seats).toEqual([0, 1, 2, 3]);
    expect(s.pawns).toHaveLength(4);
    expect(s.pawns[0]).toEqual([0, 0, 0, 0]);
    expect(s.phase).toBe("roll");
    expect(s.turn).toBe(0);

    // Non-double roll: no pawns in yard can move
    const legalNonDouble = legalPawns(s, [1, 2]);
    expect(legalNonDouble).toEqual([]);

    // Double roll: all pawns in yard can move
    const legalDouble = legalPawns(s, [3, 3]);
    expect(legalDouble).toEqual([0, 1, 2, 3]);
  });

  it("rolls dice and passes turn when no legal moves", () => {
    const s = newState(2, 4, "double", 1);
    let call = 0;
    const rng = () => {
      call++;
      return call % 2 === 1 ? 0.2 : 0.5; // [2, 4]
    };
    const rolled = roll(s, rng);
    expect(rolled.dice).toBeNull(); // passed turn because no pawns can leave yard
    expect(rolled.turn).toBe(1); // passed to next seat
    expect(rolled.last?.kind).toBe("pass");
  });

  it("forfeits turn on 3 consecutive doubles", () => {
    const s = newState(2, 4, "double", 1);
    s.doubles = 2;
    // roll a double
    const rng = () => 0.5; // [4, 4]
    const rolled = roll(s, rng);
    expect(rolled.doubles).toBe(0);
    expect(rolled.turn).toBe(1);
    expect(rolled.last?.kind).toBe("doubles3");
  });

  it("moves a pawn out of the yard onto start square and captures opponent", () => {
    let s = newState(2, 2, "double", 1);
    const g = geometry(2);

    // Seat 0 rolls [2, 2] -> move pawn 0 out to start square (pos 1)
    s = { ...s, phase: "move", dice: [2, 2] };
    s = move(s, 0);
    expect(s.pawns[0]?.[0]).toBe(1); // on start square
    expect(s.phase).toBe("roll"); // double grants another roll

    // Place an opponent pawn ahead on the track
    const targetSquare = ringIndex(g, s.seats[0] ?? 0, 5);
    const s1Start = startIndex(g, s.seats[1] ?? 1);
    const pSeat1 = ((targetSquare - s1Start + g.ring) % g.ring) + 1;
    if (s.pawns[1]) s.pawns[1][0] = pSeat1;

    // Seat 0 rolls [1, 3] -> total 4, moves pawn 0 from 1 -> 5
    s = { ...s, phase: "move", dice: [1, 3] };
    const moved = move(s, 0);
    expect(moved.pawns[0]?.[0]).toBe(5);
    expect(moved.pawns[1]?.[0]).toBe(0); // opponent captured and sent back to yard!
    expect(moved.last?.kind).toBe("capture");
    expect(moved.phase).toBe("roll"); // capture grants extra roll
  });

  it("handles bouncing when overshooting final square without doubles", () => {
    let s = newState(2, 1, "double", 1);
    const g = geometry(2);
    // Put pawn at finalPos - 2
    s.pawns[0][0] = g.finalPos - 2;

    // Roll [2, 3] -> total 5. Over by 3.
    s = { ...s, phase: "move", dice: [2, 3], finish: "bounce" };
    const bounced = move(s, 0);
    // 2 * finalPos - raw = 2 * finalPos - (finalPos - 2 + 5) = finalPos - 3
    expect(bounced.pawns[0][0]).toBe(g.finalPos - 3);

    // Now roll double [1, 1] from finalPos - 1 -> reaches finalPos
    bounced.pawns[0][0] = g.finalPos - 1;
    const homed = move({ ...bounced, phase: "move", dice: [1, 1], turn: 0 }, 0);
    expect(homed.pawns[0][0]).toBe(g.finalPos);
    expect(homed.winner).toBe(0);
    expect(homed.place).toEqual([0, 1]);
  });

  it("cpuMove selects capture or progress pawn", () => {
    let s = newState(2, 2, "double", 1);
    s.pawns[0] = [1, 5];
    s = { ...s, phase: "move", dice: [2, 3] };
    const bestPawn = cpuMove(s);
    expect([0, 1]).toContain(bestPawn);
  });

  it("skip turn advances turn to next seat", () => {
    const s = newState(4, 2, "double", 1);
    expect(s.turn).toBe(0);
    const skipped = skip(s);
    expect(skipped.turn).toBe(1);
    expect(skipped.last?.kind).toBe("skip");
  });

  it("autoMove makes the move when all legal pawns are on same square", () => {
    let s = newState(2, 2, "double", 1);
    s = { ...s, phase: "move", dice: [3, 3] }; // both pawns in yard (pos 0)
    const res = autoMove(s);
    expect(res.phase).toBe("roll"); // moved automatically!
    expect(res.pawns[0][0]).toBe(1);
  });

  it("validates type guards for pawn characters and exit rules", () => {
    expect(isPawnCharacter("pin")).toBe(true);
    expect(isPawnCharacter("rocket")).toBe(true);
    expect(isPawnCharacter("invalid")).toBe(false);

    expect(isExitRule("double")).toBe(true);
    expect(isExitRule("sixes")).toBe(true);
    expect(isExitRule("six")).toBe(true);
    expect(isExitRule("other")).toBe(false);
  });

  it("documents simulated game length for 11 and 12 players", () => {
    // Run mini-simulation (5 games) to confirm 11 and 12 players complete smoothly
    for (const p of [11, 12]) {
      const pawns = defaultPawns(p);
      expect(pawns).toBe(2);

      let gamesCompleted = 0;
      for (let g = 0; g < 5; g++) {
        let state = newState(p, pawns, "double", 1);
        let turns = 0;
        while (state.winner === null && turns < 10000) {
          if (state.phase === "roll") {
            state = roll(state, Math.random);
            turns++;
          } else {
            state = move(state, cpuMove(state));
          }
        }
        if (state.winner !== null) gamesCompleted++;
      }
      expect(gamesCompleted).toBe(5);
    }
  });
});
