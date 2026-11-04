// Rules and board geometry of the Ludo game. Pure functions only: the
// server keeps the state and rolls the dice, the board component draws from the
// same geometry, so the two can never disagree about where a square is.
//
// The board is the classic cross for up to 4 players (2 and 3 players sit on the same board). From 5
// players on it grows one arm per player; the arms get longer so every yard still fits between two arms.

export const PAWNS = 4;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;

/** Shapes a player can give their pawns. The colour always stays the player's own. */
export const PAWN_CHARACTERS = [
  "pin",
  "crown",
  "star",
  "cat",
  "robot",
  "heart",
  "ghost",
  "rocket",
] as const;
export type PawnCharacter = (typeof PAWN_CHARACTERS)[number];
export const isPawnCharacter = (v: unknown): v is PawnCharacter =>
  typeof v === "string" && (PAWN_CHARACTERS as readonly string[]).includes(v);

/** What lets a pawn out of the yard: any double, only a double six, or a six on either die. */
export const EXIT_RULES = ["double", "sixes", "six"] as const;
export type ExitRule = (typeof EXIT_RULES)[number];
export const isExitRule = (v: unknown): v is ExitRule =>
  typeof v === "string" && (EXIT_RULES as readonly string[]).includes(v);

/** 12 arm colors: 4 classic first, then 6 extended, plus 2 high-contrast additions (lime and slate). */
export const LUDO_COLORS: { main: string; dark: string }[] = [
  { main: "#E8383D", dark: "#A32226" }, // 0: Merah / Red
  { main: "#3FA535", dark: "#27701F" }, // 1: Hijau / Green
  { main: "#F9C910", dark: "#A8860A" }, // 2: Kuning / Yellow
  { main: "#2D7FE0", dark: "#1A57A3" }, // 3: Biru / Blue
  { main: "#F58220", dark: "#B35C10" }, // 4: Oranye / Orange
  { main: "#8E44AD", dark: "#5E2C73" }, // 5: Ungu / Purple
  { main: "#E5589A", dark: "#A1386B" }, // 6: Merah muda / Pink
  { main: "#17A2A2", dark: "#0F6E6E" }, // 7: Toska / Teal
  { main: "#8D5B3A", dark: "#5E3B24" }, // 8: Cokelat / Brown
  { main: "#5C6BC0", dark: "#3A4488" }, // 9: Nila / Indigo
  { main: "#84CC16", dark: "#4D7C0F" }, // 10: Lime / Lime
  { main: "#64748B", dark: "#334155" }, // 11: Abu-abu / Slate
];

export const IDLE_COLOR = { main: "#B4B2A9", dark: "#888780" };

export interface Geometry {
  arms: number;
  /** Degrees between two arms. */
  theta: number;
  /** Distance from the centre to where the arms start, in cells. */
  hub: number;
  /** Side of a yard, in cells. */
  yard: number;
  /** Distance from the centre to the middle of a yard, in cells. */
  yardRadius: number;
  /** Degrees a yard is turned from its arm: 0 on the classic board, half an arm on the bigger ones. */
  yardTurn: number;
  /** Length of an arm, in cells. */
  length: number;
  /** Squares on the shared track. */
  ring: number;
  /** Squares of a player's own home column. */
  homeCells: number;
  /** Progress value of a pawn that is home. */
  finalPos: number;
}

