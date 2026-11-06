import type { FastifyReply, FastifyRequest } from "fastify";
import type { Database } from "@low-stress/db";
import { type admins, type users } from "@low-stress/db";
import { AppError } from "../errors";
import type { Env } from "../env";
import {
  ADMIN_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  deleteAllUserSessions,
  getAdminSession,
  getSessionUser,
  SESSION_COOKIE_NAME,
} from "./session";

declare module "fastify" {
  interface FastifyRequest {
    user?: typeof users.$inferSelect;
    admin?: typeof admins.$inferSelect;
  }
}

export function createAuthMiddleware(db: Database) {
  return async function requireAuth(
    request: FastifyRequest,
  ): Promise<void> {
    const rawToken = request.cookies[SESSION_COOKIE_NAME];
    if (!rawToken) {
      const adminToken = request.cookies[ADMIN_COOKIE_NAME];
      if (adminToken) {
        const adminResult = await getAdminSession(db, adminToken);
        if (adminResult) {
          throw new AppError("FORBIDDEN", 403);
        }
      }
      throw new AppError("UNAUTHENTICATED", 401);
    }

    const result = await getSessionUser(db, rawToken);
    if (!result) {
      throw new AppError("UNAUTHENTICATED", 401);
    }

    const { user } = result;

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

    request.user = user;
  };
}

export function createAdminAuthMiddleware(db: Database) {
  return async function requireAdminAuth(
    request: FastifyRequest,
  ): Promise<void> {
    const rawToken = request.cookies[ADMIN_COOKIE_NAME];
    if (!rawToken) {
      const userToken = request.cookies[SESSION_COOKIE_NAME];
      if (userToken) {
        const userResult = await getSessionUser(db, userToken);
        if (userResult) {
          throw new AppError("FORBIDDEN", 403);
        }
      }
      throw new AppError("UNAUTHENTICATED", 401);
    }

    const result = await getAdminSession(db, rawToken);
    if (!result) {
      throw new AppError("UNAUTHENTICATED", 401);
    }

    request.admin = result.admin;
  };
}

export function createGameGateMiddleware(db: Database) {
  return async function requireGameGate(
    request: FastifyRequest,
  ): Promise<void> {
    // Satu browser bisa memegang cookie pemain dan admin sekaligus (mis. admin
    // yang juga mencoba akun pemain). Bila sesi pemain valid, permintaan ini
    // diperlakukan sebagai pemain; cookie admin diabaikan.
    const userToken = request.cookies[SESSION_COOKIE_NAME];
    if (userToken && (await getSessionUser(db, userToken))) {
      return;
    }

    const adminToken = request.cookies[ADMIN_COOKIE_NAME];
    if (adminToken) {
      const adminResult = await getAdminSession(db, adminToken);
      if (adminResult) {
        throw new AppError("FORBIDDEN", 403);
      }
    }
  };
}

export async function requireActiveUser(request: FastifyRequest): Promise<void> {
  if (!request.user) {
    throw new AppError("UNAUTHENTICATED", 401);
  }
  if (request.user.status === "pending") {
    throw new AppError("ACCOUNT_PENDING", 403);
  }
}

export function createCsrfMiddleware(env: Env) {
  return async function verifyCsrf(
    request: FastifyRequest,
  ): Promise<void> {
    const method = request.method.toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return;
    }

    // Periksa origin / referer bila ada
    const origin = request.headers.origin;
    if (origin) {
      const allowedOrigin = new URL(env.APP_ORIGIN).origin;
      try {
        const reqOrigin = new URL(origin).origin;
        // Bolehkan origin sama persis atau localhost di test/dev
        if (
          reqOrigin !== allowedOrigin &&
          !(env.NODE_ENV !== "production" && reqOrigin.includes("localhost"))
        ) {
          throw new AppError("CSRF_INVALID", 403);
        }
      } catch {
        throw new AppError("CSRF_INVALID", 403);
      }
    }

    const tokenFromHeader = request.headers["x-csrf-token"];
    const tokenFromCookie = request.cookies[CSRF_COOKIE_NAME];

    if (
      !tokenFromHeader ||
      !tokenFromCookie ||
      typeof tokenFromHeader !== "string" ||
      tokenFromHeader !== tokenFromCookie
    ) {
      throw new AppError("CSRF_INVALID", 403);
    }
  };
}

export function applySecurityHeaders(
  request: FastifyRequest,
  reply: FastifyReply,
  env: Env,
): void {
  reply.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
  );
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
  reply.header("X-Frame-Options", "DENY");

  if (env.DEPLOY_MODE === "public") {
    reply.header(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  // Header no-store untuk respons yang terautentikasi atau sensitif
  if (
    request.url.startsWith("/api/me") ||
    request.url.startsWith("/api/auth/") ||
    request.url.startsWith("/api/admin/")
  ) {
    reply.header("Cache-Control", "no-store");
  }
}
