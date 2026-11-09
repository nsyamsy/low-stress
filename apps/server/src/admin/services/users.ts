import crypto from "node:crypto";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { Database } from "@low-stress/db";
import {
  admins,
  chatMessages,
  chatMutes,
  gameRuns,
  gameScores,
  sessions,
  users,
} from "@low-stress/db";
import { AppError } from "../../errors";
import {
  checkLockout,
  clearLockout,
  makeLockoutKey,
  recordFailedAttempt,
} from "../../auth/lockout";
import { hashPassword, verifyPassword } from "../../auth/password";
import {
  createAdminSession,
  deleteAllUserSessions,
  deleteSession,
} from "../../auth/session";
import { resolveGameServerModule, type LoadedGame } from "../../registry/games";
import { recordAuditLog } from "./audit";

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
    await tx.delete(gameScores).where(eq(gameScores.userId, userId));
    await tx.delete(gameRuns).where(eq(gameRuns.userId, userId));

    await tx.delete(chatMutes).where(eq(chatMutes.userId, userId));
    await tx
      .update(chatMessages)
      .set({ userId: null })
      .where(eq(chatMessages.userId, userId));

    await tx
      .delete(sessions)
      .where(
        and(eq(sessions.subjectId, userId), eq(sessions.subjectType, "user")),
      );

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
