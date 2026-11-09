import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "@low-stress/db";
import { gameRuns, gameScores } from "@low-stress/db";
import type { ScoreDirection } from "@low-stress/sdk";

export * from "./leaderboard";
export * from "./plausibility";

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
 * Mencatat skor run ke dalam `game_scores` dan `game_runs`.
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
