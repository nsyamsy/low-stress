import type { PlausibilityRule, ScoreDirection } from "./manifest";

/**
 * Bandingkan dua skor menurut arah permainan.
 * Mengembalikan bilangan negatif bila `a` lebih baik dari `b`.
 */
export function compareScores(
  direction: ScoreDirection,
  a: number,
  b: number,
): number {
  if (a === b) return 0;
  if (direction === "higher") return a > b ? -1 : 1;
  return a < b ? -1 : 1;
}

/** Apakah `candidate` mengalahkan `current`? */
export function isBetterScore(
  direction: ScoreDirection,
  candidate: number,
  current: number | null | undefined,
): boolean {
  if (current === null || current === undefined) return true;
  return compareScores(direction, candidate, current) < 0;
}

export interface RunMeasurement {
  score: number;
  durationMs: number;
}

/**
 * Validasi kewajaran dasar. Bukan anti-cheat; server hanya menyaring run yang
 * mustahil secara aritmetika. Run yang mencurigakan tetap dapat ditandai.
 */
export function isPlausibleRun(
  run: RunMeasurement,
  rule: PlausibilityRule,
): boolean {
  const { score, durationMs } = run;

  if (!Number.isFinite(score) || !Number.isFinite(durationMs)) return false;
  if (!Number.isInteger(score) || !Number.isInteger(durationMs)) return false;
  if (score < 0 || durationMs < 0) return false;

  if (rule.minScore !== undefined && score < rule.minScore) return false;
  if (rule.maxScore !== undefined && score > rule.maxScore) return false;
  if (rule.minDurationMs !== undefined && durationMs < rule.minDurationMs) {
    return false;
  }
  if (rule.maxDurationMs !== undefined && durationMs > rule.maxDurationMs) {
    return false;
  }

  if (rule.maxScorePerSecond !== undefined) {
    const seconds = durationMs / 1000;
    const ceiling = Math.floor(seconds * rule.maxScorePerSecond) + 1;
    if (score > ceiling) return false;
  }

  return true;
}
