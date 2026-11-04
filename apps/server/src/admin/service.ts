import crypto from "node:crypto";
import { and, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import type { Database } from "@low-stress/db";
import {
  admins,
  auditLog,
  chatMessages,
  gameRuns,
  gameScores,
  sessions,
  settings,
  users,
} from "@low-stress/db";
import { AppError } from "../errors";
import type { Env } from "../env";
import { smtpConfigured } from "../env";
import {
  checkLockout,
  clearLockout,
  makeLockoutKey,
  recordFailedAttempt,
} from "../auth/lockout";
import { hashPassword, verifyPassword } from "../auth/password";
import {
  createAdminSession,
  deleteAllUserSessions,
  deleteSession,
} from "../auth/session";
import type { LoadedGame } from "../registry/games";
import { getLeaderboardBounds, recomputeGameScore } from "../games/scores";
import type { AdminRunsQueryInput } from "./validation";

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

export async function loginAdmin(
  db: Database,
  params: { username: string; password: string },
  meta: { ip?: string; userAgent?: string } = {},
): Promise<{ admin: { id: string; username: string }; rawToken: string }> {
  const username = params.username.trim().toLowerCase();
  const lockoutKey = makeLockoutKey(`admin:${username}`, meta.ip);

  await checkLockout(db, lockoutKey);

  const [admin] = await db
    .select()
    .from(admins)
    .where(eq(admins.username, username))
    .limit(1);

  if (!admin) {
    await recordFailedAttempt(db, lockoutKey);
    throw new AppError("AUTH_INVALID_CREDENTIALS", 401);
  }

  const validPassword = await verifyPassword(admin.passwordHash, params.password);
  if (!validPassword) {
    await recordFailedAttempt(db, lockoutKey);
    throw new AppError("AUTH_INVALID_CREDENTIALS", 401);
  }

  await clearLockout(db, lockoutKey);

  await db
    .update(admins)
    .set({ lastLoginAt: new Date() })
    .where(eq(admins.id, admin.id));

  const { rawToken } = await createAdminSession(db, admin.id, meta);

  return {
    admin: {
      id: admin.id,
      username: admin.username,
    },
    rawToken,
  };
}

export async function logoutAdmin(db: Database, rawToken: string): Promise<void> {
  await deleteSession(db, rawToken);
}

export async function listUsers(
  db: Database,
  query: {
    status?: "pending" | "active" | "rejected" | "suspended" | "banned";
    q?: string;
    page: number;
    pageSize: number;
  },
): Promise<{
  items: Array<{
    id: string;
    username: string;
    displayName: string;
    email: string;
    status: string;
    createdAt: string;
    lastLoginAt: string | null;
  }>;
  page: number;
  pageSize: number;
  total: number;
}> {
  const conditions = [];

  if (query.status) {
    conditions.push(eq(users.status, query.status));
  }

  if (query.q && query.q.trim()) {
    const searchPattern = `%${query.q.trim()}%`;
    conditions.push(
      or(
        ilike(users.username, searchPattern),
        ilike(users.displayName, searchPattern),
        ilike(users.email, searchPattern),
      ),
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(whereClause);
  const total = countResult[0]?.count ?? 0;

  const offset = (query.page - 1) * query.pageSize;

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      email: users.email,
      status: users.status,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(whereClause)
    .orderBy(desc(users.createdAt))
    .limit(query.pageSize)
    .offset(offset);

  return {
    items: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

export async function updateUserStatus(
  db: Database,
  adminId: string,
  userId: string,
  action: "approve" | "reject" | "suspend" | "ban" | "activate" | "reset-password",
): Promise<{ temporaryPassword?: string }> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new AppError("NOT_FOUND", 404);
  }

  const currentStatus = user.status;

  if (action === "approve") {
    if (currentStatus !== "pending") {
      throw new AppError("INVALID_TRANSITION", 409);
    }
    await db
      .update(users)
      .set({
        status: "active",
        approvedAt: new Date(),
        approvedBy: adminId,
      })
      .where(eq(users.id, userId));

    await recordAuditLog(db, {
      adminId,
      action: "user.approve",
      targetType: "user",
      targetId: userId,
      detail: { from: currentStatus, to: "active" },
    });
    return {};
  }

  if (action === "reject") {
    if (currentStatus !== "pending") {
      throw new AppError("INVALID_TRANSITION", 409);
    }
    await db
      .update(users)
      .set({
        status: "rejected",
      })
      .where(eq(users.id, userId));

    await recordAuditLog(db, {
      adminId,
      action: "user.reject",
      targetType: "user",
      targetId: userId,
      detail: { from: currentStatus, to: "rejected" },
    });
    return {};
  }

  if (action === "suspend") {
    if (currentStatus !== "active") {
      throw new AppError("INVALID_TRANSITION", 409);
    }
    await db
      .update(users)
      .set({
        status: "suspended",
      })
      .where(eq(users.id, userId));

    await deleteAllUserSessions(db, userId);

    await recordAuditLog(db, {
      adminId,
      action: "user.suspend",
      targetType: "user",
      targetId: userId,
      detail: { from: currentStatus, to: "suspended" },
    });
    return {};
  }

  if (action === "ban") {
    if (currentStatus !== "active" && currentStatus !== "suspended") {
      throw new AppError("INVALID_TRANSITION", 409);
    }
    await db
      .update(users)
      .set({
        status: "banned",
      })
      .where(eq(users.id, userId));

    await deleteAllUserSessions(db, userId);

    await recordAuditLog(db, {
      adminId,
      action: "user.ban",
      targetType: "user",
      targetId: userId,
      detail: { from: currentStatus, to: "banned" },
    });
    return {};
  }

  if (action === "activate") {
    if (
      currentStatus !== "suspended" &&
      currentStatus !== "banned" &&
      currentStatus !== "rejected"
    ) {
      throw new AppError("INVALID_TRANSITION", 409);
    }
    const nextStatus = currentStatus === "rejected" ? "pending" : "active";
    await db
      .update(users)
      .set({
        status: nextStatus,
      })
      .where(eq(users.id, userId));

    await recordAuditLog(db, {
      adminId,
      action: "user.activate",
      targetType: "user",
      targetId: userId,
      detail: { from: currentStatus, to: nextStatus },
    });
    return {};
  }

  if (action === "reset-password") {
    const temporaryPassword = crypto.randomBytes(6).toString("hex");
    const passwordHash = await hashPassword(temporaryPassword);

    await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, userId));

    await deleteAllUserSessions(db, userId);

    await recordAuditLog(db, {
      adminId,
      action: "user.reset_password",
      targetType: "user",
      targetId: userId,
    });

    return { temporaryPassword };
  }

  throw new AppError("VALIDATION_FAILED", 400);
}

export async function bulkUpdateUsers(
  db: Database,
  adminId: string,
  ids: string[],
  action: "approve" | "reject",
): Promise<{ updatedCount: number }> {
  const pendingUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, ids), eq(users.status, "pending")));

  if (pendingUsers.length === 0) {
    return { updatedCount: 0 };
  }

  const pendingIds = pendingUsers.map((u) => u.id);

  if (action === "approve") {
    await db
      .update(users)
      .set({
        status: "active",
        approvedAt: new Date(),
        approvedBy: adminId,
      })
      .where(inArray(users.id, pendingIds));
  } else {
    await db
      .update(users)
      .set({
        status: "rejected",
      })
      .where(inArray(users.id, pendingIds));
  }

  for (const id of pendingIds) {
    await recordAuditLog(db, {
      adminId,
      action: `users.bulk_${action}`,
      targetType: "user",
      targetId: id,
      detail: { action },
    });
  }

  return { updatedCount: pendingIds.length };
}

