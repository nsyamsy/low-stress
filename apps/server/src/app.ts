import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import type { Database } from "@low-stress/db";
import Fastify, { type FastifyInstance } from "fastify";

import { applySecurityHeaders } from "./auth/middleware";
import { registerAuthRoutes } from "./auth/routes";
import { registerAdminRoutes } from "./admin/routes";
import { registerGameRoutes } from "./games/routes";
import type { Env } from "./env";
import { createErrorHandler, errorBody, notFoundHandler } from "./errors";
import type { LoadedGame } from "./registry/games";

export interface BuildAppOptions {
  env: Env;
  db?: Database;
  games?: readonly LoadedGame[];
  /** Pemeriksaan database untuk `/readyz`. Bila tidak diberikan, dianggap gagal. */
  checkDatabase?: () => Promise<boolean>;
  /** Nonaktifkan logger pada tes. */
  logger?: boolean;
}

export async function buildApp({
  env,
  db,
  games,
  checkDatabase,
  logger,
}: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      logger === false || env.NODE_ENV === "test"
        ? false
        : {
            level: env.LOG_LEVEL,
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                "res.headers['set-cookie']",
                "password",
                "*.password",
                "*.*.password",
                "passwordHash",
                "*.passwordHash",
                "*.*.passwordHash",
                "token",
                "*.token",
                "*.*.token",
                "tokenHash",
                "*.tokenHash",
                "*.*.tokenHash",
              ],
              censor: "[redacted]",
            },
          },
    trustProxy: env.DEPLOY_MODE === "public",
  });

  app.setErrorHandler(createErrorHandler());
  app.setNotFoundHandler(notFoundHandler);

  await app.register(cookie, {
    secret: env.SESSION_SECRET,
    hook: "onRequest",
  });

  app.addHook("onSend", async (request, reply) => {
    applySecurityHeaders(request, reply, env);
  });

  await app.register(rateLimit, {
    max: env.NODE_ENV === "test" ? 10000 : 120,
    timeWindow: "1 minute",
    errorResponseBuilder: (_request, context) =>
      errorBody("RATE_LIMITED", {
        retryAfterSec: Math.max(1, Math.ceil(context.ttl / 1000)),
      }),
  });

  app.get("/healthz", async () => ({ ok: true }));

  app.get("/readyz", async (_request, reply) => {
    const ready = checkDatabase
      ? await checkDatabase().catch(() => false)
      : false;
    if (!ready) {
      return reply.status(503).send({ ok: false });
    }
    return { ok: true };
  });

  if (db) {
    await registerAuthRoutes(app, { db, env, games });
    await registerAdminRoutes(app, { db, env, games });
    await registerGameRoutes(app, { db, env, games });
  }

  return app;
}
