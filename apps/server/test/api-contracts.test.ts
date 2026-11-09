import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admins,
  createDb,
  games,
  seedDevGames,
  sessions,
  users,
  type Database,
} from "@low-stress/db";
import {
  adminDashboardDataSchema,
  adminGameItemSchema,
  adminMeSchema,
  adminSettingsSchema,
  adminUserItemSchema,
  auditLogItemSchema,
  gameItemSchema,
  leaderboardDataSchema,
  meSchema,
  publicConfigSchema,
} from "@low-stress/sdk";
import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildApp } from "../src/app";
import { hashPassword } from "../src/auth/password";
import {
  ADMIN_COOKIE_NAME,
  createAdminSession,
  createSession,
  SESSION_COOKIE_NAME,
} from "../src/auth/session";
import { readEnv } from "../src/env";

const env = readEnv();

describe("R-08: Tes Kontrak API Server vs Skema Bersama (@low-stress/sdk)", () => {
  let app: FastifyInstance;
  let dbHandle: ReturnType<typeof createDb>;
  let db: Database;

  const prefix = `contract_${(Date.now() % 1000000).toString(36)}_`;
  let userId = "";
  let adminId = "";
  let userToken = "";
  let adminToken = "";

  beforeAll(async () => {
    dbHandle = createDb(env.DATABASE_URL, { max: 2 });
    db = dbHandle.db;
    app = await buildApp({ env, db });
    await app.ready();

    const pwHash = await hashPassword("ContractPass123!");
    const [u] = await db
      .insert(users)
      .values({
        username: `${prefix}usr`,
        displayName: "Pemain Kontrak",
        email: `${prefix}usr@example.test`,
        passwordHash: pwHash,
        status: "active",
      })
      .returning();
    userId = u!.id;

    const [a] = await db
      .insert(admins)
      .values({
        username: `${prefix}adm`,
        passwordHash: pwHash,
      })
      .returning();
    adminId = a!.id;

    const uSess = await createSession(db, userId);
    userToken = uSess.rawToken;

    const aSess = await createAdminSession(db, adminId);
    adminToken = aSess.rawToken;

    // Pastikan memory-match berstatus active untuk uji kontrak
    await db
      .update(games)
      .set({ status: "active" })
      .where(eq(games.id, "memory-match"));
  });

  afterAll(async () => {
    if (db) {
      if (userId || adminId) {
        await db
          .delete(sessions)
          .where(inArray(sessions.subjectId, [userId, adminId].filter(Boolean)));
      }
      if (userId) await db.delete(users).where(eq(users.id, userId));
      if (adminId) await db.delete(admins).where(eq(admins.id, adminId));
    }
    if (app) await app.close();
    if (dbHandle) await dbHandle.close();
  });

  it("respons nyata /api/public-config, /api/me, /api/games, dan /api/games/:id/leaderboard sesuai skema kontrak", async () => {
    const pubRes = await app.inject({ method: "GET", url: "/api/public-config" });
    expect(pubRes.statusCode).toBe(200);
    expect(publicConfigSchema.parse(pubRes.json())).toBeDefined();

    const meRes = await app.inject({
      method: "GET",
      url: "/api/me",
      cookies: { [SESSION_COOKIE_NAME]: userToken },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meSchema.parse(meRes.json())).toBeDefined();

    const gamesRes = await app.inject({
      method: "GET",
      url: "/api/games",
      cookies: { [SESSION_COOKIE_NAME]: userToken },
    });
    expect(gamesRes.statusCode).toBe(200);
    const gamesParsed = z.object({ items: z.array(gameItemSchema) }).parse(gamesRes.json());
    expect(gamesParsed.items.length).toBeGreaterThan(0);

    const lbRes = await app.inject({
      method: "GET",
      url: "/api/games/memory-match/leaderboard?period=all",
      cookies: { [SESSION_COOKIE_NAME]: userToken },
    });
    expect(lbRes.statusCode).toBe(200);
    expect(leaderboardDataSchema.parse(lbRes.json())).toBeDefined();
  });

  it("respons nyata /api/admin/me, /api/admin/dashboard, /api/admin/users, /api/admin/games, /api/admin/settings, dan /api/admin/audit-logs sesuai skema kontrak", async () => {
    const cookies = { [ADMIN_COOKIE_NAME]: adminToken };

    const adminMeRes = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      cookies,
    });
    expect(adminMeRes.statusCode).toBe(200);
    expect(
      z.object({ admin: adminMeSchema }).parse(adminMeRes.json()),
    ).toBeDefined();

    const dashRes = await app.inject({
      method: "GET",
      url: "/api/admin/dashboard",
      cookies,
    });
    expect(dashRes.statusCode).toBe(200);
    expect(adminDashboardDataSchema.parse(dashRes.json())).toBeDefined();

    const usersRes = await app.inject({
      method: "GET",
      url: "/api/admin/users",
      cookies,
    });
    expect(usersRes.statusCode).toBe(200);
    expect(
      z
        .object({ items: z.array(adminUserItemSchema), total: z.number() })
        .parse(usersRes.json()),
    ).toBeDefined();

    const gamesRes = await app.inject({
      method: "GET",
      url: "/api/admin/games",
      cookies,
    });
    expect(gamesRes.statusCode).toBe(200);
    expect(
      z.object({ items: z.array(adminGameItemSchema) }).parse(gamesRes.json()),
    ).toBeDefined();

    const settingsRes = await app.inject({
      method: "GET",
      url: "/api/admin/settings",
      cookies,
    });
    expect(settingsRes.statusCode).toBe(200);
    expect(adminSettingsSchema.parse(settingsRes.json())).toBeDefined();

    const auditRes = await app.inject({
      method: "GET",
      url: "/api/admin/audit",
      cookies,
    });
    expect(auditRes.statusCode).toBe(200);
    expect(
      z
        .object({ items: z.array(auditLogItemSchema), total: z.number() })
        .parse(auditRes.json()),
    ).toBeDefined();
  });

  it("D-13: seedDevGames menyalakan flappy-bird, memory-match, dan ludo secara idempoten tanpa membuat pengguna palsu", async () => {
    const usersBefore = await db.select({ id: users.id }).from(users);
    const activated = await seedDevGames(db);
    expect(activated).toEqual(["flappy-bird", "memory-match", "ludo"]);

    // Jalankan kedua kali untuk memverifikasi idempotensi
    const activatedAgain = await seedDevGames(db);
    expect(activatedAgain).toEqual(["flappy-bird", "memory-match", "ludo"]);

    const usersAfter = await db.select({ id: users.id }).from(users);
    expect(usersAfter.length).toBe(usersBefore.length);
  });
});
