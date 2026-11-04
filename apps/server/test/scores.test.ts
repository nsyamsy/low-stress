import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDb,
  games,
  gameRuns,
  gameScores,
  users,
  type Database,
} from "@low-stress/db";
import { eq, inArray, sql } from "drizzle-orm";
import { hashPassword } from "../src/auth/password";
import { readEnv } from "../src/env";
import {
  calculateMemoryMatchScore,
  getLeaderboard,
  getLeaderboardBounds,
  plausibleRun,
  recordScore,
} from "../src/games/scores";

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

describe("P5-01: Generic Score System & Plausibility", () => {
  let dbHandle: ReturnType<typeof createDb>;
  let db: Database;

  const TEST_PREFIX = `sc_t${(Date.now() % 1000000).toString(36)}_`;
  const gameId = `${TEST_PREFIX}mm`;
  const flappyGameId = "flappy-bird";

  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    dbHandle = createDb(env.DATABASE_URL);
    db = dbHandle.db;

    const pwHash = await hashPassword("dummyPass123!");

    // Seed test games
    await db
      .insert(games)
      .values([
        { id: gameId, status: "active" },
        { id: flappyGameId, status: "active" },
        { id: "memory-match", status: "active" },
      ])
      .onConflictDoNothing();

    // Seed test users
    const [uA] = await db
      .insert(users)
      .values({
        username: `${TEST_PREFIX}usra`,
        displayName: "User A",
        email: `${TEST_PREFIX}usra@example.com`,
        passwordHash: pwHash,
        status: "active",
      })
      .returning({ id: users.id });
    userAId = uA!.id;

    const [uB] = await db
      .insert(users)
      .values({
        username: `${TEST_PREFIX}usrb`,
        displayName: "User B",
        email: `${TEST_PREFIX}usrb@example.com`,
        passwordHash: pwHash,
        status: "active",
      })
      .returning({ id: users.id });
    userBId = uB!.id;
  });

  afterAll(async () => {
    await db.delete(gameRuns).where(inArray(gameRuns.gameId, [gameId, flappyGameId]));
    await db.delete(gameScores).where(inArray(gameScores.gameId, [gameId, flappyGameId]));
    await db.delete(users).where(inArray(users.id, [userAId, userBId]));
    await db.delete(games).where(eq(games.id, gameId));
    await dbHandle.close();
  });

  describe("plausibleRun & score calculation", () => {
    it("menghitung skor Memory Match sesuai rumus Porting_Guide §3", () => {
      // 10 detik (10000 ms), 12 langkah (moves), 2 combo
      // totalSecs = 10, timePenalty = 250
      // movePenalty = (12 - 8) * 45 = 180
      // comboBonus = 2 * 150 = 300
      // score = max(200, 5000 - 250 - 180 + 300) = 4870
      const score = calculateMemoryMatchScore(10000, 12, 2);
      expect(score).toBe(4870);

      // Skor minimal adalah 200
      const lowScore = calculateMemoryMatchScore(300000, 200, 0);
      expect(lowScore).toBe(200);
    });

    it("memvalidasi run Memory Match (plausibleRun)", () => {
      const validScore = calculateMemoryMatchScore(12000, 10, 1);
      // Valid run
      expect(
        plausibleRun("memory-match", {
          score: validScore,
          durationMs: 12000,
          moves: 10,
          combos: 1,
        }),
      ).toBe(true);

      // Score tidak cocok dengan rumus dihitung ulang
      expect(
        plausibleRun("memory-match", {
          score: validScore + 50,
          durationMs: 12000,
          moves: 10,
          combos: 1,
        }),
      ).toBe(false);

      // Durasi terlalu cepat (< 2000 ms)
      expect(
        plausibleRun("memory-match", {
          score: validScore,
          durationMs: 1500,
          moves: 10,
          combos: 1,
        }),
      ).toBe(false);

      // Langkah kurang dari jumlah minimal kartu (< 8)
      expect(
        plausibleRun("memory-match", {
          score: validScore,
          durationMs: 12000,
          moves: 7,
          combos: 1,
        }),
      ).toBe(false);
    });

    it("memvalidasi run Flappy Bird (plausibleRun)", () => {
      // 10 detik, skor 5 (wajar: 5 <= floor(10 / 0.85) + 1 = 12)
      expect(plausibleRun("flappy-bird", 5, 10000)).toBe(true);

      // Skor tidak mungkin (skor 30 dalam 5 detik)
      expect(plausibleRun("flappy-bird", 30, 5000)).toBe(false);

      // Skor di atas batas maksimal 500
      expect(plausibleRun("flappy-bird", 501, 1000000)).toBe(false);
    });
  });

  describe("recordScore (rekor, urutan seri, plays, best_play)", () => {
    it("mencatat play 1 sebagai rekor awal", async () => {
      const r1 = await recordScore({
        db,
        gameId,
        userId: userAId,
        score: 3000,
        durationMs: 15000,
      });

      expect(r1.best).toBe(3000);
      expect(r1.plays).toBe(1);
      expect(r1.bestPlay).toBe(1);
      expect(r1.isNewBest).toBe(true);
    });

    it("mencatat play 2 dengan skor lebih tinggi -> rekor baru", async () => {
      const r2 = await recordScore({
        db,
        gameId,
        userId: userAId,
        score: 4200,
        durationMs: 12000,
      });

      expect(r2.best).toBe(4200);
      expect(r2.plays).toBe(2);
      expect(r2.bestPlay).toBe(2);
      expect(r2.isNewBest).toBe(true);
    });

    it("mencatat play 3 dengan skor lebih rendah -> rekor dan best_play tidak berubah", async () => {
      const r3 = await recordScore({
        db,
        gameId,
        userId: userAId,
        score: 2500,
        durationMs: 20000,
      });

      expect(r3.best).toBe(4200);
      expect(r3.plays).toBe(3);
      expect(r3.bestPlay).toBe(2);
      expect(r3.isNewBest).toBe(false);
    });

    it("mencatat play 4 dengan skor seri -> yang lebih awal menang (urutan seri), best_play tetap", async () => {
      // Ambil timestamp bestReachedAt sebelum play 4
      const [before] = await db
        .select()
        .from(gameScores)
        .where(
          sql`${gameScores.userId} = ${userAId}::uuid AND ${gameScores.gameId} = ${gameId}`,
        );

      const r4 = await recordScore({
        db,
        gameId,
        userId: userAId,
        score: 4200, // Seri dengan rekor lama 4200
        durationMs: 11000,
      });

      expect(r4.best).toBe(4200);
      expect(r4.plays).toBe(4);
      expect(r4.bestPlay).toBe(2); // Tetap play ke-2, bukan play ke-4!
      expect(r4.isNewBest).toBe(false);

      const [after] = await db
        .select()
        .from(gameScores)
        .where(
          sql`${gameScores.userId} = ${userAId}::uuid AND ${gameScores.gameId} = ${gameId}`,
        );

      // bestReachedAt tidak boleh berubah saat seri (yang lebih awal menang)
      expect(after!.bestReachedAt.getTime()).toBe(before!.bestReachedAt.getTime());
    });

    it("mencatat play 5 yang memecahkan rekor -> best_play menjadi 5", async () => {
      const r5 = await recordScore({
        db,
        gameId,
        userId: userAId,
        score: 4600,
        durationMs: 9000,
      });

      expect(r5.best).toBe(4600);
      expect(r5.plays).toBe(5);
      expect(r5.bestPlay).toBe(5);
      expect(r5.isNewBest).toBe(true);
    });

    it("menjaga urutan seri antar pemain: pemain yang mencapai skor lebih awal memiliki rank lebih tinggi", async () => {
      // User B mencapai skor 4600 setelah User A
      await recordScore({
        db,
        gameId,
        userId: userBId,
        score: 4600,
        durationMs: 9500,
      });

      const res = await db.execute(sql`
        SELECT user_id, best_score, best_reached_at,
               RANK() OVER (ORDER BY best_score DESC, best_reached_at ASC) as rank
          FROM game_scores
         WHERE game_id = ${gameId}
         ORDER BY rank ASC
      `);
      const rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as Array<Record<string, unknown>>;

      expect(rows[0]!.user_id).toBe(userAId);
      expect(Number(rows[0]!.rank)).toBe(1);
      expect(rows[1]!.user_id).toBe(userBId);
      expect(Number(rows[1]!.rank)).toBe(2);
    });

    it("mengabaikan run Flappy Bird dengan skor < 1 (tidak dihitung dan tidak disimpan)", async () => {
      const initialRuns = await db
        .select()
        .from(gameRuns)
        .where(
          sql`${gameRuns.userId} = ${userAId}::uuid AND ${gameRuns.gameId} = ${flappyGameId}`,
        );

      const rFlappyZero = await recordScore({
        db,
        gameId: flappyGameId,
        userId: userAId,
        score: 0,
        durationMs: 800,
      });

      expect(rFlappyZero.best).toBe(0);
      expect(rFlappyZero.plays).toBe(0);
      expect(rFlappyZero.bestPlay).toBeNull();
      expect(rFlappyZero.isNewBest).toBe(false);

      const runsAfter = await db
        .select()
        .from(gameRuns)
        .where(
          sql`${gameRuns.userId} = ${userAId}::uuid AND ${gameRuns.gameId} = ${flappyGameId}`,
        );

      expect(runsAfter.length).toBe(initialRuns.length);
    });
  });

  describe("P5-02: Leaderboard (Weekly, Monthly, All Time dalam WIB)", () => {
    it("menghitung batas minggu (Senin 00:00 WIB) dan bulan (tanggal 1 00:00 WIB)", async () => {
      // 2026-11-08 23:59:59 WIB (Minggu) => UTC: 2026-11-08T16:59:59.000Z
      const sundayNight = new Date("2026-11-08T16:59:59.000Z");
      const sundayBounds = await getLeaderboardBounds(db, "week", sundayNight);
      // Minggu 8 Nov WIB masuk ke minggu yang dimulai Senin 2 Nov 2026 (2026-11-01T17:00:00.000Z UTC)
      expect(sundayBounds.periodStart).toBe("2026-11-01T17:00:00.000Z");
      expect(sundayBounds.periodEnd).toBe("2026-11-08T17:00:00.000Z");

      // 2026-11-09 00:00:00 WIB (Senin) => UTC: 2026-11-08T17:00:00.000Z
      const mondayMorning = new Date("2026-11-08T17:00:00.000Z");
      const mondayBounds = await getLeaderboardBounds(db, "week", mondayMorning);
      // Senin 9 Nov WIB masuk ke minggu baru yang dimulai Senin 9 Nov 2026 (2026-11-08T17:00:00.000Z UTC)
      expect(mondayBounds.periodStart).toBe("2026-11-08T17:00:00.000Z");
      expect(mondayBounds.periodEnd).toBe("2026-11-15T17:00:00.000Z");

      // Batas bulan: 2026-10-31 23:59:59 WIB => UTC: 2026-10-31T16:59:59.000Z
      const octEnd = new Date("2026-10-31T16:59:59.000Z");
      const octBounds = await getLeaderboardBounds(db, "month", octEnd);
      expect(octBounds.periodStart).toBe("2026-09-30T17:00:00.000Z"); // 1 Okt 00:00 WIB
      expect(octBounds.periodEnd).toBe("2026-10-31T17:00:00.000Z"); // 1 Nov 00:00 WIB

      // 2026-11-01 00:00:00 WIB => UTC: 2026-10-31T17:00:00.000Z
      const novStart = new Date("2026-10-31T17:00:00.000Z");
      const novBounds = await getLeaderboardBounds(db, "month", novStart);
      expect(novBounds.periodStart).toBe("2026-10-31T17:00:00.000Z"); // 1 Nov 00:00 WIB
      expect(novBounds.periodEnd).toBe("2026-11-30T17:00:00.000Z"); // 1 Des 00:00 WIB
    });

    it("memfilter weekly run secara tepat di batas Senin 00:00 WIB", async () => {
      const lbGameId = `${TEST_PREFIX}lb_w`;
      await db.insert(games).values({ id: lbGameId, status: "active" });

      // Run 1: Minggu malam 23:59:00 WIB (UTC: 2026-11-08T16:59:00Z)
      await db.insert(gameRuns).values({
        userId: userAId,
        gameId: lbGameId,
        score: 3500,
        durationMs: 10000,
        createdAt: new Date("2026-11-08T16:59:00.000Z"),
      });

      // Run 2: Senin 00:01:00 WIB (UTC: 2026-11-08T17:01:00Z)
      await db.insert(gameRuns).values({
        userId: userAId,
        gameId: lbGameId,
        score: 4100,
        durationMs: 10000,
        createdAt: new Date("2026-11-08T17:01:00.000Z"),
      });

      // Query pada hari Senin 9 Nov 10:00 WIB
      const queryDate = new Date("2026-11-09T03:00:00.000Z");
      const board = await getLeaderboard({
        db,
        gameId: lbGameId,
        userId: userAId,
        period: "week",
        now: queryDate,
      });

      expect(board.entries.length).toBe(1);
      // Run Minggu tidak masuk; hanya run Senin (skor 4100) yang masuk
      expect(board.entries[0]!.score).toBe(4100);
      expect(board.entries[0]!.plays).toBe(1);
      expect(board.entries[0]!.bestPlay).toBe(1);

      await db.delete(gameRuns).where(eq(gameRuns.gameId, lbGameId));
      await db.delete(games).where(eq(games.id, lbGameId));
    });

    it("memfilter monthly run secara tepat di batas 1st of month 00:00 WIB", async () => {
      const lbGameId = `${TEST_PREFIX}lb_m`;
      await db.insert(games).values({ id: lbGameId, status: "active" });

      // Run 1: 31 Oktober 23:59:00 WIB (UTC: 2026-10-31T16:59:00Z)
      await db.insert(gameRuns).values({
        userId: userAId,
        gameId: lbGameId,
        score: 2800,
        durationMs: 10000,
        createdAt: new Date("2026-10-31T16:59:00.000Z"),
      });

      // Run 2: 1 November 00:01:00 WIB (UTC: 2026-10-31T17:01:00Z)
      await db.insert(gameRuns).values({
        userId: userAId,
        gameId: lbGameId,
        score: 3900,
        durationMs: 10000,
        createdAt: new Date("2026-10-31T17:01:00.000Z"),
      });

      // Query pada 2 November 2026
      const queryDate = new Date("2026-11-02T05:00:00.000Z");
      const board = await getLeaderboard({
        db,
        gameId: lbGameId,
        userId: userAId,
        period: "month",
        now: queryDate,
      });

      expect(board.entries.length).toBe(1);
      expect(board.entries[0]!.score).toBe(3900);
      expect(board.entries[0]!.plays).toBe(1);

      await db.delete(gameRuns).where(eq(gameRuns.gameId, lbGameId));
      await db.delete(games).where(eq(games.id, lbGameId));
    });

    it("menyajikan all-time leaderboard dengan sensor nama dan sorotan baris pemain (me/mine)", async () => {
      // User A (4600) vs User B (4600 dibuat belakangan)
      const board = await getLeaderboard({
        db,
        gameId,
        userId: userBId,
        period: "all",
      });

      expect(board.period).toBe("all");
      expect(board.periodStart).toBeNull();
      expect(board.periodEnd).toBeNull();
      expect(board.entries.length).toBe(2);

      // Rank 1: User A (karena mencapai 4600 lebih awal)
      expect(board.entries[0]!.userId).toBe(userAId);
      expect(board.entries[0]!.rank).toBe(1);
      expect(board.entries[0]!.isMe).toBe(false);

      // Rank 2: User B
      expect(board.entries[1]!.userId).toBe(userBId);
      expect(board.entries[1]!.rank).toBe(2);
      expect(board.entries[1]!.isMe).toBe(true);

      // Karena User B berada di top 10 (entries), me bernilai null dan mine terisi
      expect(board.me).toBeNull();
      expect(board.mine).not.toBeNull();
      expect(board.mine?.userId).toBe(userBId);
    });
  });

  describe("P5-03: Integrasi Skor Memory Match ke Server", () => {
    it("menerima dan menyimpan skor Memory Match yang sah", async () => {
      // 12000 ms, 10 langkah, 1 combo -> skor = 4700
      const score = calculateMemoryMatchScore(12000, 10, 1);
      const res = await recordScore({
        db,
        gameId: "memory-match",
        userId: userAId,
        score,
        durationMs: 12000,
      });

      expect(res.best).toBe(score);
      expect(res.plays).toBeGreaterThanOrEqual(1);
      expect(res.isNewBest).toBe(true);

      const [run] = await db
        .select()
        .from(gameRuns)
        .where(
          sql`${gameRuns.userId} = ${userAId}::uuid AND ${gameRuns.gameId} = 'memory-match'`,
        );

      expect(run).toBeDefined();
      expect(run!.score).toBe(score);
      expect(run!.durationMs).toBe(12000);
      expect(run!.flagged).toBe(false);
    });
  });
});
