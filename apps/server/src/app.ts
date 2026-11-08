import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { sql } from "drizzle-orm";
import type { Database } from "@low-stress/db";
import Fastify, { type FastifyInstance } from "fastify";

import { Server as SocketIOServer } from "socket.io";
import { applySecurityHeaders } from "./auth/middleware";
import { resolvePrincipal } from "./auth/principal";
import { registerAuthRoutes } from "./auth/routes";
import { registerAdminRoutes } from "./admin/routes";
import { registerGameRoutes } from "./games/routes";
import { registerChatRoutes } from "./chat/routes";
import { setupPublicChatSocket } from "./chat/socket";
import { censorServerText, initBannedWords } from "./chat/profanity-service";
import { createJobRunner } from "./jobs";

export type AutopilotOptions = Record<string, unknown>;

import type { Env } from "./env";
import { createErrorHandler, notFoundHandler } from "./errors";

import { scanGameManifests, loadGameServerModules, type LoadedGame } from "./registry/games";
import { checkGameGate } from "./games/service";
import { recordScore } from "./games/scores";
import type { GameServerContext } from "@low-stress/sdk/server";


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
    errorResponseBuilder: (_request, context) => ({
      // Plugin melempar nilai ini sebagai error; handler membacanya sebagai
      // { statusCode, code, params } (tanpa statusCode, handler menganggap 500).
      statusCode: 429,
      code: "RATE_LIMITED",
      params: { retryAfterSec: Math.max(1, Math.ceil(context.ttl / 1000)) },
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
    // Pastikan kolom last_failed_at tersedia (idempoten untuk lingkungan tes)
    await db
      .execute(
        sql`ALTER TABLE "login_attempts" ADD COLUMN IF NOT EXISTS "last_failed_at" timestamptz NOT NULL DEFAULT now()`,
      )
      .catch(() => {});

    const io = new SocketIOServer(app.server, {
      path: "/ws",
      cors: {
        origin: env.APP_ORIGIN,
        credentials: true,
      },
    });

    const chatSocket = setupPublicChatSocket(io, db);
    const jobRunner = createJobRunner({ db, logger: app.log });
    app.decorate("io", io);
    app.decorate("chatSocket", chatSocket);
    app.decorate("jobRunner", jobRunner);

    // Inisialisasi banned words cache sebelum memproses request
    await initBannedWords(db);

    const gameList = games ?? (await scanGameManifests().catch(() => []));

    const gameContext: GameServerContext = {
      db,
      io,
      env,
      logger: app.log,
      options: { ludoAutopilot },
      censorText: censorServerText,
      checkGameGate: async (gameId: string) => {
        await checkGameGate(db, gameId);
      },
      recordScore: async (params) => recordScore({ ...params, db }),
      resolvePrincipal: async (cookieHeader?: string) => {
        const principal = await resolvePrincipal(db, cookieHeader);
        if (principal.kind === "user" && principal.user.status === "active") {
          return {
            kind: "user" as const,
            user: {
              id: principal.user.id,
              username: principal.user.username,
              displayName: principal.user.displayName,
              status: principal.user.status,
            },
          };
        }
        if (principal.kind === "admin") {
          return {
            kind: "admin" as const,
            admin: { id: principal.admin.id, username: principal.admin.username },
          };
        }
        return { kind: "none" as const };
      },
    };

    const initializedGameServers = await loadGameServerModules(gameList, gameContext, app, io);

    for (const ig of initializedGameServers) {
      if (ig.jobs && ig.jobs.length > 0) {
        jobRunner.registerGameJobs(ig.jobs, gameContext);
      }
    }
    jobRunner.startAll();

    app.addHook("onClose", async () => {
      jobRunner.stopAll();
      for (const ig of initializedGameServers) {
        if (ig.module.dispose) {
          await ig.module.dispose();
        }
      }
      io.disconnectSockets(true);
      await new Promise<void>((resolve) => {
        io.close(() => resolve());
      });
    });

    await registerAuthRoutes(app, { db, env, games: gameList });
    await registerAdminRoutes(app, { db, env, games: gameList });
    await registerGameRoutes(app, { db, env, games: gameList });
    await registerChatRoutes(app, { db });
  }

  return app;
}
