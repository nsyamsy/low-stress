import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDb,
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
import { createSession, SESSION_COOKIE_NAME } from "../src/auth/session";
import { readEnv } from "../src/env";
import { calculateMemoryMatchScore } from "../src/games/scores";
import type { LoadedGame } from "../src/registry/games";

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

describe("P5-04: Leaderboard E2E & Player Row Highlight", () => {
  let app: FastifyInstance;
  let dbHandle: ReturnType<typeof createDb>;
  let db: Database;

  const TEST_PREFIX = `lb_e2e_${(Date.now() % 1000000).toString(36)}_`;
  const gameId = "memory-match";

  let player1Id: string;
  let player1Cookie: string;

  let player2Id: string;
  let player2Cookie: string;

  const mockLoadedGame: LoadedGame = {
    manifest: {
      id: "memory-match",
      version: "0.1.0",
      title: { id: "Memory Match", en: "Memory Match" },
      description: { id: "Game ingatan", en: "Memory game" },
      icon: "icon.svg",
      mode: "solo",
      mobile: { supported: true },
      scoring: {
        direction: "higher",
        minScore: 50,
        maxScore: 10000,
        minDurationMs: 2000,
        maxDurationMs: 7200000,
        maxSubmitRatePerMin: 30,
      },
      client: async () => ({ default: (() => null) as never }),
    },
    path: "/games/memory-match/manifest.ts",
  };

  beforeAll(async () => {
    dbHandle = createDb(env.DATABASE_URL);
    db = dbHandle.db;

    app = await buildApp({
      db,
      env,
      games: [mockLoadedGame],
    });
    await app.ready();

    // Ensure memory-match is active in games table
    await db
      .insert(games)
      .values({ id: gameId, status: "active" })
      .onConflictDoUpdate({
        target: games.id,
        set: { status: "active", schedule: null },
      });

    const pwHash = await hashPassword("PlayerPass123!");

    // Buat Player 1
    const [u1] = await db
      .insert(users)
      .values({
        username: `${TEST_PREFIX}p1`,
        displayName: "Siti Rahma",
        email: `${TEST_PREFIX}p1@example.com`,
        passwordHash: pwHash,
        status: "active",
      })
      .returning();
    player1Id = u1!.id;

    // Buat Player 2
    const [u2] = await db
      .insert(users)
      .values({
        username: `${TEST_PREFIX}p2`,
        displayName: "Budi Santoso",
        email: `${TEST_PREFIX}p2@example.com`,
        passwordHash: pwHash,
        status: "active",
      })
      .returning();
    player2Id = u2!.id;

    // Buat sesi Player 1
    const s1 = await createSession(db, player1Id);
    player1Cookie = s1.rawToken;

    // Buat sesi Player 2
    const s2 = await createSession(db, player2Id);
    player2Cookie = s2.rawToken;
  });

  afterAll(async () => {
    await db.delete(gameRuns).where(eq(gameRuns.gameId, gameId));
    await db.delete(gameScores).where(eq(gameScores.gameId, gameId));
    await db.delete(sessions).where(inArray(sessions.subjectId, [player1Id, player2Id]));
    await db.delete(users).where(inArray(users.id, [player1Id, player2Id]));
    await app.close();
    await dbHandle.close();
  });

  it("skor baru muncul di papan leaderboard dan baris pemain sendiri tersorot (isMe: true)", async () => {
    // 1. Awalnya papan leaderboard kosong untuk user baru
    const initialRes = await app.inject({
      method: "GET",
      url: `/api/games/${gameId}/leaderboard?period=all`,
      cookies: { [SESSION_COOKIE_NAME]: player1Cookie },
    });
    expect(initialRes.statusCode).toBe(200);
    const initialBody = initialRes.json();
    expect(initialBody.entries.length).toBe(0);
    expect(initialBody.mine).toBeNull();
    expect(initialBody.me).toBeNull();

    // 2. Player 1 memainkan run dan mengirim skor (10000ms, 12 moves, 2 combos -> skor 4870)
    const score1 = calculateMemoryMatchScore(10000, 12, 2);
    const postRes1 = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/scores`,
      cookies: { [SESSION_COOKIE_NAME]: player1Cookie },
      payload: {
        score: score1,
        durationMs: 10000,
        moves: 12,
        combos: 2,
      },
    });
    expect(postRes1.statusCode).toBe(200);
    expect(postRes1.json()).toEqual({
      best: score1,
      bestPlay: 1,
      plays: 1,
      isNewBest: true,
    });

    // 3. Player 1 melihat leaderboard: skor baru muncul dan baris sendiri tersorot (isMe: true)
    const lbRes1 = await app.inject({
      method: "GET",
      url: `/api/games/${gameId}/leaderboard?period=all`,
      cookies: { [SESSION_COOKIE_NAME]: player1Cookie },
    });
    expect(lbRes1.statusCode).toBe(200);
    const lbBody1 = lbRes1.json();
    expect(lbBody1.entries.length).toBe(1);
    expect(lbBody1.entries[0].userId).toBe(player1Id);
    expect(lbBody1.entries[0].name).toBe("Siti Rahma");
    expect(lbBody1.entries[0].score).toBe(score1);
    expect(lbBody1.entries[0].isMe).toBe(true); // Tersorot!
    expect(lbBody1.entries[0].rank).toBe(1);
    expect(lbBody1.mine).not.toBeNull();
    expect(lbBody1.mine.isMe).toBe(true);
    expect(lbBody1.me).toBeNull(); // Karena sudah ada di top 10

    // 4. Player 2 melihat leaderboard yang sama: baris Player 1 isMe: false
    const lbRes2 = await app.inject({
      method: "GET",
      url: `/api/games/${gameId}/leaderboard?period=all`,
      cookies: { [SESSION_COOKIE_NAME]: player2Cookie },
    });
    const lbBody2 = lbRes2.json();
    expect(lbBody2.entries.length).toBe(1);
    expect(lbBody2.entries[0].userId).toBe(player1Id);
    expect(lbBody2.entries[0].isMe).toBe(false); // Bukan milik Player 2
    expect(lbBody2.mine).toBeNull(); // Player 2 belum ada skor

    // 5. Player 2 mencetak skor lebih tinggi (8000ms, 9 moves, 3 combos -> skor 4955)
    const score2 = calculateMemoryMatchScore(8000, 9, 3);
    const postRes2 = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/scores`,
      cookies: { [SESSION_COOKIE_NAME]: player2Cookie },
      payload: {
        score: score2,
        durationMs: 8000,
        moves: 9,
        combos: 3,
      },
    });
    expect(postRes2.statusCode).toBe(200);

    // 6. Player 1 mengecek kembali: sekarang Rank 1 adalah Budi, Rank 2 adalah Siti (isMe: true)
    const lbResFinal = await app.inject({
      method: "GET",
      url: `/api/games/${gameId}/leaderboard?period=all`,
      cookies: { [SESSION_COOKIE_NAME]: player1Cookie },
    });
    const lbBodyFinal = lbResFinal.json();
    expect(lbBodyFinal.entries.length).toBe(2);

    expect(lbBodyFinal.entries[0].userId).toBe(player2Id);
    expect(lbBodyFinal.entries[0].rank).toBe(1);
    expect(lbBodyFinal.entries[0].isMe).toBe(false);

    expect(lbBodyFinal.entries[1].userId).toBe(player1Id);
    expect(lbBodyFinal.entries[1].rank).toBe(2);
    expect(lbBodyFinal.entries[1].isMe).toBe(true); // Siti Rahma tersorot!
  });
});
