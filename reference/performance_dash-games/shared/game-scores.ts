// Scores for the games under Commercial > Utilities. Two tables, both created on first use like the
// other Commercial tables:
//   commercial_game_scores  one row per player and game: the all-time best, how many plays, and on
//                           which play (1st, 2nd, ...) that best was reached
//   commercial_game_runs    one row per finished play: the weekly and monthly boards are computed from it
import { db } from "@/lib/db";
import { sql, type SQL } from "drizzle-orm";

export const GAMES = ["flappy-bird", "memory-match", "temple-run"] as const;
export type GameId = (typeof GAMES)[number];
export const isGameId = (v: unknown): v is GameId => typeof v === "string" && (GAMES as readonly string[]).includes(v);

export const PERIODS = ["all", "week", "month"] as const;
export type Period = (typeof PERIODS)[number];
export const isPeriod = (v: unknown): v is Period => typeof v === "string" && (PERIODS as readonly string[]).includes(v);

// Weeks start on Monday and months on the 1st, both counted in Western Indonesia Time.
const TZ = "Asia/Jakarta";

// The game runs in the browser, so a submitted score can only be sanity-checked, not proven.
// Flappy Bird: a pipe passes the bird at most every spacing / max-speed seconds.
// Temple Run: player advances distance plus coins with multipliers.
const MAX_SCORE = 500;
const MAX_RUN_MS = 2 * 60 * 60 * 1000;
const MIN_SECONDS_PER_POINT = 0.85;

export function plausibleRun(gameOrScore: GameId | number, scoreOrDuration: number, maybeDuration?: number) {
  let game: GameId = "flappy-bird";
  let score: number;
  let durationMs: number;

  if (typeof gameOrScore === "string" && isGameId(gameOrScore)) {
    game = gameOrScore;
    score = scoreOrDuration;
    durationMs = maybeDuration ?? 0;
  } else {
    score = Number(gameOrScore);
    durationMs = scoreOrDuration;
  }

  if (!Number.isInteger(score) || score < 0) return false;
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > MAX_RUN_MS) return false;

  if (game === "flappy-bird") {
    if (score > MAX_SCORE) return false;
    return score <= Math.floor(durationMs / 1000 / MIN_SECONDS_PER_POINT) + 1;
  }

  if (game === "memory-match") {
    if (score > 10000 || score < 50) return false;
    if (durationMs < 2000) return false;
    return true;
  }

  if (game === "temple-run") {
    if (score > 500000) return false;
    return score <= Math.floor((durationMs / 1000) * 200) + 100;
  }

  return false;
}

/** Runs one statement. The default is the app's pool; a test can pass its own connection. */
export type Exec = (query: SQL) => Promise<{ rows: unknown[] }>;
const defaultExec: Exec = (query) => db.execute(query) as Promise<{ rows: unknown[] }>;

let ensured = false;
let inFlight: Promise<void> | null = null;

