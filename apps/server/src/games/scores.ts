import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "@low-stress/db";
import { gameRuns, gameScores } from "@low-stress/db";
import {
  isPlausibleRun,
  type GameManifest,
  type ScoreDirection,
} from "@low-stress/sdk";
import { censorServerText } from "../chat/profanity-service";

export const APP_TZ = "Asia/Jakarta";
export const MAX_RUN_MS = 2 * 60 * 60 * 1000; // 2 jam
export const MIN_SECONDS_PER_POINT_FLAPPY = 0.85;

export type LeaderboardPeriod = "all" | "week" | "month";

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  score: number;
  plays: number;
  bestPlay: number | null;
  at: string;
  isMe: boolean;
}

export interface LeaderboardResponse {
  period: LeaderboardPeriod;
  periodStart: string | null;
  periodEnd: string | null;
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
  mine: LeaderboardEntry | null;
}

export interface GetLeaderboardOptions {
  db: Database;
  gameId: string;
  userId?: string;
  period?: LeaderboardPeriod;
  now?: Date;
  direction?: ScoreDirection;
}

/**
 * Menghitung rentang batas waktu periode (WIB) untuk week atau month.
 */
export async function getLeaderboardBounds(
  db: Database,
  period: "week" | "month",
  now: Date = new Date(),
): Promise<{ periodStart: string; periodEnd: string }> {
  const unit = period;
  const isoNow = now.toISOString();
  const res = await db.execute(sql`
    SELECT (date_trunc(${unit}, ${isoNow}::timestamptz AT TIME ZONE ${APP_TZ})) AT TIME ZONE ${APP_TZ} AS "start",
           (date_trunc(${unit}, ${isoNow}::timestamptz AT TIME ZONE ${APP_TZ}) + ('1 ' || ${unit})::interval) AT TIME ZONE ${APP_TZ} AS "end"
  `);
  const rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as Array<{
    start: string | Date;
    end: string | Date;
  }>;
  const b = rows[0]!;
  return {
    periodStart: new Date(b.start).toISOString(),
    periodEnd: new Date(b.end).toISOString(),
  };
}

/**
 * Mengambil data leaderboard per game (weekly, monthly, all time dalam WIB).
 */
export async function getLeaderboard(
  options: GetLeaderboardOptions,
): Promise<LeaderboardResponse> {
  const {
    db,
    gameId,
    userId,
    period = "all",
    now = new Date(),
    direction = "higher",
  } = options;

  const scoreOrder = direction === "lower" ? sql`ASC` : sql`DESC`;

  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let rows: Array<{
    userId: string;
    name: string;
    score: number;
    plays: number;
    bestPlay: number | null;
    at: string | Date;
    rank: number | string;
  }>;

  if (period === "all") {
    const res = await db.execute(sql`
      SELECT s.user_id AS "userId",
             u.display_name AS "name",
             s.best_score AS score,
             s.plays,
             s.best_play AS "bestPlay",
             s.best_reached_at AS at,
             RANK() OVER (ORDER BY s.best_score ${scoreOrder}, s.best_reached_at ASC) AS rank
        FROM game_scores s
        JOIN users u ON u.id = s.user_id
       WHERE s.game_id = ${gameId}
         AND s.best_score > 0
         AND u.status = 'active'
    `);
    rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as typeof rows;
  } else {
    const bounds = await getLeaderboardBounds(db, period, now);
    periodStart = bounds.periodStart;
    periodEnd = bounds.periodEnd;

    const res = await db.execute(sql`
      WITH runs AS (
        SELECT r.user_id,
               r.score,
               r.created_at AS played_at,
               ROW_NUMBER() OVER (PARTITION BY r.user_id ORDER BY r.created_at, r.id) AS play_no,
               COUNT(*) OVER (PARTITION BY r.user_id) AS plays
          FROM game_runs r
         WHERE r.game_id = ${gameId}
           AND r.created_at >= ${periodStart}::timestamptz
           AND r.created_at < ${periodEnd}::timestamptz
           AND r.flagged = false
      ),
      best AS (
        SELECT DISTINCT ON (user_id) user_id, score, played_at, play_no, plays
          FROM runs
         ORDER BY user_id, score ${scoreOrder}, played_at ASC
      )
      SELECT b.user_id AS "userId",
             u.display_name AS "name",
             b.score,
             b.plays,
             b.play_no AS "bestPlay",
             b.played_at AS at,
             RANK() OVER (ORDER BY b.score ${scoreOrder}, b.played_at ASC) AS rank
        FROM best b
        JOIN users u ON u.id = b.user_id
       WHERE b.score > 0
         AND u.status = 'active'
    `);
    rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as typeof rows;
  }

  const all: LeaderboardEntry[] = rows
    .map((r) => ({
      rank: Number(r.rank),
      userId: r.userId,
      name: censorServerText(r.name),
      score: Number(r.score),
      plays: Number(r.plays),
      bestPlay: r.bestPlay === null || r.bestPlay === undefined ? null : Number(r.bestPlay),
      at: new Date(r.at).toISOString(),
      isMe: Boolean(userId && r.userId === userId),
    }))
    .sort((a, b) => a.rank - b.rank || new Date(a.at).getTime() - new Date(b.at).getTime());

  const entries = all.slice(0, 10);
  const mine = userId ? all.find((e) => e.isMe) ?? null : null;
  const me = mine && !entries.some((e) => e.isMe) ? mine : null;

  return {
    period,
    periodStart,
    periodEnd,
    entries,
    me,
    mine,
  };
}

