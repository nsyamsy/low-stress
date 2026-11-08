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

export type AutopilotOptions = Record<string, unknown>;

import type { Env } from "./env";
import { createErrorHandler, notFoundHandler } from "./errors";

import { scanGameManifests, loadGameServerModules, type LoadedGame } from "./registry/games";
import { checkGameGate } from "./games/service";
import { recordScore } from "./games/scores";
import {
  getSessionUser,
  getAdminSession,
  SESSION_COOKIE_NAME,
  ADMIN_COOKIE_NAME,
} from "./auth/session";
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
    const io = new SocketIOServer(app.server, {
      path: "/ws",
      cors: {
        origin: env.APP_ORIGIN,
        credentials: true,
      },
    });

    const chatSocket = setupPublicChatSocket(io, db);
    const purgeChatJob = startPurgeChatJob(db);
    app.decorate("io", io);
    app.decorate("chatSocket", chatSocket);

    // Inisialisasi banned words cache
    void initBannedWords(db);

    const gameList = games ?? (await scanGameManifests().catch(() => []));
    const parseCookieHeader = (header?: string): Record<string, string> => {
      if (!header) return {};
      const res: Record<string, string> = {};
      for (const pair of header.split(";")) {
        const [k, ...v] = pair.trim().split("=");
        if (k) res[k] = decodeURIComponent(v.join("="));
      }
      return res;
    };

    const gameContext: GameServerContext = {
      db,
      io,
      env,
      options: { ludoAutopilot },
      checkGameGate: async (gameId: string) => {
        await checkGameGate(db, gameId);
      },
      recordScore: async (params) => recordScore({ ...params, db }),
      resolvePrincipal: async (cookieHeader?: string) => {
        const cookies = parseCookieHeader(cookieHeader);
        const sessionToken = cookies[SESSION_COOKIE_NAME];
        const adminToken = cookies[ADMIN_COOKIE_NAME];
        if (sessionToken) {
          const res = await getSessionUser(db, sessionToken);
          if (res && res.user.status === "active") {
            return {
              kind: "user" as const,
              user: {
                id: res.user.id,
                username: res.user.username,
                displayName: res.user.displayName,
                status: res.user.status,
              },
            };
          }
        }
        if (adminToken) {
          const res = await getAdminSession(db, adminToken);
          if (res) {
            return {
              kind: "admin" as const,
              admin: { id: res.admin.id, username: res.admin.username },
            };
          }
        }
        return { kind: "none" as const };
      },
    };

    const initializedGameServers = await loadGameServerModules(gameList, gameContext, app, io);

    app.addHook("onClose", async () => {
      purgeChatJob.stop();
      for (const ig of initializedGameServers) {
        if (ig.jobs) {
          for (const job of ig.jobs) {
            if (job.stop) job.stop();
          }
        }
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
