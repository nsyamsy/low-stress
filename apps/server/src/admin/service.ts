import crypto from "node:crypto";
import { and, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import type { Database } from "@low-stress/db";
import {
  admins,
  auditLog,
  bannedWords,
  chatMessages,
  chatMutes,
  gameRuns,
  gameScores,
  ludoMessages,
  ludoPlayers,
  ludoRooms,
  riotMatches,
  riotRoomPlayers,
  riotRooms,
  sessions,
  settings,
  users,
} from "@low-stress/db";
import { censorServerText } from "../chat/profanity-service";
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
import { resolveGameServerModule, type LoadedGame } from "../registry/games";
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

    // 2. Hapus chat_mutes dan putuskan relasi chat publik
    await tx.delete(chatMutes).where(eq(chatMutes.userId, userId));
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
      try {
        const serverMod =
          loaded.serverModule ?? (await resolveGameServerModule(loaded));
        if (serverMod?.onUserDeleted) {
          await serverMod.onUserDeleted({ userId, db: tx, logger: console });
        }
      } catch {
        // Abaikan kegagalan hook game agar proses hapus akun tidak terhenti
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
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const wibNowMs = now.getTime() + WIB_OFFSET_MS;
  const startOfToday = new Date(
    Math.floor(wibNowMs / DAY_MS) * DAY_MS - WIB_OFFSET_MS,
  );
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);

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

/**
 * Menghapus suatu run dan menghitung ulang `game_scores` pemain (API_Spec §6).
 * Dicatat dalam audit log.
 */
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

  // Hitung ulang game_scores pemain
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

/**
 * Reset leaderboard untuk periode tertentu (week / month) (API_Spec §6).
 * Menghapus run pada periode berjalan dan menghitung ulang skor pemain.
 */
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

/**
 * Moderasi Ludo: Daftar semua room
 */
export async function listAdminLudoRooms(
  db: Database,
  status?: string,
) {
  const conditions = [];
  if (status) {
    conditions.push(eq(ludoRooms.status, status));
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: ludoRooms.id,
      name: ludoRooms.name,
      status: ludoRooms.status,
      hostId: ludoRooms.hostId,
      hostName: users.displayName,
      maxPlayers: ludoRooms.maxPlayers,
      pawns: ludoRooms.pawns,
      lastActivityAt: ludoRooms.lastActivityAt,
      createdAt: ludoRooms.createdAt,
      playersCount: sql<number>`(
        SELECT COUNT(*)::int FROM ludo_players lp
         WHERE lp.room_id = ${ludoRooms.id} AND lp.status = 'accepted'
      )`,
    })
    .from(ludoRooms)
    .innerJoin(users, eq(users.id, ludoRooms.hostId))
    .where(whereClause)
    .orderBy(desc(ludoRooms.lastActivityAt));

  return {
    items: rows.map((r) => ({
      ...r,
      lastActivityAt: r.lastActivityAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/**
 * Moderasi Ludo: Rincian room lengkap termasuk chat
 */
export async function getAdminLudoRoomDetail(
  db: Database,
  roomId: string,
) {
  const [room] = await db
    .select({
      id: ludoRooms.id,
      name: ludoRooms.name,
      status: ludoRooms.status,
      hostId: ludoRooms.hostId,
      hostName: users.displayName,
      maxPlayers: ludoRooms.maxPlayers,
      pawns: ludoRooms.pawns,
      state: ludoRooms.state,
      version: ludoRooms.version,
      startedAt: ludoRooms.startedAt,
      finishedAt: ludoRooms.finishedAt,
      lastActivityAt: ludoRooms.lastActivityAt,
      createdAt: ludoRooms.createdAt,
    })
    .from(ludoRooms)
    .innerJoin(users, eq(users.id, ludoRooms.hostId))
    .where(eq(ludoRooms.id, roomId))
    .limit(1);

  if (!room) {
    throw new AppError("NOT_FOUND", 404, { roomId });
  }

  const players = await db
    .select({
      userId: ludoPlayers.userId,
      username: users.username,
      displayName: users.displayName,
      status: ludoPlayers.status,
      pawn: ludoPlayers.pawn,
      autopilot: ludoPlayers.autopilot,
      joinedAt: ludoPlayers.joinedAt,
    })
    .from(ludoPlayers)
    .innerJoin(users, eq(users.id, ludoPlayers.userId))
    .where(eq(ludoPlayers.roomId, roomId));

  const messages = await db
    .select({
      id: ludoMessages.id,
      userId: ludoMessages.userId,
      userName: users.displayName,
      body: ludoMessages.body,
      createdAt: ludoMessages.createdAt,
    })
    .from(ludoMessages)
    .leftJoin(users, eq(users.id, ludoMessages.userId))
    .where(eq(ludoMessages.roomId, roomId))
    .orderBy(desc(ludoMessages.id))
    .limit(100);

  return {
    room: {
      ...room,
      startedAt: room.startedAt?.toISOString() ?? null,
      finishedAt: room.finishedAt?.toISOString() ?? null,
      lastActivityAt: room.lastActivityAt.toISOString(),
      createdAt: room.createdAt.toISOString(),
    },
    players: players.map((p) => ({
      ...p,
      joinedAt: p.joinedAt?.toISOString() ?? null,
    })),
    messages: messages.reverse().map((m) => ({
      id: m.id,
      userId: m.userId,
      userName: m.userName ?? "System",
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/**
 * Moderasi Ludo: Reset room ke lobi
 */
export async function adminResetLudoRoom(
  db: Database,
  adminId: string,
  roomId: string,
) {
  const [room] = await db
    .select({ id: ludoRooms.id, name: ludoRooms.name })
    .from(ludoRooms)
    .where(eq(ludoRooms.id, roomId))
    .limit(1);

  if (!room) {
    throw new AppError("NOT_FOUND", 404, { roomId });
  }

  await db
    .update(ludoRooms)
    .set({
      status: "lobby",
      state: null,
      seatUsers: null,
      pawns: null,
      startedAt: null,
      finishedAt: null,
      version: sql`${ludoRooms.version} + 1`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
      lastActivityAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(ludoRooms.id, roomId));

  await recordAuditLog(db, {
    adminId,
    action: "ludo_reset_room",
    targetType: "ludo_room",
    targetId: roomId,
    detail: { roomName: room.name },
  });

  return { ok: true };
}

/**
 * Moderasi Ludo: Keluarkan pemain
 */
export async function adminKickLudoPlayer(
  db: Database,
  adminId: string,
  roomId: string,
  userId: string,
) {
  const [player] = await db
    .select({ roomId: ludoPlayers.roomId })
    .from(ludoPlayers)
    .where(
      and(
        eq(ludoPlayers.roomId, roomId),
        eq(ludoPlayers.userId, userId),
      ),
    )
    .limit(1);

  if (!player) {
    throw new AppError("NOT_FOUND", 404, { roomId, userId });
  }

  await db
    .delete(ludoPlayers)
    .where(
      and(
        eq(ludoPlayers.roomId, roomId),
        eq(ludoPlayers.userId, userId),
      ),
    );

  await db
    .update(ludoRooms)
    .set({
      version: sql`${ludoRooms.version} + 1`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
      lastActivityAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(ludoRooms.id, roomId));

  await recordAuditLog(db, {
    adminId,
    action: "ludo_kick_player",
    targetType: "ludo_room",
    targetId: roomId,
    detail: { kickedUserId: userId },
  });

  return { ok: true };
}

/**
 * Moderasi Ludo: Hapus room
 */
export async function adminDeleteLudoRoom(
  db: Database,
  adminId: string,
  roomId: string,
) {
  const [room] = await db
    .select({ id: ludoRooms.id, name: ludoRooms.name })
    .from(ludoRooms)
    .where(eq(ludoRooms.id, roomId))
    .limit(1);

  if (!room) {
    throw new AppError("NOT_FOUND", 404, { roomId });
  }

  await db.delete(ludoRooms).where(eq(ludoRooms.id, roomId));

  await recordAuditLog(db, {
    adminId,
    action: "ludo_delete_room",
    targetType: "ludo_room",
    targetId: roomId,
    detail: { roomName: room.name },
  });

  return { ok: true };
}

/**
 * Moderasi Riot (RT-51): Daftar semua room.
 * Chat rapat bersifat ephemeral (memori server, tidak dipersist), jadi
 * riwayat yang dapat dilihat admin adalah room, pemain, dan hasil match.
 */
export async function listAdminRiotRooms(db: Database, status?: string) {
  const conditions = [];
  if (status) {
    conditions.push(eq(riotRooms.status, status));
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: riotRooms.id,
      name: riotRooms.name,
      status: riotRooms.status,
      hostId: riotRooms.hostId,
      hostName: users.displayName,
      options: riotRooms.options,
      lastActivityAt: riotRooms.lastActivityAt,
      createdAt: riotRooms.createdAt,
      playersCount: sql<number>`(
        SELECT COUNT(*)::int FROM riot_room_players rp
         WHERE rp.room_id = ${riotRooms.id}
      )`,
    })
    .from(riotRooms)
    .innerJoin(users, eq(users.id, riotRooms.hostId))
    .where(whereClause)
    .orderBy(desc(riotRooms.lastActivityAt));

  return {
    items: rows.map((r) => ({
      ...r,
      lastActivityAt: r.lastActivityAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/**
 * Moderasi Riot (RT-51): Rincian room lengkap (pemain + riwayat match).
 */
export async function getAdminRiotRoomDetail(db: Database, roomId: string) {
  const [room] = await db
    .select({
      id: riotRooms.id,
      name: riotRooms.name,
      status: riotRooms.status,
      hostId: riotRooms.hostId,
      hostName: users.displayName,
      options: riotRooms.options,
      lastActivityAt: riotRooms.lastActivityAt,
      createdAt: riotRooms.createdAt,
    })
    .from(riotRooms)
    .innerJoin(users, eq(users.id, riotRooms.hostId))
    .where(eq(riotRooms.id, roomId))
    .limit(1);

  if (!room) {
    throw new AppError("NOT_FOUND", 404, { roomId });
  }

  const players = await db
    .select({
      userId: riotRoomPlayers.userId,
      username: users.username,
      displayName: users.displayName,
      status: riotRoomPlayers.status,
      character: riotRoomPlayers.character,
      joinedAt: riotRoomPlayers.joinedAt,
    })
    .from(riotRoomPlayers)
    .innerJoin(users, eq(users.id, riotRoomPlayers.userId))
    .where(eq(riotRoomPlayers.roomId, roomId));

  const matches = await db
    .select({
      id: riotMatches.id,
      winner: riotMatches.winner,
      startedAt: riotMatches.startedAt,
      endedAt: riotMatches.endedAt,
      players: riotMatches.players,
    })
    .from(riotMatches)
    .where(eq(riotMatches.roomId, roomId))
    .orderBy(desc(riotMatches.endedAt));

  return {
    room: {
      ...room,
      lastActivityAt: room.lastActivityAt.toISOString(),
      createdAt: room.createdAt.toISOString(),
    },
    players: players.map((p) => ({
      ...p,
      joinedAt: p.joinedAt?.toISOString() ?? null,
    })),
    matches: matches.map((m) => ({
      ...m,
      startedAt: m.startedAt?.toISOString() ?? null,
      endedAt: m.endedAt?.toISOString() ?? null,
    })),
  };
}

/**
 * Moderasi Riot (RT-51): Reset room ke lobby.
 */
export async function adminResetRiotRoom(
  db: Database,
  adminId: string,
  roomId: string,
  games: readonly LoadedGame[] = [],
) {
  const [room] = await db
    .select({ id: riotRooms.id, name: riotRooms.name })
    .from(riotRooms)
    .where(eq(riotRooms.id, roomId))
    .limit(1);

  if (!room) {
    throw new AppError("NOT_FOUND", 404, { roomId });
  }

  await db
    .update(riotRooms)
    .set({
      status: "lobby",
      updatedAt: sql`CURRENT_TIMESTAMP`,
      lastActivityAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(riotRooms.id, roomId));

  const riotGame = games.find((g) => g.manifest.id === "riot");
  if (riotGame) {
    try {
      const serverMod =
        riotGame.serverModule ?? (await resolveGameServerModule(riotGame));
      await serverMod?.adminResetRoom?.(roomId);
    } catch {
      // Abaikan kegagalan sinkronisasi memori
    }
  }

  await recordAuditLog(db, {
    adminId,
    action: "riot_reset_room",
    targetType: "riot_room",
    targetId: roomId,
    detail: { roomName: room.name },
  });

  return { ok: true };
}

/**
 * Moderasi Riot (RT-51): Keluarkan pemain dari room.
 */
export async function adminKickRiotPlayer(
  db: Database,
  adminId: string,
  roomId: string,
  userId: string,
  games: readonly LoadedGame[] = [],
) {
  const [player] = await db
    .select({ roomId: riotRoomPlayers.roomId })
    .from(riotRoomPlayers)
    .where(
      and(
        eq(riotRoomPlayers.roomId, roomId),
        eq(riotRoomPlayers.userId, userId),
      ),
    )
    .limit(1);

  if (!player) {
    throw new AppError("NOT_FOUND", 404, { roomId, userId });
  }

  await db
    .delete(riotRoomPlayers)
    .where(
      and(
        eq(riotRoomPlayers.roomId, roomId),
        eq(riotRoomPlayers.userId, userId),
      ),
    );

  await db
    .update(riotRooms)
    .set({
      updatedAt: sql`CURRENT_TIMESTAMP`,
      lastActivityAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(riotRooms.id, roomId));

  const riotGame = games.find((g) => g.manifest.id === "riot");
  if (riotGame) {
    try {
      const serverMod =
        riotGame.serverModule ?? (await resolveGameServerModule(riotGame));
      await serverMod?.adminKickPlayer?.(roomId, userId);
    } catch {
      // Abaikan kegagalan sinkronisasi memori
    }
  }

  await recordAuditLog(db, {
    adminId,
    action: "riot_kick_player",
    targetType: "riot_room",
    targetId: roomId,
    detail: { kickedUserId: userId },
  });

  return { ok: true };
}

/**
 * Moderasi Riot (RT-51): Hapus room (pemain & match ikut terhapus via cascade).
 */
export async function adminDeleteRiotRoom(
  db: Database,
  adminId: string,
  roomId: string,
  games: readonly LoadedGame[] = [],
) {
  const [room] = await db
    .select({ id: riotRooms.id, name: riotRooms.name })
    .from(riotRooms)
    .where(eq(riotRooms.id, roomId))
    .limit(1);

  if (!room) {
    throw new AppError("NOT_FOUND", 404, { roomId });
  }

  await db.delete(riotRooms).where(eq(riotRooms.id, roomId));

  const riotGame = games.find((g) => g.manifest.id === "riot");
  if (riotGame) {
    try {
      const serverMod =
        riotGame.serverModule ?? (await resolveGameServerModule(riotGame));
      await serverMod?.adminDeleteRoom?.(roomId);
    } catch {
      // Abaikan kegagalan sinkronisasi memori
    }
  }

  await recordAuditLog(db, {
    adminId,
    action: "riot_delete_room",
    targetType: "riot_room",
    targetId: roomId,
    detail: { roomName: room.name },
  });

  return { ok: true };
}

/**
 * Kelola kata terlarang: Ambil semua kata
 */
export async function listBannedWords(db: Database) {
  return db
    .select()
    .from(bannedWords)
    .orderBy(bannedWords.word);
}

/**
 * Kelola kata terlarang: Tambah kata baru
 */
export async function createBannedWord(
  db: Database,
  adminId: string,
  word: string,
  lang: "id" | "en" | "any" = "any",
) {
  const [row] = await db
    .insert(bannedWords)
    .values({
      word: word.toLowerCase().trim(),
      lang,
      source: "admin",
      enabled: true,
    })
    .returning();

  await recordAuditLog(db, {
    adminId,
    action: "banned_word_add",
    targetType: "banned_word",
    targetId: row!.id,
    detail: { word: row!.word, lang: row!.lang },
  });

  return row!;
}

/**
 * Kelola kata terlarang: Aktifkan/nonaktifkan kata
 */
export async function updateBannedWord(
  db: Database,
  adminId: string,
  id: string,
  enabled: boolean,
) {
  const [row] = await db
    .update(bannedWords)
    .set({ enabled })
    .where(eq(bannedWords.id, id))
    .returning();

  if (!row) {
    throw new AppError("NOT_FOUND", 404, { id });
  }

  await recordAuditLog(db, {
    adminId,
    action: "banned_word_update",
    targetType: "banned_word",
    targetId: id,
    detail: { word: row.word, enabled },
  });

  return row;
}

/**
 * Kelola kata terlarang: Hapus kata
 */
export async function deleteBannedWord(
  db: Database,
  adminId: string,
  id: string,
) {
  const [row] = await db
    .delete(bannedWords)
    .where(eq(bannedWords.id, id))
    .returning();

  if (!row) {
    throw new AppError("NOT_FOUND", 404, { id });
  }

  await recordAuditLog(db, {
    adminId,
    action: "banned_word_delete",
    targetType: "banned_word",
    targetId: id,
    detail: { word: row.word },
  });

  return { ok: true };
}

