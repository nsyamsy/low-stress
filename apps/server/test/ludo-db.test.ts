import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDb,
  ludoMessages,
  ludoPlayers,
  ludoRooms,
  runGameMigrations,
  users,
  type Database,
} from "@low-stress/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "../src/auth/password";
import { readEnv } from "../src/env";

const env = readEnv();

describe("P7-02: Ludo Database Schema & Migrations", () => {
  let dbHandle: ReturnType<typeof createDb>;
  let db: Database;
  let testHostId: string;
  let testPlayerId: string;
  const testRoomId = `test_rm_${Date.now()}`;

  beforeAll(async () => {
    dbHandle = createDb(env.DATABASE_URL);
    db = dbHandle.db;

    // Ensure game migrations applied
    await runGameMigrations(dbHandle.sql);

    const pwHash = await hashPassword("passLudo123!");
    const [h] = await db
      .insert(users)
      .values({
        username: `ludo_h_${(Date.now() % 1000000).toString(36)}`,
        displayName: "Host Ludo",
        email: `ludo_h_${(Date.now() % 1000000).toString(36)}@example.com`,
        passwordHash: pwHash,
        status: "active",
      })
      .returning({ id: users.id });
    testHostId = h!.id;

    const [p] = await db
      .insert(users)
      .values({
        username: `ludo_p_${(Date.now() % 1000000).toString(36)}`,
        displayName: "Player Ludo",
        email: `ludo_p_${(Date.now() % 1000000).toString(36)}@example.com`,
        passwordHash: pwHash,
        status: "active",
      })
      .returning({ id: users.id });
    testPlayerId = p!.id;
  });

  afterAll(async () => {
    if (testRoomId) {
      await db.delete(ludoRooms).where(eq(ludoRooms.id, testRoomId));
    }
    if (testHostId) {
      await db.delete(users).where(eq(users.id, testHostId));
    }
    if (testPlayerId) {
      await db.delete(users).where(eq(users.id, testPlayerId));
    }
    await dbHandle.close();
  });

  it("ensures game migrations are idempotent", async () => {
    const applied = await runGameMigrations(dbHandle.sql);
    expect(applied).toEqual([]); // already applied, nothing new
  });

  it("creates a room with last_activity_at and default values", async () => {
    const now = new Date();
    await db.insert(ludoRooms).values({
      id: testRoomId,
      name: "Ruangan Uji Migrasi",
      hostId: testHostId,
      status: "lobby",
      maxPlayers: 12,
      lastActivityAt: now,
    });

    const [room] = await db
      .select()
      .from(ludoRooms)
      .where(eq(ludoRooms.id, testRoomId));

    expect(room).toBeDefined();
    expect(room?.name).toBe("Ruangan Uji Migrasi");
    expect(room?.status).toBe("lobby");
    expect(room?.maxPlayers).toBe(12);
    expect(room?.lastActivityAt).toBeInstanceOf(Date);
  });

  it("adds players with status, pawn, and autopilot", async () => {
    await db.insert(ludoPlayers).values([
      {
        roomId: testRoomId,
        userId: testHostId,
        status: "accepted",
        pawn: "crown",
        autopilot: false,
      },
      {
        roomId: testRoomId,
        userId: testPlayerId,
        status: "invited",
        pawn: "cat",
        autopilot: true,
      },
    ]);

    const players = await db
      .select()
      .from(ludoPlayers)
      .where(eq(ludoPlayers.roomId, testRoomId));

    expect(players).toHaveLength(2);
    const hostPlayer = players.find((p) => p.userId === testHostId);
    expect(hostPlayer?.status).toBe("accepted");
    expect(hostPlayer?.pawn).toBe("crown");
    expect(hostPlayer?.autopilot).toBe(false);

    const invitedPlayer = players.find((p) => p.userId === testPlayerId);
    expect(invitedPlayer?.status).toBe("invited");
    expect(invitedPlayer?.pawn).toBe("cat");
    expect(invitedPlayer?.autopilot).toBe(true);
  });

  it("adds chat messages linked to room", async () => {
    const [msg] = await db
      .insert(ludoMessages)
      .values({
        roomId: testRoomId,
        userId: testHostId,
        body: "Halo dari uji migrasi!",
      })
      .returning();

    expect(msg).toBeDefined();
    expect(msg?.body).toBe("Halo dari uji migrasi!");
    expect(msg?.roomId).toBe(testRoomId);

    const msgs = await db
      .select()
      .from(ludoMessages)
      .where(eq(ludoMessages.roomId, testRoomId));
    expect(msgs.length).toBeGreaterThanOrEqual(1);
  });

  it("cascades deletion of room to players and messages", async () => {
    await db.delete(ludoRooms).where(eq(ludoRooms.id, testRoomId));

    const playersAfter = await db
      .select()
      .from(ludoPlayers)
      .where(eq(ludoPlayers.roomId, testRoomId));
    expect(playersAfter).toHaveLength(0);

    const msgsAfter = await db
      .select()
      .from(ludoMessages)
      .where(eq(ludoMessages.roomId, testRoomId));
    expect(msgsAfter).toHaveLength(0);
  });
});