export async function deleteUserByAdmin(
  db: Database,
  adminId: string,
  userId: string,
  games: readonly LoadedGame[] = [],
): Promise<void> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new AppError("NOT_FOUND", 404);
  }

  await db.transaction(async (tx) => {
    // 1. Hapus skor dan run
    await tx.delete(gameScores).where(eq(gameScores.userId, userId));
    await tx.delete(gameRuns).where(eq(gameRuns.userId, userId));

    // 2. Putuskan relasi chat publik
    await tx
      .update(chatMessages)
      .set({ userId: null })
      .where(eq(chatMessages.userId, userId));

    // 3. Hapus semua sesi
    await tx
      .delete(sessions)
      .where(
        and(eq(sessions.subjectId, userId), eq(sessions.subjectType, "user")),
      );

    // 4. Hook onUserDeleted
    for (const loaded of games) {
      if (loaded.manifest.server) {
        try {
          const serverMod = await loaded.manifest.server();
          if (serverMod.onUserDeleted) {
            await serverMod.onUserDeleted({ userId, db: tx });
          }
        } catch {
          // Abaikan kegagalan hook game agar proses hapus akun tidak terhenti
        }
      }
    }

    // 5. Hapus baris user
    await tx.delete(users).where(eq(users.id, userId));
  });

  await recordAuditLog(db, {
    adminId,
    action: "user.delete",
    targetType: "user",
    targetId: userId,
    detail: { username: user.username, email: user.email },
  });
}

export interface AdminSettingsData {
  registration: "approval" | "open" | "closed";
  defaultLocale: "auto" | "id" | "en";
  globalSchedule: {
    enabled: boolean;
    windows: Array<{ start: string; end: string }>;
    days: number[];
  };
  chatEnabled: boolean;
  ludoMaxPlayers: number;
  smtp: {
    configured: boolean;
    enabled: boolean;
  };
}

