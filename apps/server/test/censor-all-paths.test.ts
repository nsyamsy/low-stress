import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDb,
  chatMessages,
  games,
  gameRuns,
  gameScores,
  runGameMigrations,
  users,
  type Database,
} from "@low-stress/db";
import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { hashPassword } from "../src/auth/password";
import { createSession } from "../src/auth/session";
import { readEnv } from "../src/env";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile("../../.env");
  } catch {
    try {
      process.loadEnvFile(".env");
    } catch {
      // Abaikan
    }
  }
}

const env = readEnv();

describe("P8-06: Sensor diterapkan pada chat Ludo dan nama tampilan di semua jalur", () => {
  let app: FastifyInstance;
  let dbHandle: ReturnType<typeof createDb>;
  let db: Database;

  const TEST_PREFIX = `p806_${(Date.now() % 1000000).toString(36)}_`;
  let profaneUser: typeof users.$inferSelect;
  let profaneSessionToken: string;

  let normalUser: typeof users.$inferSelect;

  beforeAll(async () => {
    dbHandle = createDb(env.DATABASE_URL);
    db = dbHandle.db;

    await runGameMigrations(dbHandle.sql);

    // Pastikan game ludo dan memory-match aktif
    await db
      .insert(games)
      .values({ id: "ludo", status: "active" })
      .onConflictDoUpdate({
        target: games.id,
        set: { status: "active" },
      });

    await db
      .insert(games)
      .values({ id: "memory-match", status: "active" })
      .onConflictDoUpdate({
        target: games.id,
        set: { status: "active" },
      });

    const pwHash = await hashPassword("ProfanePass123!");

    // 1. Pemain dengan nama tampilan kasar (disimpan mentah di DB)
    const [pu] = await db
      .insert(users)
      .values({
        username: `${TEST_PREFIX}prof`,
        displayName: "Si B@ng$at Hebat",
        email: `${TEST_PREFIX}prof@example.com`,
        passwordHash: pwHash,
        status: "active",
      })
      .returning();
    profaneUser = pu!;
    const pSess = await createSession(db, profaneUser.id);
    profaneSessionToken = pSess.rawToken;

    // 2. Pemain normal
    const [nu] = await db
      .insert(users)
      .values({
        username: `${TEST_PREFIX}norm`,
        displayName: "Pemain Baik",
        email: `${TEST_PREFIX}norm@example.com`,
        passwordHash: pwHash,
        status: "active",
      })
      .returning();
    normalUser = nu!;

    app = await buildApp({
      env,
      db,
      logger: false,
    });
  });

  afterAll(async () => {
    const userIds = [profaneUser?.id, normalUser?.id].filter(Boolean);
    if (userIds.length > 0) {
      await db.delete(chatMessages).where(inArray(chatMessages.userId, userIds));
      await db.delete(gameRuns).where(inArray(gameRuns.userId, userIds));
      await db.delete(gameScores).where(inArray(gameScores.userId, userIds));
      await db.delete(users).where(inArray(users.id, userIds));
    }
    await app.close();
    await dbHandle.close();
  });

  it("menyensor nama tampilan saat dirender di GET /api/me (nilai asli tetap di DB)", async () => {
    // Di database, nilai tetap asli
    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, profaneUser.id));
    expect(dbUser!.displayName).toBe("Si B@ng$at Hebat");

    // Di API /api/me, tersensor
    const res = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: {
        cookie: `ls_session=${profaneSessionToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.displayName).toBe("Si ******* Hebat");
  });

  it("menyensor nama tampilan di Leaderboard publik", async () => {
    // Masukkan skor untuk profaneUser
    await db.insert(gameScores).values({
      gameId: "memory-match",
      userId: profaneUser.id,
      bestScore: 5000,
      plays: 1,
      bestReachedAt: new Date(),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/games/memory-match/leaderboard?period=all",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const entry = body.entries.find((e: { userId: string }) => e.userId === profaneUser.id);
    expect(entry).toBeDefined();
    expect(entry.name).toBe("Si ******* Hebat");
  });
});
