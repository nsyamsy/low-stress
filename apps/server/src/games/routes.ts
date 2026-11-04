import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Database } from "@low-stress/db";
import {
  createAuthMiddleware,
  requireActiveUser,
} from "../auth/middleware";
import { getSessionUser, SESSION_COOKIE_NAME, ADMIN_COOKIE_NAME, getAdminSession } from "../auth/session";
import type { Env } from "../env";
import { AppError } from "../errors";
import type { LoadedGame } from "../registry/games";
import { checkGameGate, listPlayerGames } from "./service";

export interface GameRoutesOptions {
  db: Database;
  env: Env;
  games?: readonly LoadedGame[];
}

export async function registerGameRoutes(
  app: FastifyInstance,
  options: GameRoutesOptions,
): Promise<void> {
  const { db, games = [] } = options;

  const requireAuth = createAuthMiddleware(db);

  // Hook gate untuk rute game spesifik: /api/games/:id/*
  app.addHook("preHandler", async (request: FastifyRequest) => {
    const url = request.url;
    // Kecualikan /api/games itu sendiri
    if (!url.startsWith("/api/games/")) {
      return;
    }

    // Ekstrak gameId: /api/games/:id/...
    const pathParts = url.replace(/^\/api\/games\//, "").split(/[/?#]/);
    const gameId = pathParts[0];
    if (!gameId) return;

    // 1. Admin dilarang mengakses API game
    const adminToken = request.cookies[ADMIN_COOKIE_NAME];
    if (adminToken) {
      const adminResult = await getAdminSession(db, adminToken);
      if (adminResult) {
        throw new AppError("FORBIDDEN", 403);
      }
    }

    // 2. Pemain harus terautentikasi dan berstatus active
    await requireAuth(request);
    await requireActiveUser(request);

    // 3. Status game dan jadwal
    await checkGameGate(db, gameId);
  });

  // GET /api/games (Daftar game yang aktif/maintenance untuk pemain)
  app.get("/api/games", async (request) => {
    let userId: string | undefined;
    const sessionToken = request.cookies[SESSION_COOKIE_NAME];
    if (sessionToken) {
      const session = await getSessionUser(db, sessionToken);
      if (session?.user && session.user.status === "active") {
        userId = session.user.id;
      }
    }

    return listPlayerGames(db, games, userId);
  });

  // GET /api/games/:id/ping (Placeholder/health check game berpagar)
  app.get("/api/games/:id/ping", async () => {
    return { ok: true };
  });
}
