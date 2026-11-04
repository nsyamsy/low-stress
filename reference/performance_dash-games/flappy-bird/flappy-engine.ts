// Flappy Bird rules, with no DOM: the component draws a GameState and feeds it time and input.
// Keeping the rules here makes them testable without a browser.

export const W = 360;
export const H = 560;
export const GROUND_H = 70;
export const PLAY_H = H - GROUND_H;

export const CONFIG = {
  gravity: 1500, // px/s²
  flapVelocity: -430, // px/s (up is negative)
  maxFall: 640, // terminal velocity, px/s
  baseSpeed: 150, // pipe speed, px/s
  speedPerPoint: 2, // speed added per point scored
  maxSpeedBonus: 80,
  gap: 150, // opening between the pipes
  pipeWidth: 58,
  spacing: 210, // distance between two pipes, left edge to left edge
  birdX: 90,
  birdRadius: 12,
  startY: 270,
  gapMargin: 46, // the opening never gets closer than this to the top or the ground
} as const;

export type Phase = "ready" | "playing" | "over";

export interface Pipe {
  x: number; // left edge
  gapY: number; // centre of the opening
  passed: boolean;
}

export interface GameState {
  phase: Phase;
  birdY: number;
  birdVy: number;
  birdRot: number;
  pipes: Pipe[];
  score: number;
  groundX: number;
  time: number; // seconds since the game was created, drives animation
  sinceOver: number; // seconds since the bird died
  hitGround: boolean;
}

export function createState(): GameState {
  return {
    phase: "ready",
    birdY: CONFIG.startY,
    birdVy: 0,
    birdRot: 0,
    pipes: [],
    score: 0,
    groundX: 0,
    time: 0,
    sinceOver: 0,
    hitGround: false,
  };
}

export function pipeSpeed(score: number) {
  return CONFIG.baseSpeed + Math.min(score * CONFIG.speedPerPoint, CONFIG.maxSpeedBonus);
}

function randomGapY(rand: () => number) {
  const min = CONFIG.gap / 2 + CONFIG.gapMargin;
  const max = PLAY_H - CONFIG.gap / 2 - CONFIG.gapMargin;
  return min + rand() * (max - min);
}

/** The player's one action: flap (and start the run from the ready screen). */
export function flap(state: GameState) {
  if (state.phase === "over") return;
  if (state.phase === "ready") state.phase = "playing";
  state.birdVy = CONFIG.flapVelocity;
}

/** Circle (the bird) against the two rectangles of one pipe. */
export function hitsPipe(state: GameState, pipe: Pipe) {
  const r = CONFIG.birdRadius;
  const bx = CONFIG.birdX;
  const by = state.birdY;
  const overlapsX = bx + r > pipe.x && bx - r < pipe.x + CONFIG.pipeWidth;
  if (!overlapsX) return false;
  const gapTop = pipe.gapY - CONFIG.gap / 2;
  const gapBottom = pipe.gapY + CONFIG.gap / 2;
  // Inside the opening only a corner can still touch: test the nearest point of each rectangle.
  const nearestX = Math.max(pipe.x, Math.min(bx, pipe.x + CONFIG.pipeWidth));
  const hitsTop = Math.hypot(bx - nearestX, by - Math.min(by, gapTop)) < r && by - r < gapTop;
  const hitsBottom = Math.hypot(bx - nearestX, by - Math.max(by, gapBottom)) < r && by + r > gapBottom;
  return hitsTop || hitsBottom || by - r < gapTop || by + r > gapBottom;
}

/** Advance the game by dt seconds (call with small, fixed steps). */
export function step(state: GameState, dt: number, rand: () => number = Math.random) {
  state.time += dt;

  if (state.phase === "ready") {
    state.birdY = CONFIG.startY + Math.sin(state.time * 5) * 8;
    state.birdRot = 0;
    state.groundX = (state.groundX + CONFIG.baseSpeed * dt) % 24;
    return;
  }

  if (state.phase === "playing") {
    const speed = pipeSpeed(state.score);
    state.groundX = (state.groundX + speed * dt) % 24;

    // position first (with the half-gravity term), then velocity: same arc at any step size
    state.birdY += state.birdVy * dt + 0.5 * CONFIG.gravity * dt * dt;
    state.birdVy = Math.min(state.birdVy + CONFIG.gravity * dt, CONFIG.maxFall);
    if (state.birdY - CONFIG.birdRadius < 0) {
      // the ceiling stops the bird but does not end the run
      state.birdY = CONFIG.birdRadius;
      state.birdVy = Math.max(state.birdVy, 0);
    }

    for (const pipe of state.pipes) pipe.x -= speed * dt;
    state.pipes = state.pipes.filter((p) => p.x + CONFIG.pipeWidth > -10);

    const last = state.pipes[state.pipes.length - 1];
    if (!last || last.x < W - CONFIG.spacing) {
      state.pipes.push({ x: last ? last.x + CONFIG.spacing : W + 60, gapY: randomGapY(rand), passed: false });
    }

    for (const pipe of state.pipes) {
      if (!pipe.passed && pipe.x + CONFIG.pipeWidth < CONFIG.birdX - CONFIG.birdRadius) {
        pipe.passed = true;
        state.score += 1;
      }
    }

    state.birdRot = Math.max(-0.45, Math.min(1.15, state.birdVy / 520));

    const hitGround = state.birdY + CONFIG.birdRadius >= PLAY_H;
    if (hitGround || state.pipes.some((p) => hitsPipe(state, p))) {
      state.phase = "over";
      state.sinceOver = 0;
      state.hitGround = hitGround;
      if (hitGround) state.birdY = PLAY_H - CONFIG.birdRadius;
    }
    return;
  }

  // over: the bird drops to the ground, nothing else moves
  state.sinceOver += dt;
  if (state.birdY + CONFIG.birdRadius < PLAY_H) {
    const drop = state.birdVy * dt + 0.5 * CONFIG.gravity * dt * dt;
    state.birdVy = Math.min(state.birdVy + CONFIG.gravity * dt, CONFIG.maxFall);
    state.birdY = Math.min(state.birdY + drop, PLAY_H - CONFIG.birdRadius);
    state.birdRot = Math.min(1.45, state.birdRot + 5 * dt);
  }
}

export type Medal = "bronze" | "silver" | "gold" | null;
export const medalFor = (score: number): Medal => (score >= 30 ? "gold" : score >= 20 ? "silver" : score >= 10 ? "bronze" : null);
