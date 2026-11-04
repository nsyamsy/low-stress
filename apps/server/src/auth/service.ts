import { eq, and, ne } from "drizzle-orm";
import type { Database } from "@low-stress/db";
import {
  chatMessages,
  chatMutes,
  gameRuns,
  gameScores,
  sessions,
  settings,
  users,
} from "@low-stress/db";
import type { LoadedGame } from "../registry/games";
import { AppError } from "../errors";
import type { Env } from "../env";
import { smtpConfigured } from "../env";
import { verifyCaptchaSolution } from "./captcha";
import {
  checkLockout,
  clearLockout,
  makeLockoutKey,
  recordFailedAttempt,
} from "./lockout";
import { hashPassword, verifyPassword } from "./password";
import {
  createSession,
  deleteAllUserSessions,
  deleteSession,
  type Me,
  userToMe,
} from "./session";
import type {
  ChangePasswordBody,
  DeleteAccountBody,
  LoginBody,
  RegisterBody,
  UpdateProfileBody,
} from "./validation";

export type RegistrationMode = "approval" | "open" | "closed";

export async function getRegistrationMode(
  db: Database,
  env: Env,
): Promise<RegistrationMode> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "registration_mode"))
    .limit(1);

  if (row && typeof row.value === "string") {
    if (
      row.value === "approval" ||
      row.value === "open" ||
      row.value === "closed"
    ) {
      return row.value;
    }
  }

  return env.DEPLOY_MODE === "lan" ? "approval" : "open";
}

export async function isCaptchaRequired(
  db: Database,
  env: Env,
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "captcha_enabled"))
    .limit(1);

  if (row && typeof row.value === "boolean") {
    return row.value;
  }

  return env.DEPLOY_MODE === "public";
}

export async function getPublicConfig(db: Database, env: Env) {
  const registration = await getRegistrationMode(db, env);
  const captcha = await isCaptchaRequired(db, env);

  return {
    registration,
    captcha,
    emailEnabled: smtpConfigured(env),
    defaultLocale: env.DEFAULT_LOCALE,
    deployMode: env.DEPLOY_MODE,
    chatEnabled: true,
  };
}

export async function registerUser(
  db: Database,
  env: Env,
  body: RegisterBody,
): Promise<{ status: "pending" | "active" }> {
  const mode = await getRegistrationMode(db, env);
  if (mode === "closed") {
    throw new AppError("REGISTRATION_CLOSED", 403);
  }

  const captchaRequired = await isCaptchaRequired(db, env);
  if (captchaRequired) {
    if (
      !body.captcha ||
      !verifyCaptchaSolution(body.captcha, env.SESSION_SECRET)
    ) {
      throw new AppError("CAPTCHA_FAILED", 400);
    }
  }

  // Cek duplikasi username (citext di Postgres)
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, body.username))
    .limit(1);

  if (existingUser) {
    throw new AppError("USERNAME_TAKEN", 409);
  }

  // Cek duplikasi email (citext di Postgres)
  const [existingEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, body.email))
    .limit(1);

  if (existingEmail) {
    throw new AppError("EMAIL_TAKEN", 409);
  }

  const passwordHash = await hashPassword(body.password);
  const status = mode === "approval" ? "pending" : "active";

  await db.insert(users).values({
    username: body.username,
    displayName: body.displayName,
    email: body.email,
    passwordHash,
    status,
    localePref: "auto",
    themePref: "system",
  });

  return { status };
}

