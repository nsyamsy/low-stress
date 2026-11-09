import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDb,
  admins,
  auditLog,
  games,
  gameRuns,
  gameScores,
  sessions,
  users,
  type Database,
} from "@low-stress/db";
import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { hashPassword } from "../src/auth/password";
import {
  ADMIN_COOKIE_NAME,
  createSession,
  SESSION_COOKIE_NAME,
} from "../src/auth/session";
import { readEnv } from "../src/env";
import { calculateMemoryMatchScore } from "../src/games/scores";
import type { LoadedGame } from "../src/registry/games";

const env = readEnv();

describe("P5-05: Rate Limit & Flagged Run Moderation", () => {
  let app: FastifyInstance;
  let dbHandle: ReturnType<typeof createDb>;
  let db: Database;

  const TEST_PREFIX = `p505_${(Date.now() % 1000000).toString(36)}_`;
  const adminUsername = `${TEST_PREFIX}adm`;
  const adminPassword = "superAdminSecret123!";
  let adminId: string;

  const gameId = `mem_${TEST_PREFIX}`;

  let playerId: string;
  let playerCookie: string;

  const mockLoadedGame: LoadedGame = {
    manifest: {
      id: gameId,
      version: "0.1.0",
      title: { id: "Uji Ingatan", en: "Memory Match" },
      description: { id: "Deskripsi", en: "Description" },
      icon: "icon.svg",
      mode: "solo",
      mobile: { supported: true },
      scoring: {
        direction: "higher",
        minScore: 50,
        maxScore: 10000,
        minDurationMs: 2000,
        maxDurationMs: 7200000,
        maxSubmitRatePerMin: 10,
      },
      client: async () => ({ default: (() => null) as never }),
    },
    path: "/games/memory-match/manifest.ts",
  };

  beforeAll(async () => {
    dbHandle = createDb(env.DATABASE_URL);
    db = dbHandle.db;

    // Pastikan game ada di DB
    await db
      .insert(games)
      .values({
        id: gameId,
        status: "active",
        sortOrder: 1,
      })
      .onConflictDoUpdate({
        target: games.id,
        set: { status: "active" },
      });

    // Buat admin
    const adminPassHash = await hashPassword(adminPassword);
    const [admin] = await db
      .insert(admins)
      .values({
        username: adminUsername,
        passwordHash: adminPassHash,
      })
      .returning();
    adminId = admin!.id;

    // Buat pemain
    const playerPassHash = await hashPassword("userSecretPassword123!");
    const [user] = await db
      .insert(users)
      .values({
        username: `${TEST_PREFIX}player`,
        displayName: "Pemain Uji P5-05",
        email: `${TEST_PREFIX}player@example.test`,
        passwordHash: playerPassHash,
        status: "active",
      })
      .returning();
    playerId = user!.id;

    const playerSession = await createSession(db, playerId);
    playerCookie = `${SESSION_COOKIE_NAME}=${playerSession.rawToken}`;

    app = await buildApp({
      db,
      env,
      games: [mockLoadedGame],
    });
    await app.ready();
  });

  afterAll(async () => {
    if (db) {
      await db.delete(gameRuns).where(eq(gameRuns.gameId, gameId));
      await db.delete(gameScores).where(eq(gameScores.gameId, gameId));
      await db.delete(sessions).where(inArray(sessions.subjectId, [adminId, playerId]));
      await db.delete(auditLog).where(eq(auditLog.adminId, adminId));
      await db.delete(users).where(eq(users.id, playerId));
      await db.delete(admins).where(eq(admins.id, adminId));
    }
    if (app) {
      await app.close();
    }
    if (dbHandle) {
      await dbHandle.close();
    }
  });

  async function getCsrf(): Promise<{ csrfToken: string; cookieHeader: string }> {
    const res = await app.inject({
      method: "GET",
      url: "/api/csrf",
    });
    const body = res.json() as { token: string };
    const rawCookie = res.headers["set-cookie"];
    const cookieHeader = Array.isArray(rawCookie)
      ? rawCookie.join("; ")
      : (rawCookie ?? "");
    return { csrfToken: body.token, cookieHeader };
  }

  async function loginAdminClient(): Promise<{
    adminCookie: string;
    csrfToken: string;
    fullCookieHeader: string;
  }> {
    const { csrfToken, cookieHeader } = await getCsrf();

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      headers: {
        origin: env.APP_ORIGIN,
        "x-csrf-token": csrfToken,
        cookie: cookieHeader,
      },
      payload: {
        username: adminUsername,
        password: adminPassword,
      },
    });

    expect(res.statusCode).toBe(200);
    const setCookie = res.headers["set-cookie"];
    const setCookieStr = Array.isArray(setCookie)
      ? setCookie.join("; ")
      : (setCookie ?? "");
    const adminCookieMatch = setCookieStr.match(
      new RegExp(`${ADMIN_COOKIE_NAME}=([^;]+)`),
    );
    const adminCookie = (adminCookieMatch ? adminCookieMatch[1] : "") ?? "";

    const combinedCookie = `${cookieHeader}; ${ADMIN_COOKIE_NAME}=${adminCookie}`;
    return { adminCookie, csrfToken, fullCookieHeader: combinedCookie };
  }

  it("menolak pengiriman skor dengan jeda kurang dari 3 detik (429 SCORE_RATE_LIMITED)", async () => {
    const durationMs = 12000;
    const moves = 16;
    const combos = 1;
    const score = calculateMemoryMatchScore(durationMs, moves, combos);

    // Kirim skor pertama -> Berhasil
    const res1 = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/scores`,
      headers: {
        cookie: playerCookie,
      },
      payload: {
        score,
        durationMs,
        moves,
        combos,
      },
    });
    expect(res1.statusCode).toBe(200);

    // Kirim skor kedua langsung tanpa jeda -> Harus 429 SCORE_RATE_LIMITED
    const res2 = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/scores`,
      headers: {
        cookie: playerCookie,
      },
      payload: {
        score,
        durationMs,
        moves,
        combos,
      },
    });
    expect(res2.statusCode).toBe(429);
    const body2 = res2.json();
    expect(body2.error.code).toBe("SCORE_RATE_LIMITED");
  });

  it("menolak skor yang secara matematis tidak sah (400 SCORE_INVALID)", async () => {
    // Tunggu agar rate limit 3 detik lewat
    await new Promise((r) => setTimeout(r, 3100));

    // durationMs < 2000ms tidak sah
    const res = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/scores`,
      headers: {
        cookie: playerCookie,
      },
      payload: {
        score: 5000,
        durationMs: 500, // < 2000ms
        moves: 8,
        combos: 0,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("SCORE_INVALID");
  });

  it("menandai run janggal (flagged) dan tidak memasukkannya ke papan rekor", async () => {
    // Tunggu sedikit agar rate limiter 3s lewat
    await new Promise((r) => setTimeout(r, 3100));

    // Durasi 2500ms (antara 2000 dan 4000) adalah sah matematis tapi mencurigakan (superhuman/bot)
    const durationMs = 2500;
    const moves = 8;
    const combos = 0;
    const suspiciousScore = calculateMemoryMatchScore(durationMs, moves, combos);

    const res = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/scores`,
      headers: {
        cookie: playerCookie,
      },
      payload: {
        score: suspiciousScore,
        durationMs,
        moves,
        combos,
      },
    });
    expect(res.statusCode).toBe(200);

    // Cek game_runs di database: run harus bertanda flagged = true
    const runs = await db
      .select()
      .from(gameRuns)
      .where(eq(gameRuns.userId, playerId));

    const flaggedRun = runs.find((r) => r.durationMs === 2500);
    expect(flaggedRun).toBeDefined();
    expect(flaggedRun!.flagged).toBe(true);

    // Leaderboard publik tidak boleh mencatat run yang flagged
    const lbRes = await app.inject({
      method: "GET",
      url: `/api/games/${gameId}/leaderboard?period=week`,
    });
    expect(lbRes.statusCode).toBe(200);
    const lbBody = lbRes.json();
    const myEntry = lbBody.entries.find((e: { userId: string }) => e.userId === playerId);
    if (myEntry) {
      // Skor yang muncul di leaderboard mingguan harus skor yang sah (bukan skor suspiciousScore)
      expect(myEntry.score).not.toBe(suspiciousScore);
    }
  });

  it("admin dapat melihat daftar run termasuk filter flagged (?flagged=true)", async () => {
    const { fullCookieHeader } = await loginAdminClient();

    // Ambil semua run
    const resAll = await app.inject({
      method: "GET",
      url: `/api/admin/runs?gameId=${gameId}`,
      headers: {
        cookie: fullCookieHeader,
      },
    });
    expect(resAll.statusCode).toBe(200);
    const bodyAll = resAll.json();
    expect(bodyAll.items.length).toBeGreaterThanOrEqual(1);
    expect(bodyAll.items[0].user).toHaveProperty("username");
    expect(bodyAll.items[0].user).toHaveProperty("displayName");

    // Ambil hanya run yang flagged
    const resFlagged = await app.inject({
      method: "GET",
      url: `/api/admin/runs?gameId=${gameId}&flagged=true`,
      headers: {
        cookie: fullCookieHeader,
      },
    });
    expect(resFlagged.statusCode).toBe(200);
    const bodyFlagged = resFlagged.json();
    expect(bodyFlagged.items.length).toBeGreaterThanOrEqual(1);
    expect(bodyFlagged.items.every((item: { flagged: boolean }) => item.flagged === true)).toBe(true);
  });

  it("admin dapat menghapus run janggal dan aksi dicatat di audit log", async () => {
    const { fullCookieHeader, csrfToken } = await loginAdminClient();

    // Dapatkan ID run flagged
    const resFlagged = await app.inject({
      method: "GET",
      url: `/api/admin/runs?gameId=${gameId}&flagged=true`,
      headers: {
        cookie: fullCookieHeader,
      },
    });
    const bodyFlagged = resFlagged.json();
    const runToDelete = bodyFlagged.items[0];
    expect(runToDelete).toBeDefined();

    // Hapus run melalui DELETE /api/admin/runs/:id
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/admin/runs/${runToDelete.id}`,
      headers: {
        origin: env.APP_ORIGIN,
        "x-csrf-token": csrfToken,
        cookie: fullCookieHeader,
      },
    });
    expect(deleteRes.statusCode).toBe(204);

    // Run terhapus dari game_runs
    const checkRuns = await db
      .select()
      .from(gameRuns)
      .where(eq(gameRuns.id, runToDelete.id));
    expect(checkRuns).toHaveLength(0);

    // Aksi tercatat di audit_log
    const logs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "run.delete"));
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs.some((l) => l.targetId === runToDelete.id)).toBe(true);
  });

  it("admin dapat mereset leaderboard periode berjalan (POST /api/admin/leaderboard/:gameId/reset)", async () => {
    const { fullCookieHeader, csrfToken } = await loginAdminClient();

    const resetRes = await app.inject({
      method: "POST",
      url: `/api/admin/leaderboard/${gameId}/reset`,
      headers: {
        origin: env.APP_ORIGIN,
        "x-csrf-token": csrfToken,
        cookie: fullCookieHeader,
      },
      payload: {
        period: "week",
      },
    });
    expect(resetRes.statusCode).toBe(200);

    // Audit log mencatat leaderboard.reset
    const logs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "leaderboard.reset"));
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