export async function getAdminSettings(
  db: Database,
  env: Env,
): Promise<AdminSettingsData> {
  const rows = await db.select().from(settings);
  const map = new Map<string, unknown>();
  for (const r of rows) {
    map.set(r.key, r.value);
  }

  const registration =
    (map.get("registration") as "approval" | "open" | "closed") ?? "approval";
  const defaultLocale =
    (map.get("defaultLocale") as "auto" | "id" | "en") ?? "auto";
  const globalSchedule = (map.get("globalSchedule") as AdminSettingsData["globalSchedule"]) ?? {
    enabled: false,
    windows: [{ start: "12:00", end: "13:00" }],
    days: [1, 2, 3, 4, 5],
  };
  const chatEnabled =
    typeof map.get("chatEnabled") === "boolean"
      ? (map.get("chatEnabled") as boolean)
      : true;
  const ludoMaxPlayers =
    typeof map.get("ludoMaxPlayers") === "number"
      ? (map.get("ludoMaxPlayers") as number)
      : 12;

  const isSmtp = smtpConfigured(env);

  return {
    registration,
    defaultLocale,
    globalSchedule,
    chatEnabled,
    ludoMaxPlayers,
    smtp: {
      configured: isSmtp,
      enabled: isSmtp,
    },
  };
}

export async function updateAdminSettings(
  db: Database,
  adminId: string,
  env: Env,
  patch: Partial<Omit<AdminSettingsData, "smtp">>,
): Promise<AdminSettingsData> {
  const now = new Date();

  for (const [key, val] of Object.entries(patch)) {
    if (val === undefined) continue;

    await db
      .insert(settings)
      .values({
        key,
        value: val as Record<string, unknown>,
        updatedAt: now,
        updatedBy: adminId,
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: val as Record<string, unknown>,
          updatedAt: now,
          updatedBy: adminId,
        },
      });

    if (key === "registration") {
      await db
        .insert(settings)
        .values({
          key: "registration_mode",
          value: val as Record<string, unknown>,
          updatedAt: now,
          updatedBy: adminId,
        })
        .onConflictDoUpdate({
          target: settings.key,
          set: {
            value: val as Record<string, unknown>,
            updatedAt: now,
            updatedBy: adminId,
          },
        });
    }

    await recordAuditLog(db, {
      adminId,
      action: "settings.update",
      targetType: "setting",
      targetId: key,
      detail: { key, value: val },
    });
  }

  return getAdminSettings(db, env);
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
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 1. Pemain aktif hari ini (lastLoginAt >= startOfToday)
  const activeResult = await db
    .select({ activeToday: sql<number>`count(*)::int` })
    .from(users)
    .where(gte(users.lastLoginAt, startOfToday));
  const activeToday = activeResult[0]?.activeToday ?? 0;

  // 2. Pending queue count
  const pendingResult = await db
    .select({ pending: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.status, "pending"));
  const pending = pendingResult[0]?.pending ?? 0;

  // 3. Pendaftar baru 7 hari terakhir
  const regResult = await db
    .select({ newRegistrations7d: sql<number>`count(*)::int` })
    .from(users)
    .where(gte(users.createdAt, sevenDaysAgo));
  const newRegistrations7d = regResult[0]?.newRegistrations7d ?? 0;

  // 4. Runs hari ini
  const runsResult = await db
    .select({ runsToday: sql<number>`count(*)::int` })
    .from(gameRuns)
    .where(gte(gameRuns.createdAt, startOfToday));
  const runsToday = runsResult[0]?.runsToday ?? 0;

  // 5. Runs by game hari ini
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

  // 6. 3 teratas antrean pending untuk pratinjau dashboard
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

/**
 * Daftar run game untuk moderasi admin (API_Spec §6, ROADMAP P5-05 & P8-05).
 * Mendukung filter menurut game dan penanda `flagged`.
 */
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
    items: rows.map((r) => ({
      id: r.id,
      gameId: r.gameId,
      score: r.score,
      durationMs: r.durationMs,
      flagged: r.flagged,
      createdAt: r.createdAt.toISOString(),
      user: {
        id: r.userId,
        username: r.username,
        displayName: r.displayName,
      },
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

/**
 * Menghapus suatu run dan menghitung ulang `game_scores` pemain (API_Spec §6).
 * Dicatat dalam audit log.
 */
export async function deleteGameRun(
  db: Database,
  adminId: string,
  runId: string,
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

  // Hitung ulang game_scores pemain
  await recomputeGameScore(db, run.userId, run.gameId);

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

/**
 * Reset leaderboard untuk periode tertentu (week / month) (API_Spec §6).
 * Menghapus run pada periode berjalan dan menghitung ulang skor pemain.
 */
export async function resetLeaderboard(
  db: Database,
  adminId: string,
  gameId: string,
  period: "week" | "month",
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

    const affectedUserIds = [...new Set(runsToDelete.map((r) => r.userId))];
    for (const uid of affectedUserIds) {
      await recomputeGameScore(db, uid, gameId);
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