export async function loginUser(
  db: Database,
  env: Env,
  body: LoginBody,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<{ user: Me; rawToken: string }> {
  const lockoutKey = makeLockoutKey(body.username, meta.ip);
  await checkLockout(db, lockoutKey);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, body.username))
    .limit(1);

  if (!user) {
    await recordFailedAttempt(db, lockoutKey);
    throw new AppError("AUTH_INVALID_CREDENTIALS", 401);
  }

  const validPassword = await verifyPassword(user.passwordHash, body.password);
  if (!validPassword) {
    await recordFailedAttempt(db, lockoutKey);
    throw new AppError("AUTH_INVALID_CREDENTIALS", 401);
  }

  await clearLockout(db, lockoutKey);

  if (user.status === "banned") {
    await deleteAllUserSessions(db, user.id);
    throw new AppError("ACCOUNT_BANNED", 403);
  }

  if (user.status === "suspended") {
    await deleteAllUserSessions(db, user.id);
    throw new AppError("ACCOUNT_SUSPENDED", 403);
  }

  if (user.status === "rejected") {
    throw new AppError("ACCOUNT_REJECTED", 403);
  }

  // Update last login
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  // Untuk pending, sesi tetap dibuat agar halaman /pending bisa membuka GET /api/me
  const session = await createSession(db, user.id, meta);

  return {
    user: userToMe(user),
    rawToken: session.rawToken,
  };
}

export async function logoutUser(
  db: Database,
  rawToken: string,
): Promise<void> {
  await deleteSession(db, rawToken);
}

export async function updateProfile(
  db: Database,
  userId: string,
  body: UpdateProfileBody,
): Promise<Me> {
  const [currentUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!currentUser) {
    throw new AppError("NOT_FOUND", 404);
  }

  const updates: Partial<typeof users.$inferInsert> = {};

  if (body.displayName !== undefined) {
    updates.displayName = body.displayName;
  }
  if (body.locale !== undefined) {
    updates.localePref = body.locale;
  }
  if (body.theme !== undefined) {
    updates.themePref = body.theme;
  }

  if (body.email !== undefined && body.email !== currentUser.email) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, body.email), ne(users.id, userId)))
      .limit(1);

    if (existing) {
      throw new AppError("EMAIL_TAKEN", 409);
    }

    updates.email = body.email;
    updates.emailVerifiedAt = null;
  }

  if (Object.keys(updates).length > 0) {
    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();

    if (updated) {
      return userToMe(updated);
    }
  }

  return userToMe(currentUser);
}

export async function changePassword(
  db: Database,
  userId: string,
  body: ChangePasswordBody,
): Promise<void> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new AppError("NOT_FOUND", 404);
  }

  const valid = await verifyPassword(user.passwordHash, body.currentPassword);
  if (!valid) {
    throw new AppError("AUTH_INVALID_CREDENTIALS", 401);
  }

  if (body.newPassword.toLowerCase() === user.username.toLowerCase()) {
    throw new AppError("PASSWORD_TOO_WEAK", 400);
  }

  const newHash = await hashPassword(body.newPassword);
  await db
    .update(users)
    .set({ passwordHash: newHash })
    .where(eq(users.id, userId));
}

export async function deleteAccount(
  db: Database,
  userId: string,
  body: DeleteAccountBody,
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

  const valid = await verifyPassword(user.passwordHash, body.password);
  if (!valid) {
    throw new AppError("AUTH_INVALID_CREDENTIALS", 401);
  }

  // Transaksi penghapusan akun Architecture §11
  await db.transaction(async (tx) => {
    // 1. Hapus game_scores
    await tx.delete(gameScores).where(eq(gameScores.userId, userId));

    // 2. Hapus game_runs
    await tx.delete(gameRuns).where(eq(gameRuns.userId, userId));

    // 3. Hapus chat_mutes
    await tx.delete(chatMutes).where(eq(chatMutes.userId, userId));

    // 4. Kosongkan user_id pada chat_messages (pesan tetap ada sebagai anonim)
    await tx
      .update(chatMessages)
      .set({ userId: null })
      .where(eq(chatMessages.userId, userId));

    // 5. Hapus semua sesi pengguna
    await tx
      .delete(sessions)
      .where(
        and(eq(sessions.subjectId, userId), eq(sessions.subjectType, "user")),
      );

    // 6. Jalankan hook onUserDeleted game bila tersedia
    for (const game of games) {
      if (game.manifest.server) {
        try {
          const serverMod = await game.manifest.server();
          if (serverMod.onUserDeleted) {
            await serverMod.onUserDeleted({ userId, db: tx });
          }
        } catch {
          // Gagal hook game tidak membatalkan transaksi inti
        }
      }
    }

    // 7. Hapus baris users
    await tx.delete(users).where(eq(users.id, userId));
  });
}
