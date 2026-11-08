import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createDb,
  bannedWords,
  ludoMessages,
  ludoRooms,
  users,
  eq,
  type Database,
} from "@low-stress/sdk/server";
import { createRoom, performAction, setLudoCensor } from "../server/service";
import { setupLudoSocket } from "../server/socket";

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

describe("T-04 & T-05: Ludo Server Security & Censor Injection", () => {
  it("setLudoCensor memungkinkan injeksi fungsi sensor kustom dari ctx.censorText", () => {
    const customFn = vi.fn((text: string) => text.replace(/rahasia/gi, "*******"));
    setLudoCensor(customFn);
    expect(customFn("kata rahasia")).toBe("kata *******");
    setLudoCensor(undefined);
  });

  it("setupLudoSocket menolak koneksi dari principal admin (FORBIDDEN)", async () => {
    let middlewareFn:
      | ((socket: unknown, next: (err?: Error) => void) => Promise<void>)
      | undefined;

    const fakeNsp = {
      use: (fn: (socket: unknown, next: (err?: Error) => void) => Promise<void>) => {
        middlewareFn = fn;
      },
      on: vi.fn(),
      in: vi.fn(),
      to: vi.fn(),
    };
    const fakeIo = {
      of: vi.fn(() => fakeNsp),
    };
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    };

    setupLudoSocket(
      fakeIo as never,
      fakeDb as never,
      {},
      {
        db: fakeDb,
        resolvePrincipal: async () => ({
          kind: "admin",
          admin: { id: "adm-1", username: "superadmin" },
        }),
      },
    );

    expect(middlewareFn).toBeDefined();
    let capturedErr: Error | undefined;
    await middlewareFn!(
      { handshake: { headers: { cookie: "ls_admin=tok" } }, data: {} },
      (err?: Error) => {
        capturedErr = err;
      },
    );
    expect(capturedErr).toBeDefined();
    expect(capturedErr?.message).toBe("FORBIDDEN");
  });
});

describe.skipIf(!dbUrl)("P8-06: Sensor pada Ludo Chat", () => {
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
    if (db && ludoRoomId) {
      await db.delete(ludoMessages).where(eq(ludoMessages.roomId, ludoRoomId));
      await db.delete(ludoRooms).where(eq(ludoRooms.id, ludoRoomId));
    }
    if (db && profaneUser) {
      await db.delete(users).where(eq(users.id, profaneUser.id));
    }
    if (db) {
      await db.delete(bannedWords).where(eq(bannedWords.word, customBadWord));
    }
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