export function geometry(players: number): Geometry {
  const arms = Math.max(4, players);
  const theta = 360 / arms;
  const half = (theta / 2) * (Math.PI / 180);
  const hub = Math.max(1.5, 1.5 / Math.tan(half));
  const yard = arms === 4 ? 6 : 4.6;
  const sin = Math.sin(half);
  const cos = Math.cos(half);
  // On the classic board a yard lines up with its arm. From 5 players on, a yard is turned to face the gap
  // between two arms and moved out until even its corners clear the squares of both neighbouring arms
  // (an arm is 3 cells wide), so every start and star square stays visible.
  const turned = arms !== 4;
  const yardRadius = turned
    ? Math.max((1.5 + (yard / 2) * (sin + cos)) / sin, hub / cos + 0.8 + yard / 2)
    : (yard + 3) / (2 * sin);
  const reach = turned ? (yard / 2) * (cos + sin) : yard / 2;
  // the epsilon keeps 6.0000000000000004 from rounding up to 7 on the classic board
  const length = Math.max(6, Math.ceil(yardRadius * cos + reach - hub - 1e-9));
  const ring = arms * (2 * length + 1);
  const homeCells = length - 1;
  return {
    arms,
    theta,
    hub,
    yard,
    yardRadius,
    yardTurn: turned ? theta / 2 : 0,
    length,
    ring,
    homeCells,
    finalPos: ring + homeCells,
  };
}

/** The arms (colours) that are played: 2 players sit opposite each other, 3 take the first three arms. */
export function seatsFor(players: number): number[] {
  if (players === 2) return [0, 2];
  return Array.from({ length: players }, (_, i) => i);
}

export type Phase = "roll" | "move";

/** The two dice of a roll. */
export type Dice = [number, number];

export interface LastEvent {
  kind: "roll" | "move" | "capture" | "home" | "pass" | "skip" | "doubles3";
  /** Index into seats of whoever did it. */
  seat: number;
  dice?: Dice;
  captured?: number;
}

export interface LudoState {
  /** Arms of the board (geometry(players).arms). */
  arms: number;
  /** The arm of each player, in turn order. */
  seats: number[];
  /** Progress of every pawn per player: 0 = in the yard, 1 = on the start square ... finalPos = home. */
  pawns: number[][];
  turn: number;
  phase: Phase;
  dice: Dice | null;
  /** Doubles in a row in the current turn. */
  doubles: number;
  /** Rolls made so far; the board animates the dice whenever it grows. */
  rolls: number;
  winner: number | null;
  last: LastEvent | null;
  /** How a pawn leaves the yard; default "double". */
  exit?: ExitRule;
  /**
   * What a roll past the last square does. "bounce": a double gets the pawn home, any other roll counts the
   * extra steps back from the last square.
   */
  finish?: "pass" | "bounce";
  /** Players (indexes into seats) that got every pawn home, first to last. Complete once the game is over. */
  place?: number[];
  /** How many players must get home before the game ends; default 1. */
  goal?: number;
}

/**
 * Pawns per player when the host does not choose: fewer for bigger boards, whose track is longer.
 *
 * Game length simulation results (two dice, "double" exit rule, goal = 1):
 * - 4 players (4 pawns): ~42-54 rolls/player
 * - 6 players (4 pawns): ~70-112 rolls/player
 * - 8 players (3 pawns): ~76-131 rolls/player
 * - 10 players (2 pawns): ~71-99 rolls/player
 * - 11 players (2 pawns): ~116 rolls/player
 * - 12 players (2 pawns): ~144 rolls/player
 */
export const defaultPawns = (players: number): number =>
  players <= 6 ? PAWNS : players <= 8 ? 3 : 2;

export function newState(
  players: number,
  pawnsEach: number = defaultPawns(players),
  exit: ExitRule = "double",
  goal = 1,
): LudoState {
  const seats = seatsFor(players);
  return {
    arms: geometry(players).arms,
    seats,
    pawns: seats.map(() =>
      Array<number>(Math.min(PAWNS, Math.max(1, pawnsEach))).fill(0),
    ),
    turn: 0,
    phase: "roll",
    dice: null,
    doubles: 0,
    rolls: 0,
    winner: null,
    last: null,
    exit,
    finish: "bounce",
    place: [],
    goal: Math.min(Math.max(1, Math.trunc(goal) || 1), Math.max(1, players - 1)),
  };
}

const geo = (s: LudoState) => geometry(s.arms);
const perArm = (g: Geometry) => 2 * g.length + 1;

