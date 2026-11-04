import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as Client, type Socket as ClientSocket } from "socket.io-client";
import {
  createDb,
  admins,
  auditLog,
  bannedWords,
  chatMessages,
  chatMutes,
  users,
  type Database,
} from "@low-stress/db";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { hashPassword } from "../src/auth/password";
import {
  ADMIN_COOKIE_NAME,
  createSession,
} from "../src/auth/session";
import { readEnv } from "../src/env";

interface SocketAck {
  ok: boolean;
  code?: string;
}

interface ChatMessageEvent {
  id: string;
  userId: string;
  name: string;
  body: string;
}

interface ChatMutedEvent {
  until: string;
}

interface ChatStatusEvent {
  enabled: boolean;
}

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

describe("P8-04: Admin Chat Moderation, Mute, Banned Words, and Audit Log", () => {
  let app: FastifyInstance;
  let dbHandle: ReturnType<typeof createDb>;
  let db: Database;
  let serverPort: number;
  let serverUrl: string;

  const TEST_PREFIX = `admchat_${(Date.now() % 1000000).toString(36)}_`;
  const adminUsername = `${TEST_PREFIX}adm`;
  const adminPassword = "ChatAdminPass123!";
  let adminId: string;
  let adminCookie: string;
  let adminCsrfToken: string;

  let testUser: typeof users.$inferSelect;
  let testUserSessionToken: string;
  let createdMessageId: string;
  let customBannedWordId: string;

  const customWord = `kotor_${Date.now()}`;

  function connectPlayerSocket(token: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket: ClientSocket = Client(`${serverUrl}/public-chat`, {
        path: "/ws",
        transports: ["websocket"],
        reconnection: false,
        extraHeaders: {
          Cookie: `ls_session=${token}`,
        },
      });
      socket.on("connect", () => resolve(socket));
      socket.on("connect_error", (err) => reject(err));
    });
  }

  async function loginAdminClient() {
    const csrfRes = await app.inject({
      method: "GET",
      url: "/api/csrf",
    });
    const csrfToken = csrfRes.json().token;
    const csrfCookie = csrfRes.cookies.find((c) => c.name === "ls_csrf");

    const loginRes = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      headers: {
        origin: env.APP_ORIGIN,
        "x-csrf-token": csrfToken,
        cookie: `ls_csrf=${csrfCookie?.value}`,
      },
      payload: {
        username: adminUsername,
        password: adminPassword,
      },
    });

    expect(loginRes.statusCode).toBe(200);
    const adminSessionCookie = loginRes.cookies.find(
      (c) => c.name === ADMIN_COOKIE_NAME,
    );

    return {
      csrfToken,
      cookieHeader: `${ADMIN_COOKIE_NAME}=${adminSessionCookie?.value}; ls_csrf=${csrfCookie?.value}`,
    };
  }

  beforeAll(async () => {
    dbHandle = createDb(env.DATABASE_URL);
    db = dbHandle.db;

    // Buat admin uji coba
    const adminPwHash = await hashPassword(adminPassword);
    const [adminRow] = await db
      .insert(admins)
      .values({
        username: adminUsername,
        passwordHash: adminPwHash,
      })
      .returning();
    adminId = adminRow!.id;

    // Buat pemain uji coba
    const userPwHash = await hashPassword("PlayerPass123!");
    const [uRow] = await db
      .insert(users)
      .values({
        username: `${TEST_PREFIX}usr`,
        displayName: "Pemain Moderasi",
        email: `${TEST_PREFIX}usr@example.com`,
        passwordHash: userPwHash,
        status: "active",
      })
      .returning();
    testUser = uRow!;
    const session = await createSession(db, testUser.id);
    testUserSessionToken = session.rawToken;

    app = await buildApp({
      env,
      db,
      logger: false,
    });

    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const url = new URL(address);
    serverPort = Number(url.port);
    serverUrl = `http://127.0.0.1:${serverPort}`;

    const adminAuth = await loginAdminClient();
    adminCookie = adminAuth.cookieHeader;
    adminCsrfToken = adminAuth.csrfToken;
  });

  afterAll(async () => {
    if (customBannedWordId) {
      await db.delete(bannedWords).where(eq(bannedWords.id, customBannedWordId));
    }
    if (testUser) {
      await db.delete(chatMessages).where(eq(chatMessages.userId, testUser.id));
      await db.delete(chatMutes).where(eq(chatMutes.userId, testUser.id));
      await db.delete(users).where(eq(users.id, testUser.id));
    }
    if (adminId) {
      await db.delete(admins).where(eq(admins.id, adminId));
    }
    await app.close();
    await dbHandle.close();
  });

  it("pemain mengirim pesan, admin melihat daftar pesan via GET /api/admin/chat", async () => {
    const socket = await connectPlayerSocket(testUserSessionToken);

    const ack = await new Promise<SocketAck>((resolve) => {
      socket.emit("chat:send", { body: "pesan uji coba admin" }, (res: SocketAck) =>
        resolve(res),
      );
    });
    expect(ack.ok).toBe(true);
    socket.disconnect();

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/chat?page=1&limit=10",
      headers: {
        cookie: adminCookie,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    const msg = body.items.find((m: { body: string }) => m.body === "pesan uji coba admin");
    expect(msg).toBeDefined();
    expect(msg.userId).toBe(testUser.id);
    createdMessageId = msg.id;
  });

  it("admin menghapus pesan, pesan hilang dari klien seketika, dan aksi dicatat di audit log", async () => {
    expect(createdMessageId).toBeDefined();

    const socket = await connectPlayerSocket(testUserSessionToken);

    const deletedEventPromise = new Promise<{ id: string }>((resolve) => {
      socket.on("chat:deleted", (data) => resolve(data));
    });

    // Admin menghapus pesan via DELETE /api/admin/chat/:id
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/admin/chat/${createdMessageId}`,
      headers: {
        origin: env.APP_ORIGIN,
        "x-csrf-token": adminCsrfToken,
        cookie: adminCookie,
      },
    });
    expect(deleteRes.statusCode).toBe(204);

    // Klien seketika menerima event chat:deleted
    const receivedEvent = await deletedEventPromise;
    expect(receivedEvent.id).toBe(createdMessageId);
    socket.disconnect();

    // Verifikasi pesan terhapus dari database
    const [dbMsg] = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, createdMessageId));
    expect(dbMsg).toBeUndefined();

    // Verifikasi aksi tercatat di audit_log
    const logs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "chat_delete_message"));
    expect(logs.some((l) => l.targetId === createdMessageId)).toBe(true);
  });

  it("admin dapat membisukan pemain, pemain menerima sinyal chat:muted dan ditolak saat kirim pesan", async () => {
    const socket = await connectPlayerSocket(testUserSessionToken);

    const mutedEventPromise = new Promise<ChatMutedEvent>((resolve) => {
      socket.on("chat:muted", (data: ChatMutedEvent) => resolve(data));
    });

    // Admin membisukan pemain selama 60 menit
    const muteRes = await app.inject({
      method: "POST",
      url: "/api/admin/chat/mute",
      headers: {
        origin: env.APP_ORIGIN,
        "x-csrf-token": adminCsrfToken,
        cookie: adminCookie,
      },
      payload: {
        userId: testUser.id,
        minutes: 60,
        reason: "Spam pesan tidak pantas",
      },
    });

    expect(muteRes.statusCode).toBe(200);

    // Pemain seketika menerima notifikasi chat:muted
    const mutedEvent = await mutedEventPromise;
    expect(mutedEvent.until).toBeDefined();

    // Coba kirim pesan saat dibisukan
    const sendAck = await new Promise<SocketAck>((resolve) => {
      socket.emit("chat:send", { body: "coba kirim saat bisu" }, (res: SocketAck) =>
        resolve(res),
      );
    });
    expect(sendAck.ok).toBe(false);
    expect(sendAck.code).toBe("CHAT_MUTED");

    socket.disconnect();

    // Verifikasi audit log
    const logs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "chat_mute_user"));
    expect(logs.some((l) => l.targetId === testUser.id)).toBe(true);
  });

  it("admin dapat mencabut status bisu pemain (DELETE /api/admin/chat/mute/:userId)", async () => {
    const unmuteRes = await app.inject({
      method: "DELETE",
      url: `/api/admin/chat/mute/${testUser.id}`,
      headers: {
        origin: env.APP_ORIGIN,
        "x-csrf-token": adminCsrfToken,
        cookie: adminCookie,
      },
    });
    expect(unmuteRes.statusCode).toBe(204);

    // Verifikasi audit log
    const logs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "chat_unmute_user"));
    expect(logs.some((l) => l.targetId === testUser.id)).toBe(true);
  });

  it("admin dapat mematikan chat publik dan klien menerima status chat:status", async () => {
    const socket = await connectPlayerSocket(testUserSessionToken);

    const statusEventPromise = new Promise<ChatStatusEvent>((resolve) => {
      socket.on("chat:status", (data: ChatStatusEvent) => {
        if (!data.enabled) resolve(data);
      });
    });

    // Admin mematikan chat lewat settings
    const patchRes = await app.inject({
      method: "PATCH",
      url: "/api/admin/settings",
      headers: {
        origin: env.APP_ORIGIN,
        "x-csrf-token": adminCsrfToken,
        cookie: adminCookie,
      },
      payload: {
        chatEnabled: false,
      },
    });
    expect(patchRes.statusCode).toBe(200);

    const receivedStatus = await statusEventPromise;
    expect(receivedStatus.enabled).toBe(false);

    // Pengiriman chat ditolak CHAT_DISABLED
    const ack = await new Promise<SocketAck>((resolve) => {
      socket.emit("chat:send", { body: "test saat mati" }, (res: SocketAck) =>
        resolve(res),
      );
    });
    expect(ack.ok).toBe(false);
    expect(ack.code).toBe("CHAT_DISABLED");

    // Nyalakan kembali chat
    await app.inject({
      method: "PATCH",
      url: "/api/admin/settings",
      headers: {
        origin: env.APP_ORIGIN,
        "x-csrf-token": adminCsrfToken,
        cookie: adminCookie,
      },
      payload: {
        chatEnabled: true,
      },
    });

    socket.disconnect();
  });

  it("admin dapat mengelola kata terlarang (tambah, aktif/nonaktif, hapus) dan audit log tercatat", async () => {
    // 1. Tambah kata terlarang
    const addRes = await app.inject({
      method: "POST",
      url: "/api/admin/banned-words",
      headers: {
        origin: env.APP_ORIGIN,
        "x-csrf-token": adminCsrfToken,
        cookie: adminCookie,
      },
      payload: {
        word: customWord,
        lang: "id",
      },
    });
    expect(addRes.statusCode).toBe(201);
    const added = addRes.json();
    customBannedWordId = added.id;
    expect(added.word).toBe(customWord);

    // Kata baru seketika tersensor tanpa restart server
    const socket = await connectPlayerSocket(testUserSessionToken);

    const msgPromise = new Promise<ChatMessageEvent>((resolve) => {
      socket.on("chat:message", (m: ChatMessageEvent) => resolve(m));
    });

    // Beri jeda 2.1s agar rate limiter chat:send lolos
    await new Promise((r) => setTimeout(r, 2100));

    const ack = await new Promise<SocketAck>((resolve) => {
      socket.emit("chat:send", { body: `dasar ${customWord}` }, (res: SocketAck) =>
        resolve(res),
      );
    });
    expect(ack.ok).toBe(true);

    const received = await msgPromise;
    expect(received.body).toBe(`dasar ${"*".repeat(customWord.length)}`);
    socket.disconnect();

    // 2. Nonaktifkan kata
    const patchWordRes = await app.inject({
      method: "PATCH",
      url: `/api/admin/banned-words/${customBannedWordId}`,
      headers: {
        origin: env.APP_ORIGIN,
        "x-csrf-token": adminCsrfToken,
        cookie: adminCookie,
      },
      payload: {
        enabled: false,
      },
    });
    expect(patchWordRes.statusCode).toBe(200);

    // 3. Hapus kata
    const deleteWordRes = await app.inject({
      method: "DELETE",
      url: `/api/admin/banned-words/${customBannedWordId}`,
      headers: {
        origin: env.APP_ORIGIN,
        "x-csrf-token": adminCsrfToken,
        cookie: adminCookie,
      },
    });
    expect(deleteWordRes.statusCode).toBe(204);

    // Verifikasi audit logs
    const addLogs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "banned_word_add"));
    expect(addLogs.some((l) => l.targetId === customBannedWordId)).toBe(true);

    const deleteLogs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "banned_word_delete"));
    expect(deleteLogs.some((l) => l.targetId === customBannedWordId)).toBe(true);
  });
});
