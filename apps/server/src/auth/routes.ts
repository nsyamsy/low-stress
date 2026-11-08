import type { FastifyInstance } from "fastify";
import type { Database } from "@low-stress/db";
import type { Env } from "../env";
import type { LoadedGame } from "../registry/games";
import { generateCaptchaChallenge } from "./captcha";
import {
  createAuthMiddleware,
  createCsrfMiddleware,
  requireActiveUser,
} from "./middleware";
import {
  changePassword,
  deleteAccount,
  getPublicConfig,
  loginUser,
  logoutUser,
  registerUser,
  updateProfile,
} from "./service";
import {
  clearSessionCookie,
  CSRF_COOKIE_NAME,
  generateToken,
  SESSION_COOKIE_NAME,
  setCsrfCookie,
  setSessionCookie,
  userToMe,
} from "./session";
import {
  changePasswordSchema,
  deleteAccountSchema,
  loginBodySchema,
  registerBodySchema,
  updateProfileSchema,
} from "./validation";

export interface AuthRoutesOptions {
  db: Database;
  env: Env;
  games?: readonly LoadedGame[];
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  options: AuthRoutesOptions,
): Promise<void> {
  const { db, env, games = [] } = options;

  const requireAuth = createAuthMiddleware(db);
  const verifyCsrf = createCsrfMiddleware(env);

  // GET /api/csrf
  // Token dipakai ulang selama cookie-nya masih ada. Cookie `ls_csrf` dibagi oleh
  // semua tab; jika tiap panggilan membuat token baru, tab lain yang sudah
  // menyimpan token lama akan ditolak `CSRF_INVALID` pada POST berikutnya.
  app.get("/api/csrf", async (request, reply) => {
    const existing = request.cookies[CSRF_COOKIE_NAME];
    const token =
      existing && /^[A-Za-z0-9_-]{32,64}$/.test(existing) ? existing : generateToken();
    setCsrfCookie(reply, env, request, token);
    return { token };
  });

  // GET /api/public-config
  app.get("/api/public-config", async () => {
    return getPublicConfig(db, env);
  });

  // GET /api/auth/captcha-challenge
  app.get("/api/auth/captcha-challenge", async () => {
    return generateCaptchaChallenge(env.SESSION_SECRET);
  });

  // POST /api/auth/register
  app.post(
    "/api/auth/register",
    {
      preHandler: [verifyCsrf],
      config: {
        rateLimit: {
          max: env.NODE_ENV === "test" ? 1000 : 10,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const body = registerBodySchema.parse(request.body);
      const result = await registerUser(db, env, body);
      return reply.status(201).send(result);
    },
  );

  // POST /api/auth/login
  app.post(
    "/api/auth/login",
    {
      preHandler: [verifyCsrf],
      config: {
        rateLimit: {
          max: env.NODE_ENV === "test" ? 1000 : 10,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const body = loginBodySchema.parse(request.body);
      const ip = request.ip;
      const userAgent = request.headers["user-agent"];

      const { user, rawToken } = await loginUser(db, env, body, {
        ip,
        userAgent,
      });

      setSessionCookie(reply, env, request, rawToken);
      return reply.status(200).send({ user });
    },
  );

  // POST /api/auth/logout
  app.post(
    "/api/auth/logout",
    {
      preHandler: [verifyCsrf],
    },
    async (request, reply) => {
      const rawToken = request.cookies[SESSION_COOKIE_NAME];
      if (rawToken) {
        await logoutUser(db, rawToken);
      }
      clearSessionCookie(reply, env, request);
      return reply.status(204).send();
    },
  );

  // GET /api/me (bisa diakses user pending)
  app.get(
    "/api/me",
    {
      preHandler: [requireAuth],
    },
    async (request) => {
      return userToMe(request.user!);
    },
  );

  // PATCH /api/me (hanya user aktif)
  app.patch(
    "/api/me",
    {
      preHandler: [verifyCsrf, requireAuth, requireActiveUser],
    },
    async (request) => {
      const body = updateProfileSchema.parse(request.body);
      return updateProfile(db, request.user!.id, body);
    },
  );

  // POST /api/me/password (hanya user aktif)
  app.post(
    "/api/me/password",
    {
      preHandler: [verifyCsrf, requireAuth, requireActiveUser],
    },
    async (request, reply) => {
      const body = changePasswordSchema.parse(request.body);
      const rawToken = request.cookies[SESSION_COOKIE_NAME];
      await changePassword(db, request.user!.id, body, rawToken);
      return reply.status(204).send();
    },
  );

  // DELETE /api/me (user pending maupun active)
  app.delete(
    "/api/me",
    {
      preHandler: [verifyCsrf, requireAuth],
    },
    async (request, reply) => {
      const body = deleteAccountSchema.parse(request.body);
      await deleteAccount(db, request.user!.id, body, games);
      clearSessionCookie(reply, env, request);
      return reply.status(204).send();
    },
  );
}
