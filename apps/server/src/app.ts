import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import type { Database } from "@low-stress/db";
import Fastify, { type FastifyInstance } from "fastify";

import { Server as SocketIOServer } from "socket.io";
import { applySecurityHeaders } from "./auth/middleware";
import { registerAuthRoutes } from "./auth/routes";
import { registerAdminRoutes } from "./admin/routes";
import { registerGameRoutes } from "./games/routes";
import { registerChatRoutes } from "./chat/routes";
import { setupPublicChatSocket } from "./chat/socket";
import { startPurgeChatJob } from "./chat/purge";
import { initBannedWords } from "./chat/profanity-service";
import { startLudoExpirationJob } from "./ludo/expiration";
import type { AutopilotOptions } from "./ludo/autopilot";
import { setupLudoSocket } from "./ludo/socket";
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
  /** Opsi autopilot Ludo (mis. jeda waktu cepat untuk pengujian). */
  ludoAutopilot?: AutopilotOptions;
}

export async function buildApp({
  env,
  db,
  games,
  checkDatabase,
  logger,
  ludoAutopilot,
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
    const io = new SocketIOServer(app.server, {
      path: "/ws",
      cors: {
        origin: env.APP_ORIGIN,
        credentials: true,
      },
    });

    const { autopilot } = setupLudoSocket(io, db, ludoAutopilot);
    const expirationJob = startLudoExpirationJob(db, io);
    const chatSocket = setupPublicChatSocket(io, db);
    const purgeChatJob = startPurgeChatJob(db);
    app.decorate("io", io);
    app.decorate("chatSocket", chatSocket);

    // Inisialisasi banned words cache
    void initBannedWords(db);

    app.addHook("onClose", async () => {
      purgeChatJob.stop();
      expirationJob.stop();
      autopilot.stopAll();
      io.disconnectSockets(true);
      await new Promise<void>((resolve) => {
        io.close(() => resolve());
      });
    });

    await registerAuthRoutes(app, { db, env, games });
    await registerAdminRoutes(app, { db, env, games });
    await registerGameRoutes(app, { db, env, games });
    await registerChatRoutes(app, { db });
  }

  return app;
}
