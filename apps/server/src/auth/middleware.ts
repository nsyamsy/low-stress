import { timingSafeEqual } from "node:crypto";
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
} from "./session";
import { resolvePrincipal } from "./principal";

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
    const principal = await resolvePrincipal(db, request.cookies);
    if (principal.kind === "admin") {
      throw new AppError("FORBIDDEN", 403);
    }
    if (principal.kind === "none") {
      throw new AppError("UNAUTHENTICATED", 401);
    }

    const { user } = principal;

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
    if (rawToken) {
      const result = await getAdminSession(db, rawToken);
      if (result) {
        request.admin = result.admin;
        return;
      }
      throw new AppError("UNAUTHENTICATED", 401);
    }

    const principal = await resolvePrincipal(db, request.cookies);
    if (principal.kind === "user") {
      throw new AppError("FORBIDDEN", 403);
    }
    throw new AppError("UNAUTHENTICATED", 401);
  };
}

export function createGameGateMiddleware(db: Database) {
  return async function requireGameGate(
    request: FastifyRequest,
  ): Promise<void> {
    // Satu browser bisa memegang cookie pemain dan admin sekaligus (mis. admin
    // yang juga mencoba akun pemain). Bila sesi pemain valid, resolvePrincipal
    // mengembalikan kind: "user" sehingga permintaan diperlakukan sebagai pemain.
    const principal = await resolvePrincipal(db, request.cookies);
    if (principal.kind === "admin") {
      throw new AppError("FORBIDDEN", 403);
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
    const originOrReferer = request.headers.origin ?? request.headers.referer;
    if (originOrReferer) {
      const allowedOrigin = new URL(env.APP_ORIGIN).origin;
      try {
        const reqUrl = new URL(originOrReferer);
        const reqOrigin = reqUrl.origin;
        const isLocalDev =
          env.NODE_ENV !== "production" &&
          (reqUrl.hostname === "localhost" || reqUrl.hostname === "127.0.0.1");
        // Bolehkan origin sama persis atau localhost/127.0.0.1 di test/dev
        if (reqOrigin !== allowedOrigin && !isLocalDev) {
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
      typeof tokenFromHeader !== "string"
    ) {
      throw new AppError("CSRF_INVALID", 403);
    }

    const headerBuf = Buffer.from(tokenFromHeader, "utf8");
    const cookieBuf = Buffer.from(tokenFromCookie, "utf8");
    if (
      headerBuf.length !== cookieBuf.length ||
      !timingSafeEqual(headerBuf, cookieBuf)
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
