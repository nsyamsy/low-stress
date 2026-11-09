import { sql } from "drizzle-orm";
import type { Database } from "@low-stress/db";
import type {
  LeaderboardData as LeaderboardResponse,
  LeaderboardEntry,
  LeaderboardPeriod,
  ScoreDirection,
} from "@low-stress/sdk";
import { censorServerText } from "../chat/profanity-service";

export const APP_TZ = "Asia/Jakarta";

export type { LeaderboardEntry, LeaderboardPeriod, LeaderboardResponse };

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