/** The track square a player's pawn first enters. */
export const startIndex = (g: Geometry, arm: number) => arm * perArm(g) + 2;

/** Track square of a pawn with progress p (1 ≤ p < ring). */
export const ringIndex = (g: Geometry, arm: number, p: number) =>
  (startIndex(g, arm) + p - 1) % g.ring;

const onRing = (g: Geometry, p: number) => p >= 1 && p < g.ring;

/** Start squares and one star square per arm are safe: nothing can be captured there. */
export function safeSquares(g: Geometry): Set<number> {
  const safe = new Set<number>();
  for (let a = 0; a < g.arms; a++) {
    safe.add(startIndex(g, a));
    safe.add((((a - 1 + g.arms) % g.arms) * perArm(g)) + 2 * g.length - 2);
  }
  return safe;
}

export const total = (dice: Dice) => dice[0] + dice[1];

/** Whether this roll lets a pawn out of the yard under the room's rule. */
export const letsOut = (dice: Dice, rule: ExitRule = "double") =>
  rule === "sixes"
    ? dice[0] === 6 && dice[1] === 6
    : rule === "six"
      ? dice[0] === 6 || dice[1] === 6
      : dice[0] === dice[1];

/**
 * Pawns of the player on turn that can move with this roll. The two dice are added and moved as one:
 * a pawn on the track always can; a roll past the last square gets it home or bounces it back (see move).
 */
export function legalPawns(state: LudoState, dice: Dice): number[] {
  const g = geo(state);
  const out: number[] = [];
  const currentPawns = state.pawns[state.turn];
  if (!currentPawns) return out;
  currentPawns.forEach((p, j) => {
    if (p === 0 ? letsOut(dice, state.exit) : p < g.finalPos) out.push(j);
  });
  return out;
}

/** The next player in turn order who has not finished yet. */
export function nextSeat(state: LudoState, from: number): number {
  const done = state.place ?? [];
  let seat = from;
  for (let i = 0; i < state.seats.length; i++) {
    seat = (seat + 1) % state.seats.length;
    if (!done.includes(seat)) return seat;
  }
  return from;
}

export function passTurn(
  state: LudoState,
  kind: "pass" | "skip" | "doubles3",
  dice?: Dice,
): LudoState {
  const seat = state.turn;
  return {
    ...state,
    turn: nextSeat(state, state.turn),
    phase: "roll",
    dice: null,
    doubles: 0,
    last: { kind, seat, dice },
  };
}

/** Rolls for the player on turn. `rng` returns [0, 1); the server passes Math.random or crypto. */
export function roll(state: LudoState, rng: () => number): LudoState {
  if (state.winner !== null || state.phase !== "roll") {
    throw new Error("Not the time to roll");
  }
  const dice: Dice = [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];
  const doubles = dice[0] === dice[1] ? state.doubles + 1 : 0;
  // a third double in a row forfeits the turn
  if (doubles === 3) {
    return passTurn({ ...state, rolls: (state.rolls ?? 0) + 1 }, "doubles3", dice);
  }
  const next = { ...state, dice, doubles, rolls: (state.rolls ?? 0) + 1 };
  if (legalPawns(next, dice).length === 0) return passTurn(next, "pass", dice);
  return { ...next, phase: "move", last: { kind: "roll", seat: state.turn, dice } };
}