export interface RecordScoreParams {
  db: Database;
  gameId: string;
  userId: string;
  score: number;
  durationMs?: number;
  flagged?: boolean;
  direction?: ScoreDirection;
}

export interface RecordScoreResult {
  best: number;
  bestPlay: number | null;
  plays: number;
  isNewBest: boolean;
}

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
 * Run yang ditandai flagged tetap disimpan agar dapat ditinjau oleh administrator di panel admin,
 * namun tidak dimasukkan ke dalam papan peringkat publik (Architecture §7 & ROADMAP P5-05).
 */
export function isSuspiciousRun(
  gameId: string,
  run: RunMeasurementInput,
): boolean {
  if (run.flagged) {
    return true;
  }

  if (gameId === "memory-match" || gameId.includes("mem")) {
    // 8 pasang kartu diselesaikan di bawah 4 detik adalah sangat tidak wajar (manusia super / bot)
    if (run.durationMs < 4000) {
      return true;
    }
    // Sempurna 8 moves di bawah 5 detik
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

/**
 * Mencatat skor run ke dalam `game_scores` dan `game_runs`.
 *
 * Aturan (Porting_Guide §6):
 * - Run Flappy Bird dengan score < 1 tidak disimpan dan tidak dihitung.
 * - Run yang ditandai `flagged = true` dicatat ke `game_runs` untuk moderasi admin,
 *   tetapi tidak memperbarui `game_scores` ataupun leaderboard publik.
 * - Upsert `game_scores`: `best_score` diupdate jika skor baru mengalahkan skor lama.
 * - Urutan seri (tie-break): skor yang sama TIDAK menggantikan rekor lama ("yang lebih awal menang").
 * - `plays`: bertambah 1 pada setiap run yang disimpan.
 * - `best_play`: mencatat nomor giliran keberapa saat rekor terbaik dicapai.
 */
export async function recordScore(
  params: RecordScoreParams,
): Promise<RecordScoreResult> {
  const {
    db,
    gameId,
    userId,
    score,
    durationMs = 0,
    flagged = false,
    direction = "higher",
  } = params;

  // Run Flappy Bird dengan skor < 1 tidak disimpan dan tidak dihitung
  if (gameId === "flappy-bird" && score < 1) {
    const existing = await db
      .select({
        bestScore: gameScores.bestScore,
        bestPlay: gameScores.bestPlay,
        plays: gameScores.plays,
      })
      .from(gameScores)
      .where(
        sql`${gameScores.userId} = ${userId}::uuid AND ${gameScores.gameId} = ${gameId}`,
      )
      .limit(1);

    const row = existing[0];
    return {
      best: row?.bestScore ?? 0,
      bestPlay: row?.bestPlay ?? null,
      plays: row?.plays ?? 0,
      isNewBest: false,
    };
  }

  // Jika run ditandai flagged (janggal/mencurigakan), simpan ke game_runs untuk ditinjau admin
  // namun jangan perbarui rekor di game_scores
  if (flagged) {
    await db.insert(gameRuns).values({
      userId,
      gameId,
      score,
      durationMs,
      flagged: true,
    });

    const existing = await db
      .select({
        bestScore: gameScores.bestScore,
        bestPlay: gameScores.bestPlay,
        plays: gameScores.plays,
      })
      .from(gameScores)
      .where(
        sql`${gameScores.userId} = ${userId}::uuid AND ${gameScores.gameId} = ${gameId}`,
      )
      .limit(1);

    const row = existing[0];
    return {
      best: row?.bestScore ?? 0,
      bestPlay: row?.bestPlay ?? null,
      plays: row?.plays ?? 0,
      isNewBest: false,
    };
  }

  const isImprovement =
    direction === "higher"
      ? sql`EXCLUDED.best_score > game_scores.best_score`
      : sql`EXCLUDED.best_score < game_scores.best_score`;

  const bestScoreExpr =
    direction === "higher"
      ? sql`GREATEST(game_scores.best_score, EXCLUDED.best_score)`
      : sql`LEAST(game_scores.best_score, EXCLUDED.best_score)`;

  const res = await db.execute(sql`
    INSERT INTO game_scores (user_id, game_id, best_score, plays, best_play, best_reached_at)
    VALUES (
      ${userId}::uuid,
      ${gameId},
      ${score},
      1,
      ${score > 0 ? 1 : null},
      now()
    )
    ON CONFLICT (user_id, game_id) DO UPDATE SET
      best_play = CASE
        WHEN ${isImprovement} THEN game_scores.plays + 1
        ELSE game_scores.best_play
      END,
      plays = game_scores.plays + 1,
      best_reached_at = CASE
        WHEN ${isImprovement} THEN now()
        ELSE game_scores.best_reached_at
      END,
      best_score = ${bestScoreExpr}
    RETURNING
      best_score AS "best",
      best_play AS "bestPlay",
      plays,
      (best_play = plays) AS "improved"
  `);

  const rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as Array<{
    best: number;
    bestPlay: number | null;
    plays: number;
    improved: boolean;
  }>;
  const row = rows[0]!;

  const improved = Boolean(row.improved) && score > 0;

  await db.insert(gameRuns).values({
    userId,
    gameId,
    score,
    durationMs,
    flagged,
  });

  return {
    best: Number(row.best),
    bestPlay: row.bestPlay === null || row.bestPlay === undefined ? null : Number(row.bestPlay),
    plays: Number(row.plays),
    isNewBest: improved,
  };
}

/**
 * Menghitung ulang `game_scores` pemain berdasarkan `game_runs` yang tidak flagged.
 * Dipanggil saat admin menghapus suatu run atau mereset periode papan (API_Spec §6).
 */
export async function recomputeGameScore(
  db: Database,
  userId: string,
  gameId: string,
  direction: ScoreDirection = "higher",
): Promise<void> {
  const runs = await db
    .select({
      id: gameRuns.id,
      score: gameRuns.score,
      createdAt: gameRuns.createdAt,
    })
    .from(gameRuns)
    .where(
      and(
        eq(gameRuns.userId, userId),
        eq(gameRuns.gameId, gameId),
        eq(gameRuns.flagged, false),
      ),
    )
    .orderBy(asc(gameRuns.createdAt));

  if (runs.length === 0) {
    await db
      .delete(gameScores)
      .where(
        and(
          sql`${gameScores.userId} = ${userId}::uuid`,
          eq(gameScores.gameId, gameId),
        ),
      );
    return;
  }

  let bestScore: number | null = null;
  let bestPlay: number | null = null;
  let bestReachedAt: Date = runs[0]!.createdAt;
  let plays = 0;

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i]!;
    if (gameId === "flappy-bird" && run.score < 1) {
      continue;
    }
    plays++;
    const isBetter =
      bestScore === null
        ? run.score > 0
        : direction === "lower"
          ? run.score > 0 && run.score < bestScore
          : run.score > bestScore;
    if (isBetter) {
      bestScore = run.score;
      bestPlay = plays;
      bestReachedAt = run.createdAt;
    }
  }

  if (plays === 0 || bestScore === null) {
    await db
      .delete(gameScores)
      .where(
        and(
          sql`${gameScores.userId} = ${userId}::uuid`,
          eq(gameScores.gameId, gameId),
        ),
      );
    return;
  }

  const isoReachedAt =
    bestReachedAt instanceof Date
      ? bestReachedAt.toISOString()
      : new Date(bestReachedAt).toISOString();

  await db.execute(sql`
    INSERT INTO game_scores (user_id, game_id, best_score, plays, best_play, best_reached_at)
    VALUES (
      ${userId}::uuid,
      ${gameId},
      ${bestScore},
      ${plays},
      ${bestPlay},
      ${isoReachedAt}::timestamptz
    )
    ON CONFLICT (user_id, game_id) DO UPDATE SET
      best_score = EXCLUDED.best_score,
      plays = EXCLUDED.plays,
      best_play = EXCLUDED.best_play,
      best_reached_at = EXCLUDED.best_reached_at
  `);
}