export function ensureGameScoresTable(): Promise<void> {
  if (ensured) return Promise.resolve();
  inFlight ??= (async () => {
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "commercial_game_scores" (
          "game" varchar(30) NOT NULL,
          "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "best_score" integer NOT NULL DEFAULT 0,
          "plays" integer NOT NULL DEFAULT 0,
          "best_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY ("game", "user_id")
        );
        CREATE INDEX IF NOT EXISTS "idx_commercial_game_scores_rank" ON "commercial_game_scores" ("game", "best_score" DESC, "best_at");
        -- the play on which the best score was reached; NULL for rows from before this column existed
        ALTER TABLE "commercial_game_scores" ADD COLUMN IF NOT EXISTS "best_play" integer;

        CREATE TABLE IF NOT EXISTS "commercial_game_runs" (
          "id" bigserial PRIMARY KEY,
          "game" varchar(30) NOT NULL,
          "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "score" integer NOT NULL,
          "played_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS "idx_commercial_game_runs_game_time" ON "commercial_game_runs" ("game", "played_at");
        CREATE INDEX IF NOT EXISTS "idx_commercial_game_runs_user" ON "commercial_game_runs" ("game", "user_id", "played_at");
      `);
      ensured = true;
    } catch (error) {
      console.error("[Games] could not create the score tables:", error);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  score: number;
  /** Plays in the period (all time for the all-time board). */
  plays: number;
  /** Which play of the period produced the best score (1 = the first); null when not recorded. */
  bestPlay: number | null;
  at: string;
  isMe: boolean;
}

export interface Leaderboard {
  period: Period;
  /** The period's boundaries (ISO); null for the all-time board. */
  periodStart: string | null;
  periodEnd: string | null;
  entries: LeaderboardEntry[];
  /** The caller's own row when it is not already inside the top entries. */
  me: LeaderboardEntry | null;
  /** The caller's own row, always (null if they have no score in this period). */
  mine: LeaderboardEntry | null;
}

const TOP = 10;

type RankedRow = { userId: string; name: string; score: number; plays: number; bestPlay: number | null; at: string | Date; rank: string | number };

const toEntry = (r: RankedRow, userId: string): LeaderboardEntry => ({
  rank: Number(r.rank),
  userId: r.userId,
  name: r.name,
  score: Number(r.score),
  plays: Number(r.plays),
  bestPlay: r.bestPlay === null || r.bestPlay === undefined ? null : Number(r.bestPlay),
  at: new Date(r.at).toISOString(),
  isMe: r.userId === userId,
});

export async function getLeaderboard(game: GameId, userId: string, period: Period = "all", exec: Exec = defaultExec): Promise<Leaderboard> {
  if (exec === defaultExec) await ensureGameScoresTable();

  let rows: RankedRow[];
  let periodStart: string | null = null;
  let periodEnd: string | null = null;

  if (period === "all") {
    const res = await exec(sql`
      SELECT s.user_id AS "userId", u.name, s.best_score AS score, s.plays, s.best_play AS "bestPlay", s.best_at AS at,
             RANK() OVER (ORDER BY s.best_score DESC, s.best_at ASC) AS rank
        FROM commercial_game_scores s
        JOIN users u ON u.id = s.user_id
       WHERE s.game = ${game} AND s.best_score > 0 AND u.is_active = true
    `);
    rows = res.rows as RankedRow[];
  } else {
    // The period starts at Monday 00:00 (week) or the 1st 00:00 (month) in WIB. Per player: the best
    // run of the period (the earlier one on a tie), and its position among that player's runs of the period.
    const unit = period;
    const bounds = await exec(sql`
      SELECT (date_trunc(${unit}, now() AT TIME ZONE ${TZ})) AT TIME ZONE ${TZ} AS "start",
             (date_trunc(${unit}, now() AT TIME ZONE ${TZ}) + ('1 ' || ${unit})::interval) AT TIME ZONE ${TZ} AS "end"
    `);
    const b = bounds.rows[0] as { start: string | Date; end: string | Date };
    periodStart = new Date(b.start).toISOString();
    periodEnd = new Date(b.end).toISOString();

    const res = await exec(sql`
      WITH runs AS (
        SELECT r.user_id, r.score, r.played_at,
               ROW_NUMBER() OVER (PARTITION BY r.user_id ORDER BY r.played_at, r.id) AS play_no,
               COUNT(*) OVER (PARTITION BY r.user_id) AS plays
          FROM commercial_game_runs r
         WHERE r.game = ${game} AND r.played_at >= ${periodStart}::timestamptz AND r.played_at < ${periodEnd}::timestamptz
      ),
      best AS (
        SELECT DISTINCT ON (user_id) user_id, score, played_at, play_no, plays
          FROM runs
         ORDER BY user_id, score DESC, played_at ASC
      )
      SELECT b.user_id AS "userId", u.name, b.score, b.plays, b.play_no AS "bestPlay", b.played_at AS at,
             RANK() OVER (ORDER BY b.score DESC, b.played_at ASC) AS rank
        FROM best b
        JOIN users u ON u.id = b.user_id
       WHERE b.score > 0 AND u.is_active = true
    `);
    rows = res.rows as RankedRow[];
  }

  const all = rows.map((r) => toEntry(r, userId)).sort((a, b) => a.rank - b.rank);
  const entries = all.slice(0, TOP);
  const mine = all.find((e) => e.isMe) ?? null;
  const me = entries.some((e) => e.isMe) ? null : mine;
  return { period, periodStart, periodEnd, entries, me, mine };
}

export async function recordScore(game: GameId, userId: string, score: number, exec: Exec = defaultExec) {
  if (exec === defaultExec) await ensureGameScoresTable();

  // A Flappy Bird run that never passed the first pipe is not a play: nothing is counted or stored.
  if (game === "flappy-bird" && score < 1) {
    const cur = await exec(sql`
      SELECT best_score AS best, best_play AS "bestPlay", plays FROM commercial_game_scores WHERE game = ${game} AND user_id = ${userId}
    `);
    const row = cur.rows[0] as { best: number; bestPlay: number | null; plays: number } | undefined;
    return {
      best: row ? Number(row.best) : 0,
      bestPlay: row?.bestPlay == null ? null : Number(row.bestPlay),
      plays: row ? Number(row.plays) : 0,
      isNewBest: false,
    };
  }

  // The play being recorded is plays + 1: every right-hand side below sees the row as it was before.
  const res = await exec(sql`
    INSERT INTO commercial_game_scores (game, user_id, best_score, plays, best_play)
    VALUES (${game}, ${userId}, ${score}, 1, ${score > 0 ? 1 : null})
    ON CONFLICT (game, user_id) DO UPDATE SET
      best_play = CASE WHEN EXCLUDED.best_score > commercial_game_scores.best_score THEN commercial_game_scores.plays + 1 ELSE commercial_game_scores.best_play END,
      plays = commercial_game_scores.plays + 1,
      best_at = CASE WHEN EXCLUDED.best_score > commercial_game_scores.best_score THEN CURRENT_TIMESTAMP ELSE commercial_game_scores.best_at END,
      best_score = GREATEST(commercial_game_scores.best_score, EXCLUDED.best_score),
      updated_at = CURRENT_TIMESTAMP
    RETURNING best_score AS best, best_play AS "bestPlay", plays,
              -- this play set the best exactly when the best play is the play just counted
              (best_play = plays) AS improved
  `);
  await exec(sql`INSERT INTO commercial_game_runs (game, user_id, score) VALUES (${game}, ${userId}, ${score})`);

  const row = res.rows[0] as { best: number; bestPlay: number | null; plays: number; improved: boolean };
  return {
    best: Number(row.best),
    bestPlay: row.bestPlay === null ? null : Number(row.bestPlay),
    plays: Number(row.plays),
    isNewBest: Boolean(row.improved) && score > 0,
  };
}