/** Moves a pawn of the player on turn by the dice just rolled. */
export function move(state: LudoState, pawn: number): LudoState {
  if (state.winner !== null || state.phase !== "move" || state.dice === null) {
    throw new Error("Not the time to move");
  }
  if (!legalPawns(state, state.dice).includes(pawn)) {
    throw new Error("That pawn cannot move");
  }

  const g = geo(state);
  const dice = state.dice;
  const pawns = state.pawns.map((row) => [...row]);
  const mine = pawns[state.turn];
  if (!mine) throw new Error("Invalid turn state");
  const currentPos = mine[pawn];
  if (currentPos === undefined) throw new Error("Invalid pawn index");

  const raw = currentPos === 0 ? 1 : currentPos + total(dice);
  let to = raw;
  if (raw > g.finalPos) {
    // a double gets the pawn home; with two different numbers the extra steps bounce it back (never out of its own column)
    to =
      state.finish === "bounce" && dice[0] !== dice[1]
        ? Math.max(g.ring, 2 * g.finalPos - raw)
        : g.finalPos;
  }
  mine[pawn] = to;

  let captured = 0;
  if (onRing(g, to)) {
    const seatArm = state.seats[state.turn];
    if (seatArm !== undefined) {
      const square = ringIndex(g, seatArm, to);
      if (!safeSquares(g).has(square)) {
        pawns.forEach((row, seat) => {
          if (seat === state.turn) return;
          const otherSeatArm = state.seats[seat];
          if (otherSeatArm === undefined) return;
          row.forEach((p, j) => {
            if (onRing(g, p) && ringIndex(g, otherSeatArm, p) === square) {
              row[j] = 0;
              captured++;
            }
          });
        });
      }
    }
  }

  const home = to === g.finalPos;
  const base = { ...state, pawns, dice: null };
  if (mine.every((p) => p === g.finalPos)) {
    const place = [...(state.place ?? []), state.turn];
    const left = state.seats.length - place.length;
    const last: LastEvent = { kind: "home", seat: state.turn, dice };
    if (place.length >= (state.goal ?? 1) || left <= 1) {
      // the game is over: whoever is still playing is ranked by how far their pawns got
      const rest = state.seats
        .map((_, seat) => seat)
        .filter((seat) => !place.includes(seat))
        .sort((a, b) => {
          const rowB = pawns[b] ?? [];
          const rowA = pawns[a] ?? [];
          return (
            rowB.reduce((n, p) => n + p, 0) - rowA.reduce((n, p) => n + p, 0)
          );
        });
      const winner = place[0] ?? null;
      return {
        ...base,
        phase: "roll",
        place: [...place, ...rest],
        winner,
        last,
      };
    }
    return {
      ...base,
      place,
      turn: nextSeat({ ...state, place }, state.turn),
      phase: "roll",
      doubles: 0,
      last,
    };
  }
  const kind = captured > 0 ? "capture" : home ? "home" : "move";
  const last: LastEvent = { kind, seat: state.turn, dice, captured };
  // another roll for a double, a capture or a pawn that got home
  if (dice[0] === dice[1] || captured > 0 || home) {
    return { ...base, phase: "roll", last };
  }
  return {
    ...base,
    turn: nextSeat(state, state.turn),
    phase: "roll",
    doubles: 0,
    last,
  };
}

/** The pawn the CPU plays: captures first, then getting home, then leaving the yard, then the pawn furthest along. */
export function cpuMove(state: LudoState): number {
  const legal = state.dice ? legalPawns(state, state.dice) : [];
  const yardOthers = (s: LudoState) =>
    s.pawns.reduce(
      (n, row, seat) =>
        seat === state.turn ? n : n + row.filter((p) => p === 0).length,
      0,
    );
  const before = yardOthers(state);
  const g = geo(state);
  let best = legal[0] ?? 0;
  let bestScore = -Infinity;
  for (const j of legal) {
    const next = move(state, j);
    const from = state.pawns[state.turn]?.[j] ?? 0;
    const to = next.pawns[state.turn]?.[j] ?? 0;
    const score =
      (yardOthers(next) - before) * 100 +
      (to === g.finalPos ? 80 : 0) +
      (from === 0 ? 50 : 0) +
      (to / g.finalPos) * 10;
    if (score > bestScore) {
      bestScore = score;
      best = j;
    }
  }
  return best;
}

/** The host or an administrator hands the turn to the next player. */
export function skip(state: LudoState): LudoState {
  if (state.winner !== null) throw new Error("The game is over");
  return passTurn(state, "skip");
}

