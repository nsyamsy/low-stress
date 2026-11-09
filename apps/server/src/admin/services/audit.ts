import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Database } from "@low-stress/db";
import { admins, auditLog, gameRuns, users } from "@low-stress/db";

export interface AuditLogEntry {
  adminId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  detail?: Record<string, unknown> | null;
}

export async function recordAuditLog(
  db: Database,
  entry: AuditLogEntry,
): Promise<void> {
  await db.insert(auditLog).values({
    adminId: entry.adminId,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    detail: entry.detail ?? null,
  });
}

export async function listAuditLogs(
  db: Database,
  query: {
    action?: string;
    adminId?: string;
    page: number;
    pageSize: number;
  },
): Promise<{
  items: Array<{
    id: string;
    adminId: string | null;
    adminUsername: string | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    detail: unknown;
    createdAt: string;
  }>;
  page: number;
  pageSize: number;
  total: number;
}> {
  const conditions = [];

  if (query.action) {
    conditions.push(eq(auditLog.action, query.action));
  }

  if (query.adminId) {
    conditions.push(eq(auditLog.adminId, query.adminId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const auditCountResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(whereClause);
  const total = auditCountResult[0]?.count ?? 0;

  const offset = (query.page - 1) * query.pageSize;

  const rows = await db
    .select({
      id: auditLog.id,
      adminId: auditLog.adminId,
      adminUsername: admins.username,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      detail: auditLog.detail,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(admins, eq(auditLog.adminId, admins.id))
    .where(whereClause)
    .orderBy(desc(auditLog.createdAt))
    .limit(query.pageSize)
    .offset(offset);

  return {
    items: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

export async function getAdminDashboard(db: Database): Promise<{
  activeToday: number;
  pending: number;
  newRegistrations7d: number;
  runsToday: number;
  runsByGame: Record<string, number>;
  topGame: string | null;
  pendingQueue: Array<{
    id: string;
    username: string;
    displayName: string;
    email: string;
    createdAt: string;
  }>;
}> {
  const now = new Date();
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const wibNowMs = now.getTime() + WIB_OFFSET_MS;
  const startOfToday = new Date(
    Math.floor(wibNowMs / DAY_MS) * DAY_MS - WIB_OFFSET_MS,
  );
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);

  const activeResult = await db
    .select({ activeToday: sql<number>`count(*)::int` })
    .from(users)
    .where(gte(users.lastLoginAt, startOfToday));
  const activeToday = activeResult[0]?.activeToday ?? 0;

  const pendingResult = await db
    .select({ pending: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.status, "pending"));
  const pending = pendingResult[0]?.pending ?? 0;

  const regResult = await db
    .select({ newRegistrations7d: sql<number>`count(*)::int` })
    .from(users)
    .where(gte(users.createdAt, sevenDaysAgo));
  const newRegistrations7d = regResult[0]?.newRegistrations7d ?? 0;

  const runsResult = await db
    .select({ runsToday: sql<number>`count(*)::int` })
    .from(gameRuns)
    .where(gte(gameRuns.createdAt, startOfToday));
  const runsToday = runsResult[0]?.runsToday ?? 0;

  const runsGrouped = await db
    .select({
      gameId: gameRuns.gameId,
      count: sql<number>`count(*)::int`,
    })
    .from(gameRuns)
    .where(gte(gameRuns.createdAt, startOfToday))
    .groupBy(gameRuns.gameId);

  const runsByGame: Record<string, number> = {};
  let topGame: string | null = null;
  let maxRuns = 0;

  for (const row of runsGrouped) {
    runsByGame[row.gameId] = row.count;
    if (row.count > maxRuns) {
      maxRuns = row.count;
      topGame = row.gameId;
    }
  }

  const pendingQueue = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      email: users.email,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.status, "pending"))
    .orderBy(desc(users.createdAt))
    .limit(3);

  return {
    activeToday,
    pending,
    newRegistrations7d,
    runsToday,
    runsByGame,
    topGame,
    pendingQueue: pendingQueue.map((u) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
    })),
  };
}
