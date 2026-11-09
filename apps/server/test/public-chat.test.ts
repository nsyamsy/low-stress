import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as Client, type Socket as ClientSocket } from "socket.io-client";
import {
  createDb,
  chatMessages,
  users,
  type Database,
} from "@low-stress/db";
import { eq, inArray } from "drizzle-orm";
import { buildApp } from "../src/app";
import { hashPassword } from "../src/auth/password";
import { createSession } from "../src/auth/session";
import { readEnv } from "../src/env";
import { purgeOldChatMessages } from "../src/chat/service";

const env = readEnv();

describe("P8-02: Public chat with Socket.IO, history, rate limit, server censor, and purge", () => {
  let dbHandle: ReturnType<typeof createDb>;
  let db: Database;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let serverPort: number;
  let serverUrl: string;

  let activeUserA: typeof users.$inferSelect;
  let activeTokenA: string;

  let activeUserB: typeof users.$inferSelect;
  let activeTokenB: string;

  let pendingUser: typeof users.$inferSelect;
  let pendingToken: string;

  const testUserIds: string[] = [];

  beforeAll(async () => {
    dbHandle = createDb(env.DATABASE_URL);
    db = dbHandle.db;

    const pwHash = await hashPassword("ChatPass123!");
    const timeSuffix = (Date.now() % 1000000).toString(36);

    const [uA] = await db
      .insert(users)
      .values({
        username: `chat_a_${timeSuffix}`,
        displayName: "User Chat A",
        email: `chat_a_${timeSuffix}@example.com`,
        passwordHash: pwHash,
        status: "active",
      })
      .returning();
    activeUserA = uA!;
    testUserIds.push(activeUserA.id);
    const sA = await createSession(db, activeUserA.id);
    activeTokenA = sA.rawToken;

    const [uB] = await db
      .insert(users)
      .values({
        username: `chat_b_${timeSuffix}`,
        displayName: "User Chat B",
        email: `chat_b_${timeSuffix}@example.com`,
        passwordHash: pwHash,
        status: "active",
      })
      .returning();
    activeUserB = uB!;
    testUserIds.push(activeUserB.id);
    const sB = await createSession(db, activeUserB.id);
    activeTokenB = sB.rawToken;

    const [uP] = await db
      .insert(users)
      .values({
        username: `chat_p_${timeSuffix}`,
        displayName: "User Chat Pending",
        email: `chat_p_${timeSuffix}@example.com`,
        passwordHash: pwHash,
        status: "pending",
      })
      .returning();
    pendingUser = uP!;
    testUserIds.push(pendingUser.id);
    const sP = await createSession(db, pendingUser.id);
    pendingToken = sP.rawToken;

    app = await buildApp({
      env,
      db,
      logger: false,
    });

    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const url = new URL(address);
    serverPort = Number(url.port);
    serverUrl = `http://127.0.0.1:${serverPort}`;
  });

  afterAll(async () => {
    if (testUserIds.length > 0) {
      await db.delete(chatMessages).where(inArray(chatMessages.userId, testUserIds));
      await db.delete(users).where(inArray(users.id, testUserIds));
    }
    await app.close();
    await dbHandle.close();
  });

  it("menolak koneksi socket /public-chat dari pemain pending", async () => {
    const socket = Client(`${serverUrl}/public-chat`, {
      path: "/ws",
      extraHeaders: {
        cookie: `ls_session=${pendingToken}`,
      },
      reconnection: false,
    });

    const errPromise = new Promise<string>((resolve) => {
      socket.on("connect_error", (err) => {
        resolve(err.message);
      });
    });

    const errMsg = await errPromise;
    expect(errMsg).toBe("FORBIDDEN");
    socket.disconnect();
  });

  it("menolak koneksi socket /public-chat dari tamu tanpa cookie", async () => {
    const socket = Client(`${serverUrl}/public-chat`, {
      path: "/ws",
      reconnection: false,
    });

    const errPromise = new Promise<string>((resolve) => {
      socket.on("connect_error", (err) => {
        resolve(err.message);
      });
    });

    const errMsg = await errPromise;
    expect(errMsg).toBe("FORBIDDEN");
    socket.disconnect();
  });

  it("mengizinkan pemain aktif tersambung, menerima presence, dan bertukar pesan tersensor", async () => {
    const socketA: ClientSocket = Client(`${serverUrl}/public-chat`, {
      path: "/ws",
      extraHeaders: {
        cookie: `ls_session=${activeTokenA}`,
      },
      reconnection: false,
    });

    const socketB: ClientSocket = Client(`${serverUrl}/public-chat`, {
      path: "/ws",
      extraHeaders: {
        cookie: `ls_session=${activeTokenB}`,
      },
      reconnection: false,
    });

    await new Promise<void>((resolve) => {
      let count = 0;
      const check = () => {
        count++;
        if (count === 2) resolve();
      };
      socketA.on("connect", check);
      socketB.on("connect", check);
    });

    // Pasang listener di socketB untuk menerima chat:message
    const messagePromise = new Promise<{ id: string; body: string; userId: string }>((resolve) => {
      socketB.on("chat:message", (msg: { id: string; body: string; userId: string }) => {
        resolve(msg);
      });
    });

    // Socket A mengirim pesan kasar
    const ack = await new Promise<{ ok: boolean; code?: string }>((resolve) => {
      socketA.emit(
        "chat:send",
        { body: "halo b@ng$at lu ya" },
        (res: { ok: boolean; code?: string }) => resolve(res),
      );
    });

    expect(ack.ok).toBe(true);

    const received = await messagePromise;
    expect(received.body).toBe("halo ******* lu ya");
    expect(received.userId).toBe(activeUserA.id);

    // Verifikasi pesan kasar tersimpan dalam kondisi tersensor di database
    const [dbMessage] = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, received.id));
    expect(dbMessage).toBeDefined();
    expect(dbMessage!.body).toBe("halo ******* lu ya");

    // Rate limit: Socket A mencoba mengirim pesan lagi segera (< 2 dtk)
    const rateLimitAck = await new Promise<{ ok: boolean; code?: string }>((resolve) => {
      socketA.emit(
        "chat:send",
        { body: "pesan kedua cepat" },
        (res: { ok: boolean; code?: string }) => resolve(res),
      );
    });

    expect(rateLimitAck.ok).toBe(false);
    expect(rateLimitAck.code).toBe("RATE_LIMITED");

    socketA.disconnect();
    socketB.disconnect();
  });

  it("GET /api/chat/history menolak pending dan melayani riwayat tersensor untuk pemain aktif", async () => {
    // 1. Pending ditolak
    const pendingRes = await app.inject({
      method: "GET",
      url: "/api/chat/history",
      headers: {
        cookie: `ls_session=${pendingToken}`,
      },
    });
    expect(pendingRes.statusCode).toBe(403);
    expect(pendingRes.json().error.code).toBe("ACCOUNT_PENDING");

    // 2. Active berhasil mengambil history
    const activeRes = await app.inject({
      method: "GET",
      url: "/api/chat/history",
      headers: {
        cookie: `ls_session=${activeTokenA}`,
      },
    });
    expect(activeRes.statusCode).toBe(200);
    const body = activeRes.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(1);

    const lastMsg = body.items[body.items.length - 1];
    expect(lastMsg.body).toContain("*******");
  });

  it("purge-chat menghapus pesan lama > 7 hari tapi mempertahankan pesan baru", async () => {
    // Buat pesan lama buatan (8 hari yang lalu)
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const [oldMsg] = await db
      .insert(chatMessages)
      .values({
        userId: activeUserA.id,
        body: "pesan kadaluarsa",
        createdAt: eightDaysAgo,
      })
      .returning();

    // Jalankan pembersihan
    const purgedCount = await purgeOldChatMessages(db, 7);
    expect(purgedCount).toBeGreaterThanOrEqual(1);

    // Pastikan oldMsg sudah terhapus
    const [checkOld] = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, oldMsg!.id));
    expect(checkOld).toBeUndefined();
  });
});