/** With a single choice there is nothing to decide: when every pawn that can move stands on the same square (or there is only one), the move is made at once. */
export function autoMove(state: LudoState): LudoState {
  if (state.phase !== "move" || state.dice === null) return state;
  const legal = legalPawns(state, state.dice);
  const mine = state.pawns[state.turn];
  if (!mine) return state;
  const first = legal[0];
  if (first === undefined) return state;
  const firstPos = mine[first];
  if (legal.length === 0 || legal.some((j) => mine[j] !== firstPos)) {
    return state;
  }
  return move(state, first);
}

// ---- board geometry shared with the drawing code ---------------------------------------------

export interface Cell {
  arm: number;
  /** 0 and 2 are the side columns of the arm, 1 is the middle (home) column. */
  col: number;
  /** 0 is the tip of the arm; the row next to the hub is length - 1. */
  row: number;
}

/** Where track square `idx` lies. Squares run clockwise; arm j owns the block [j·(2L+1), (j+1)·(2L+1)). */
export function ringCell(g: Geometry, idx: number): Cell {
  const per = perArm(g);
  const j = Math.floor(idx / per);
  const t = idx % per;
  if (t === 0) return { arm: j, col: 1, row: 0 };
  if (t <= g.length) return { arm: j, col: 2, row: t - 1 };
  return { arm: (j + 1) % g.arms, col: 0, row: 2 * g.length - t };
}

export interface Point {
  x: number;
  y: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Rotation of an arm in degrees, clockwise from "up"; arm 0 points left, like the red arm of the classic board. */
export const armAngle = (g: Geometry, arm: number) => 270 + arm * g.theta;

/** Rotation of the yard that belongs to an arm, in degrees. */
export const yardAngle = (g: Geometry, arm: number) =>
  armAngle(g, arm) + g.yardTurn;

/** Centre of a cell in cell units, from the middle of the board (y grows downwards). */
export function cellPoint(g: Geometry, c: Cell): Point {
  const lx = c.col - 1;
  const ly = -(g.hub + g.length - c.row - 0.5);
  const a = rad(armAngle(g, c.arm));
  return {
    x: lx * Math.cos(a) - ly * Math.sin(a),
    y: lx * Math.sin(a) + ly * Math.cos(a),
  };
}

/** Centre of the yard that belongs to an arm. */
export function yardPoint(g: Geometry, arm: number): Point {
  const a = rad(armAngle(g, arm) + g.theta / 2);
  return { x: g.yardRadius * Math.sin(a), y: -g.yardRadius * Math.cos(a) };
}

/** Where pawn `pawn` of the arm sits at progress p. */
export function pawnPoint(
  g: Geometry,
  arm: number,
  p: number,
  pawn: number,
): Point {
  if (p === 0) {
    const c = yardPoint(g, arm);
    const a = rad(yardAngle(g, arm));
    const ox = (pawn % 2 === 0 ? -1 : 1) * g.yard * 0.19;
    const oy = (pawn < 2 ? -1 : 1) * g.yard * 0.19;
    return {
      x: c.x + ox * Math.cos(a) - oy * Math.sin(a),
      y: c.y + ox * Math.sin(a) + oy * Math.cos(a),
    };
  }
  if (p < g.ring) return cellPoint(g, ringCell(g, ringIndex(g, arm, p)));
  if (p < g.finalPos) {
    return cellPoint(g, { arm, col: 1, row: 1 + (p - g.ring) });
  }
  // home: bunched up on the arm's wedge of the centre
  const a = rad(armAngle(g, arm));
  const r = g.hub * 0.5;
  const spread = (pawn - (PAWNS - 1) / 2) * 0.22;
  return {
    x: r * Math.sin(a) + spread * Math.cos(a),
    y: -r * Math.cos(a) + spread * Math.sin(a),
  };
}
