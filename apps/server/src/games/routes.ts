import type { FastifyInstance, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import type { Database } from "@low-stress/db";
import { games as gamesTable } from "@low-stress/db";
import {
  createAuthMiddleware,
  requireActiveUser,
} from "../auth/middleware";
import {
  getSessionUser,
  SESSION_COOKIE_NAME,
  ADMIN_COOKIE_NAME,
  getAdminSession,
} from "../auth/session";
import type { Env } from "../env";
import { AppError } from "../errors";
import type { LoadedGame } from "../registry/games";
import {
  getLeaderboard,
  isSuspiciousRun,
  plausibleRun,
  recordScore,
} from "./scores";
import { checkGameGate, listPlayerGames } from "./service";

import {
  leaderboardQuerySchema,
  submitScoreSchema,
} from "./validation";

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

  // In-memory rate limiter per pemain dan game
  // Minimal 3 detik jeda dan batas per menit
  const userLastSubmitAt = new Map<string, number>();
  const userSubmitTimestamps = new Map<string, number[]>();

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

    // Rute leaderboard (/api/games/:id/leaderboard) dapat diakses publik/opsional auth
    if (pathParts[1] === "leaderboard") {
      const [existingGame] = await db
        .select({ id: gamesTable.id, status: gamesTable.status })
        .from(gamesTable)
        .where(eq(gamesTable.id, gameId))
        .limit(1);

      if (!existingGame || existingGame.status === "inactive") {
        throw new AppError("NOT_FOUND", 404, { gameId });
      }
      return;
    }

    // 1. Admin dilarang mengakses API game. Bila browser juga memegang sesi
    //    pemain yang valid, permintaan diperlakukan sebagai pemain.
    const adminToken = request.cookies[ADMIN_COOKIE_NAME];
    const userToken = request.cookies[SESSION_COOKIE_NAME];
    const hasPlayerSession = userToken ? Boolean(await getSessionUser(db, userToken)) : false;
    if (adminToken && !hasPlayerSession) {
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

  // GET /api/games/:id/leaderboard
  app.get("/api/games/:id/leaderboard", async (request) => {
    const params = request.params as { id: string };
    const gameId = params.id;
    const query = leaderboardQuerySchema.parse(request.query);

    let userId: string | undefined;
    const sessionToken = request.cookies[SESSION_COOKIE_NAME];
    if (sessionToken) {
      const session = await getSessionUser(db, sessionToken);
      if (session?.user && session.user.status === "active") {
        userId = session.user.id;
      }
    }

    return getLeaderboard({
      db,
      gameId,
      userId,
      period: query.period,
    });
  });

  // POST /api/games/:id/scores
  app.post("/api/games/:id/scores", async (request) => {
    const params = request.params as { id: string };
    const gameId = params.id;
    const userId = request.user!.id;
    const body = submitScoreSchema.parse(request.body);

    const loaded = games.find((g) => g.manifest.id === gameId);
    const manifest = loaded?.manifest;

    // Game multiplayer bersifat server-otoritatif (Riot, Ludo): skor hanya
    // boleh dicatat server dari hasil ronde (RT-50). Klien tidak dapat
    // mengirim skor untuk game semacam ini.
    if (manifest?.mode === "multiplayer") {
      throw new AppError("SCORE_SERVER_AUTHORITATIVE", 403, { gameId });
    }

    // Batas laju per pemain & game (API_Spec §6)
    const rateKey = `${userId}:${gameId}`;
    const nowMs = Date.now();
    const lastAt = userLastSubmitAt.get(rateKey) ?? 0;
    if (nowMs - lastAt < 3000) {
      throw new AppError("SCORE_RATE_LIMITED", 429, {
        retryAfterMs: 3000 - (nowMs - lastAt),
      });
    }

    const maxPerMin = manifest?.scoring?.maxSubmitRatePerMin ?? 20;
    const timestamps = (userSubmitTimestamps.get(rateKey) ?? []).filter(
      (t) => nowMs - t < 60_000,
    );
    if (timestamps.length >= maxPerMin) {
      throw new AppError("SCORE_RATE_LIMITED", 429, {
        limit: maxPerMin,
      });
    }

    // Validasi kewajaran skor
    const isValid = plausibleRun(gameId, body, manifest);
    if (!isValid) {
      throw new AppError("SCORE_INVALID", 400);
    }

    // Update rate limit state
    timestamps.push(nowMs);
    userSubmitTimestamps.set(rateKey, timestamps);
    userLastSubmitAt.set(rateKey, nowMs);

    const isSuspicious = isSuspiciousRun(gameId, body);
    const flagged =
      isSuspicious || Boolean((body as Record<string, unknown>).flagged);

    const result = await recordScore({
      db,
      gameId,
      userId,
      score: body.score,
      durationMs: body.durationMs,
      flagged,
      direction: manifest?.scoring?.direction ?? "higher",
    });

    return result;
  });

  
}
