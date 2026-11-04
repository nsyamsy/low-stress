import { createHash, randomBytes } from "node:crypto";
import { eq, and, gt } from "drizzle-orm";
import type { Database } from "@low-stress/db";
import { admins, sessions, users, type userStatus } from "@low-stress/db";
import { censorProfanity } from "@low-stress/sdk";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Env } from "../env";

export const SESSION_COOKIE_NAME = "ls_session";
export const ADMIN_COOKIE_NAME = "ls_admin";
export const CSRF_COOKIE_NAME = "ls_csrf";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

export interface Me {
  id: string;
  username: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  status: (typeof userStatus.enumValues)[number];
  locale: "auto" | "id" | "en";
  theme: "system" | "light" | "dark";
  createdAt: string;
}

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function userToMe(user: typeof users.$inferSelect): Me {
  return {
    id: user.id,
    username: user.username,
    displayName: censorProfanity(user.displayName),
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    status: user.status,
    locale: user.localePref,
    theme: user.themePref,
    createdAt: user.createdAt.toISOString(),
  };
}

export function isSecure(env: Env, request: FastifyRequest): boolean {
  if (env.COOKIE_SECURE === "true") return true;
  if (env.COOKIE_SECURE === "false") return false;
  return request.protocol === "https";
}

export function setSessionCookie(
  reply: FastifyReply,
  env: Env,
  request: FastifyRequest,
  rawToken: string,
): void {
  reply.setCookie(SESSION_COOKIE_NAME, rawToken, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure(env, request),
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(
  reply: FastifyReply,
  env: Env,
  request: FastifyRequest,
): void {
  reply.clearCookie(SESSION_COOKIE_NAME, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure(env, request),
  });
}

export function setCsrfCookie(
  reply: FastifyReply,
  env: Env,
  request: FastifyRequest,
  token: string,
): void {
  reply.setCookie(CSRF_COOKIE_NAME, token, {
    path: "/",
    httpOnly: false, // Klien butuh membaca cookie untuk double submit
    sameSite: "lax",
    secure: isSecure(env, request),
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function createSession(
  db: Database,
  userId: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    id: tokenHash,
    subjectType: "user",
    subjectId: userId,
    expiresAt,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  });

  return { rawToken, expiresAt };
}

export async function deleteSession(
  db: Database,
  rawToken: string,
): Promise<void> {
  const tokenHash = hashToken(rawToken);
  await db.delete(sessions).where(eq(sessions.id, tokenHash));
}

export async function deleteAllUserSessions(
  db: Database,
  userId: string,
): Promise<void> {
  await db
    .delete(sessions)
    .where(
      and(
        eq(sessions.subjectId, userId),
        eq(sessions.subjectType, "user"),
      ),
    );
}

export async function getSessionUser(
  db: Database,
  rawToken: string,
): Promise<{ session: typeof sessions.$inferSelect; user: typeof users.$inferSelect } | null> {
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.id, tokenHash),
        gt(sessions.expiresAt, now),
      ),
    )
    .limit(1);

  if (!session) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.subjectId))
    .limit(1);

  if (!user) {
    // Sesi yatim piatu, bersihkan
    await db.delete(sessions).where(eq(sessions.id, tokenHash));
    return null;
  }

  return { session, user };
}

export function setAdminSessionCookie(
  reply: FastifyReply,
  env: Env,
  request: FastifyRequest,
  rawToken: string,
): void {
  reply.setCookie(ADMIN_COOKIE_NAME, rawToken, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure(env, request),
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearAdminSessionCookie(
  reply: FastifyReply,
  env: Env,
  request: FastifyRequest,
): void {
  reply.clearCookie(ADMIN_COOKIE_NAME, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure(env, request),
  });
}

export async function createAdminSession(
  db: Database,
  adminId: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    id: tokenHash,
    subjectType: "admin",
    subjectId: adminId,
    expiresAt,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  });

  return { rawToken, expiresAt };
}

export async function getAdminSession(
  db: Database,
  rawToken: string,
): Promise<{ session: typeof sessions.$inferSelect; admin: typeof admins.$inferSelect } | null> {
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.id, tokenHash),
        eq(sessions.subjectType, "admin"),
        gt(sessions.expiresAt, now),
      ),
    )
    .limit(1);

  if (!session) return null;

  const [admin] = await db
    .select()
    .from(admins)
    .where(eq(admins.id, session.subjectId))
    .limit(1);

  if (!admin) {
    await db.delete(sessions).where(eq(sessions.id, tokenHash));
    return null;
  }

  return { session, admin };
}

