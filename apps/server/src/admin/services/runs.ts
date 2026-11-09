import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { Database } from "@low-stress/db";
import { gameRuns, users } from "@low-stress/db";
import { censorServerText } from "../../chat/profanity-service";
import { AppError } from "../../errors";
import { getLeaderboardBounds, recomputeGameScore } from "../../games/scores";
import type { LoadedGame } from "../../registry/games";
import type { AdminRunsQueryInput } from "../validation";
import { recordAuditLog } from "./audit";

export async function listGameRuns(
  db: Database,
  query: AdminRunsQueryInput,
): Promise<{
  items: Array<{
    id: string;
    gameId: string;
    score: number;
    durationMs: number;
    flagged: boolean;
    createdAt: string;
    playedAt: string;
    userId: string;
    username: string;
    displayName: string;
    user: {
      id: string;
      username: string;
      displayName: string;
    };
  }>;
  page: number;
  pageSize: number;
  total: number;
}> {
  const conditions = [];

  if (query.gameId) {
    conditions.push(eq(gameRuns.gameId, query.gameId));
  }

  if (query.flagged !== undefined) {
    conditions.push(eq(gameRuns.flagged, query.flagged));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(gameRuns)
    .where(whereClause);
  const total = countResult[0]?.count ?? 0;

  const offset = (query.page - 1) * query.pageSize;

  const rows = await db
    .select({
      id: gameRuns.id,
      gameId: gameRuns.gameId,
      score: gameRuns.score,
      durationMs: gameRuns.durationMs,
      flagged: gameRuns.flagged,
      createdAt: gameRuns.createdAt,
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
    })
    .from(gameRuns)
    .innerJoin(users, eq(gameRuns.userId, users.id))
    .where(whereClause)
    .orderBy(desc(gameRuns.createdAt))
    .limit(query.pageSize)
    .offset(offset);

  return {
    items: rows.map((r) => {
      const isoCreatedAt = r.createdAt.toISOString();
      const censoredDisplayName = censorServerText(r.displayName);
      return {
        id: r.id,
        gameId: r.gameId,
        score: r.score,
        durationMs: r.durationMs,
        flagged: r.flagged,
        createdAt: isoCreatedAt,
        playedAt: isoCreatedAt,
        userId: r.userId,
        username: r.username,
        displayName: censoredDisplayName,
        user: {
          id: r.userId,
          username: r.username,
          displayName: censoredDisplayName,
        },
      };
    }),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

export async function deleteGameRun(
  db: Database,
  adminId: string,
  runId: string,
  games: readonly LoadedGame[] = [],
): Promise<void> {
  const [run] = await db
    .select()
    .from(gameRuns)
    .where(eq(gameRuns.id, runId))
    .limit(1);

  if (!run) {
    throw new AppError("NOT_FOUND", 404);
  }

  await db.delete(gameRuns).where(eq(gameRuns.id, runId));

  const direction =
    games.find((g) => g.manifest.id === run.gameId)?.manifest.scoring?.direction ??
    "higher";
  await recomputeGameScore(db, run.userId, run.gameId, direction);

  await recordAuditLog(db, {
    adminId,
    action: "run.delete",
    targetType: "game_run",
    targetId: runId,
    detail: {
      gameId: run.gameId,
      userId: run.userId,
      score: run.score,
      durationMs: run.durationMs,
      flagged: run.flagged,
    },
  });
}

export async function resetLeaderboard(
  db: Database,
  adminId: string,
  gameId: string,
  period: "week" | "month",
  games: readonly LoadedGame[] = [],
): Promise<{ deletedCount: number }> {
  const bounds = await getLeaderboardBounds(db, period);
  const start = new Date(bounds.periodStart);
  const end = new Date(bounds.periodEnd);

  const runsToDelete = await db
    .select({
      id: gameRuns.id,
      userId: gameRuns.userId,
    })
    .from(gameRuns)
    .where(
      and(
        eq(gameRuns.gameId, gameId),
        gte(gameRuns.createdAt, start),
        lt(gameRuns.createdAt, end),
      ),
    );

  if (runsToDelete.length > 0) {
    await db
      .delete(gameRuns)
      .where(
        and(
          eq(gameRuns.gameId, gameId),
          gte(gameRuns.createdAt, start),
          lt(gameRuns.createdAt, end),
        ),
      );

    const direction =
      games.find((g) => g.manifest.id === gameId)?.manifest.scoring?.direction ??
      "higher";
    const affectedUserIds = [...new Set(runsToDelete.map((r) => r.userId))];
    for (const uid of affectedUserIds) {
      await recomputeGameScore(db, uid, gameId, direction);
    }
  }

  await recordAuditLog(db, {
    adminId,
    action: "leaderboard.reset",
    targetType: "game",
    targetId: gameId,
    detail: {
      period,
      deletedCount: runsToDelete.length,
    },
  });

  return { deletedCount: runsToDelete.length };
}
