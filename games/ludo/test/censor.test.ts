import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDb,
  bannedWords,
  ludoMessages,
  ludoRooms,
  users,
  eq,
  type Database,
} from "@low-stress/sdk/server";
import { createRoom, performAction } from "../server/service";

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

describe("P8-06: Sensor pada Ludo Chat", () => {
  let dbHandle: ReturnType<typeof createDb>;
  let db: Database;

  const TEST_PREFIX = `ludocensor_${(Date.now() % 1000000).toString(36)}_`;
  let profaneUser: typeof users.$inferSelect;
  let ludoRoomId: string;
  const customBadWord = `jorok_${Date.now()}`;

  beforeAll(async () => {
    if (!dbUrl) {
      throw new Error("DATABASE_URL atau TEST_DATABASE_URL wajib diatur");
    }
    dbHandle = createDb(dbUrl);
    db = dbHandle.db;

    const [u] = await db
      .insert(users)
      .values({
        username: `${TEST_PREFIX}profane`,
        displayName: "Si B@ng$at Hebat",
        email: `${TEST_PREFIX}profane@example.com`,
        passwordHash: "dummy-hash",
        status: "active",
      })
      .returning();
    profaneUser = u!;
  });

  afterAll(async () => {
    if (ludoRoomId) {
      await db.delete(ludoMessages).where(eq(ludoMessages.roomId, ludoRoomId));
      await db.delete(ludoRooms).where(eq(ludoRooms.id, ludoRoomId));
    }
    if (profaneUser) {
      await db.delete(users).where(eq(users.id, profaneUser.id));
    }
    await db.delete(bannedWords).where(eq(bannedWords.word, customBadWord));
    if (dbHandle) {
      await dbHandle.sql.end();
    }
  });

  it("menyensor pesan chat Ludo dan nama pengirim di room:action chat", async () => {
    ludoRoomId = await createRoom(
      db,
      {
        userId: profaneUser.id,
        username: profaneUser.username,
        displayName: profaneUser.displayName,
      },
      "Room Ludo Santai",
      4,
      true,
    );

    const { chatMessage, view } = await performAction(
      db,
      ludoRoomId,
      {
        userId: profaneUser.id,
        username: profaneUser.username,
        displayName: profaneUser.displayName,
      },
      {
        action: "chat",
        text: "kamu b@ng$at dan aanjiing lu",
      },
    );

    expect(chatMessage).toBeDefined();
    expect(chatMessage!.text).toBe("kamu ******* dan ******** lu");
    expect(chatMessage!.name).toBe("Si ******* Hebat");

    const [dbMsg] = await db
      .select()
      .from(ludoMessages)
      .where(eq(ludoMessages.id, chatMessage!.id));
    expect(dbMsg).toBeDefined();
    expect(dbMsg!.body).toBe("kamu ******* dan ******** lu");

    const roomMsg = view.messages.find((m) => m.id === chatMessage!.id);
    expect(roomMsg).toBeDefined();
    expect(roomMsg!.text).toBe("kamu ******* dan ******** lu");
    expect(roomMsg!.name).toBe("Si ******* Hebat");
  });
});
