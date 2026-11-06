import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createDb,
  ludoMessages,
  ludoPlayers,
  ludoRooms,
  users,
  eq,
  type Database,
} from "@low-stress/sdk/server";
import {
  expireInactiveRooms,
  startLudoExpirationJob,
} from "../server/expiration";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile("../../.env.test");
  } catch {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // Abaikan
    }
  }
}

const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

describe("P7-06: Ludo Room Expiration Job (> 7 Days Inactive)", () => {
  let dbHandle: ReturnType<typeof createDb>;
  let db: Database;
  let testUser: typeof users.$inferSelect;

  beforeAll(async () => {
    if (!dbUrl) {
      throw new Error("DATABASE_URL atau TEST_DATABASE_URL wajib diatur");
    }
    dbHandle = createDb(dbUrl);
    db = dbHandle.db;

    const timeSuffix = (Date.now() % 1000000).toString(36) + "_exp";

    const [u] = await db
      .insert(users)
      .values({
        username: `exp_u_${timeSuffix}`,
        displayName: "User Expire",
        email: `exp_u_${timeSuffix}@example.com`,
        passwordHash: "dummy_hash_for_test",
        status: "active",
      })
      .returning();
    testUser = u!;
  });

  afterAll(async () => {
    if (testUser) {
      await db.delete(users).where(eq(users.id, testUser.id));
    }
    if (dbHandle) {
      await dbHandle.sql.end();
    }
  });

  it("deletes rooms inactive > 7 days and preserves active rooms", async () => {
    const baseTime = new Date("2026-11-04T12:00:00Z");

    // Room 1: 10 days old (should expire)
    const oldActivity = new Date(baseTime.getTime() - 10 * 24 * 60 * 60 * 1000);
    const [oldRoom] = await db
      .insert(ludoRooms)
      .values({
        id: randomUUID(),
        name: "Old Expired Room",
        hostId: testUser.id,
        status: "lobby",
        maxPlayers: 4,
        lastActivityAt: oldActivity,
      })
      .returning();

    // Insert player & message for old room to verify CASCADE delete
    await db.insert(ludoPlayers).values({
      roomId: oldRoom!.id,
      userId: testUser.id,
      status: "accepted",
    });
    await db.insert(ludoMessages).values({
      roomId: oldRoom!.id,
      userId: testUser.id,
      body: "Pesan lama",
    });

    // Room 2: 2 days old (should stay active)
    const recentActivity = new Date(baseTime.getTime() - 2 * 24 * 60 * 60 * 1000);
    const [activeRoom] = await db
      .insert(ludoRooms)
      .values({
        id: randomUUID(),
        name: "Recent Active Room",
        hostId: testUser.id,
        status: "lobby",
        maxPlayers: 4,
        lastActivityAt: recentActivity,
      })
      .returning();

    // Run expiration with fake clock at baseTime
    const deletedCount = await expireInactiveRooms(db, { now: baseTime });
    expect(deletedCount).toBeGreaterThanOrEqual(1);

    // Verify old room is deleted
    const [checkOld] = await db
      .select()
      .from(ludoRooms)
      .where(eq(ludoRooms.id, oldRoom!.id));
    expect(checkOld).toBeUndefined();

    // Verify cascaded players and messages are deleted
    const playersOld = await db
      .select()
      .from(ludoPlayers)
      .where(eq(ludoPlayers.roomId, oldRoom!.id));
    expect(playersOld.length).toBe(0);

    const msgsOld = await db
      .select()
      .from(ludoMessages)
      .where(eq(ludoMessages.roomId, oldRoom!.id));
    expect(msgsOld.length).toBe(0);

    // Verify active room still exists
    const [checkActive] = await db
      .select()
      .from(ludoRooms)
      .where(eq(ludoRooms.id, activeRoom!.id));
    expect(checkActive).toBeDefined();

    // Cleanup active room
    await db.delete(ludoRooms).where(eq(ludoRooms.id, activeRoom!.id));
  });

  it("runs periodically via startLudoExpirationJob with fake timer", async () => {
    vi.useFakeTimers();

    const intervalMs = 60 * 60 * 1000; // 1 hour

    const job = startLudoExpirationJob(db, undefined, intervalMs);

    // Fast forward fake clock 1 hour
    vi.advanceTimersByTime(intervalMs);

    job.stop();
    vi.useRealTimers();
  });
});
