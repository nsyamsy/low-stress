import { isPlausibleRun, type GameManifest } from "@low-stress/sdk";

export const MAX_RUN_MS = 2 * 60 * 60 * 1000; // 2 jam
export const MIN_SECONDS_PER_POINT_FLAPPY = 0.85;

/**
 * Menghitung skor Memory Match sesuai rumus Porting_Guide §3:
 * totalSecs   = max(1, floor(durationMs / 1000))
 * timePenalty = floor(totalSecs * 25)
 * movePenalty = max(0, (moves - 8) * 45)
 * comboBonus  = combos * 150
 * score       = max(200, floor(5000 - timePenalty - movePenalty + comboBonus))
 */
export function calculateMemoryMatchScore(
  durationMs: number,
  moves: number,
  combos = 0,
): number {
  const totalSecs = Math.max(1, Math.floor(durationMs / 1000));
  const timePenalty = Math.floor(totalSecs * 25);
  const movePenalty = Math.max(0, (moves - 8) * 45);
  const comboBonus = combos * 150;
  return Math.max(
    200,
    Math.floor(5000 - timePenalty - movePenalty + comboBonus),
  );
}

export interface RunMeasurementInput {
  score: number;
  durationMs: number;
  moves?: number;
  combos?: number;
  [key: string]: unknown;
}

/**
 * Validasi kewajaran run (Porting_Guide §3 & §6).
 * Mendukung pemanggilan dengan objek run atau argumen terpisah (acuan game-scores.ts).
 */
export function plausibleRun(
  gameId: string,
  run: RunMeasurementInput,
  manifest?: GameManifest,
): boolean;
export function plausibleRun(
  gameOrScore: string | number,
  scoreOrDuration: number,
  maybeDuration?: number,
): boolean;
export function plausibleRun(
  gameOrScore: string | number,
  scoreOrDurationOrRun: number | RunMeasurementInput,
  maybeDurationOrManifest?: number | GameManifest,
  maybeManifest?: GameManifest,
): boolean {
  let gameId = "flappy-bird";
  let score: number;
  let durationMs: number;
  let moves: number | undefined;
  let combos: number | undefined;
  let manifest = maybeManifest;

  if (typeof gameOrScore === "string") {
    gameId = gameOrScore;
    if (typeof scoreOrDurationOrRun === "object" && scoreOrDurationOrRun !== null) {
      score = scoreOrDurationOrRun.score;
      durationMs = scoreOrDurationOrRun.durationMs;
      moves = scoreOrDurationOrRun.moves;
      combos = scoreOrDurationOrRun.combos;
      if (typeof maybeDurationOrManifest === "object") {
        manifest = maybeDurationOrManifest;
      }
    } else {
      score = Number(scoreOrDurationOrRun);
      durationMs = typeof maybeDurationOrManifest === "number" ? maybeDurationOrManifest : 0;
    }
  } else {
    score = Number(gameOrScore);
    durationMs = Number(scoreOrDurationOrRun);
  }

  if (!Number.isFinite(score) || !Number.isInteger(score) || score < 0) {
    return false;
  }
  if (
    !Number.isFinite(durationMs) ||
    !Number.isInteger(durationMs) ||
    durationMs < 0 ||
    durationMs > MAX_RUN_MS
  ) {
    return false;
  }

  if (gameId === "flappy-bird") {
    if (score > 500) return false;
    const maxPossible =
      Math.floor(durationMs / 1000 / MIN_SECONDS_PER_POINT_FLAPPY) + 1;
    return score <= maxPossible;
  }

  if (gameId === "memory-match" || gameId.includes("mem")) {
    if (score < 50 || score > 10000) return false;
    if (durationMs < 2000) return false;
    if (moves !== undefined) {
      if (!Number.isInteger(moves) || moves < 8) return false;
      const expected = calculateMemoryMatchScore(durationMs, moves, combos ?? 0);
      if (score !== expected) return false;
    }
    return true;
  }

  if (manifest?.scoring) {
    if (!isPlausibleRun({ score, durationMs }, manifest.scoring)) {
      return false;
    }
    if (manifest.scoring.validate && !manifest.scoring.validate({ score, durationMs })) {
      return false;
    }
  }

  return true;
}

/**
 * Mendeteksi apakah suatu run mencurigakan (tidak wajar) sehingga perlu ditandai `flagged`.
 */
export function isSuspiciousRun(
  gameId: string,
  run: RunMeasurementInput,
): boolean {
  if (run.flagged) {
    return true;
  }

  if (gameId === "memory-match" || gameId.includes("mem")) {
    if (run.durationMs < 4000) {
      return true;
    }
    if (run.moves === 8 && run.durationMs < 5000) {
      return true;
    }
  }

  if (gameId === "flappy-bird") {
    if (run.score > 100 && run.durationMs < run.score * 950) {
      return true;
    }
  }

  return false;
}
