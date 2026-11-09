import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  admins,
  auditLog,
  createDb,
  ludoMessages,
  ludoPlayers,
  ludoRooms,
  runGameMigrations,
  users,
  type Database,
} from "@low-stress/db";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { hashPassword } from "../src/auth/password";
import { readEnv } from "../src/env";

const env = readEnv();

describe("P7-08: Admin Moderation for Ludo", () => {
  let app: FastifyInstance;
  let dbHandle: ReturnType<typeof createDb>;
  let db: Database;

  const TEST_PREFIX = `ludo_adm_${(Date.now() % 1000000).toString(36)}_`;
  const adminUsername = `${TEST_PREFIX}admin`;
  const adminPassword = "superAdminPass123!";
  let adminId: string;

  let playerUser: typeof users.$inferSelect;
  let otherUser: typeof users.$inferSelect;
  let roomId: string;

  beforeAll(async () => {
    dbHandle = createDb(env.DATABASE_URL);
    db = dbHandle.db;
    await runGameMigrations(dbHandle.sql);

    // Buat admin
    const adminHashed = await hashPassword(adminPassword);
    const [insertedAdmin] = await db
      .insert(admins)
      .values({
        username: adminUsername,
        passwordHash: adminHashed,
      })
      .returning();
    adminId = insertedAdmin!.id;

    // Buat user pemain
    const playerHashed = await hashPassword("PlayerPass123!");
    const [p1] = await db
      .insert(users)
      .values({
        username: `${TEST_PREFIX}p1`,
        displayName: "Pemain 1",
        email: `${TEST_PREFIX}p1@example.com`,
        passwordHash: playerHashed,
        status: "active",
      })
      .returning();
    playerUser = p1!;

    const [p2] = await db
      .insert(users)
      .values({
        username: `${TEST_PREFIX}p2`,
        displayName: "Pemain 2",
        email: `${TEST_PREFIX}p2@example.com`,
        passwordHash: playerHashed,
        status: "active",
      })
      .returning();
    otherUser = p2!;

    // Buat room uji di status playing
    roomId = randomUUID();
    await db.insert(ludoRooms).values({
      id: roomId,
      name: "Ruangan Moderasi Uji",
      hostId: playerUser.id,
      status: "playing",
      maxPlayers: 4,
      pawns: 2,
      seatUsers: [playerUser.id, otherUser.id],
      version: 1,
    });

    await db.insert(ludoPlayers).values([
      { roomId, userId: playerUser.id, status: "accepted" },
      { roomId, userId: otherUser.id, status: "accepted" },
    ]);

    await db.insert(ludoMessages).values({
      roomId,
      userId: playerUser.id,
      body: "Pesan dalam ruangan moderasi",
    });

    app = await buildApp({
      env,
      db,
      logger: false,
      ludoAutopilot: {
        paceMs: 100_000,
        idleTimeoutMs: 100_000,
      },
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (roomId) {
      await db.delete(ludoRooms).where(eq(ludoRooms.id, roomId));
    }
    if (adminId) {
      await db.delete(admins).where(eq(admins.id, adminId));
    }
    await dbHandle.sql.end();
  });

  async function getCsrf(): Promise<{ csrfToken: string; cookieHeader: string }> {
    const res = await app.inject({
      method: "GET",
      url: "/api/csrf",
      headers: { origin: env.APP_ORIGIN },
    });
    const body = res.json() as { token: string };
    const rawCookie = res.headers["set-cookie"];
    const cookieHeader = Array.isArray(rawCookie) ? rawCookie.join("; ") : (rawCookie ?? "");
    return { csrfToken: body.token, cookieHeader };
  }

  async function loginAsAdmin(): Promise<{ adminCookie: string; csrfToken: string; fullCookieHeader: string }> {
    const { csrfToken, cookieHeader } = await getCsrf();

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      headers: {
        origin: env.APP_ORIGIN,
        "x-csrf-token": csrfToken,
        cookie: cookieHeader,
      },
      payload: {
        username: adminUsername,
        password: adminPassword,
      },
    });

    const setCookie = res.headers["set-cookie"];
    const cookieStr = Array.isArray(setCookie) ? setCookie.join("; ") : (setCookie ?? "");
    const adminMatch = cookieStr.match(/ls_admin=([^;]+)/);
    const adminToken = adminMatch ? adminMatch[1] : "";

    return {
      adminCookie: adminToken ?? "",
      csrfToken,
      fullCookieHeader: `${cookieHeader}; ${cookieStr}`,
    };
  }

  it("lists all ludo rooms with optional status filter", async () => {
    const { fullCookieHeader } = await loginAsAdmin();

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/ludo/rooms?status=playing",
      headers: {
        cookie: fullCookieHeader,
      },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.items).toBeDefined();
    expect(data.items.some((r: { id: string }) => r.id === roomId)).toBe(true);
  });

  it("gets room detail including players and chat messages", async () => {
    const { fullCookieHeader } = await loginAsAdmin();

    const res = await app.inject({
      method: "GET",
      url: `/api/admin/ludo/rooms/${roomId}`,
      headers: {
        cookie: fullCookieHeader,
      },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.room.id).toBe(roomId);
    expect(data.players.length).toBe(2);
    expect(data.messages.some((m: { body: string }) => m.body === "Pesan dalam ruangan moderasi")).toBe(true);
  });

  it("kicks a player from room and logs to audit_log", async () => {
    const { csrfToken, fullCookieHeader } = await loginAsAdmin();

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/ludo/rooms/${roomId}/kick`,
      headers: {
        origin: env.APP_ORIGIN,
        "x-csrf-token": csrfToken,
        cookie: fullCookieHeader,
      },
      payload: {
        userId: otherUser.id,
      },
    });

    expect(res.statusCode).toBe(200);

    // Verify player deleted from room
    const remainingPlayers = await db
      .select()
      .from(ludoPlayers)
      .where(eq(ludoPlayers.roomId, roomId));
    expect(remainingPlayers.some((p) => p.userId === otherUser.id)).toBe(false);

    // Verify recorded in audit_log
    const auditEntries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "ludo_kick_player"));
    expect(auditEntries.some((a) => a.targetId === roomId)).toBe(true);
  });

  it("resets room to lobby and logs to audit_log", async () => {
    const { csrfToken, fullCookieHeader } = await loginAsAdmin();

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/ludo/rooms/${roomId}/reset`,
      headers: {
        origin: env.APP_ORIGIN,
        "x-csrf-token": csrfToken,
        cookie: fullCookieHeader,
      },
    });

    expect(res.statusCode).toBe(200);

    // Verify room status reset to lobby
    const [checkRoom] = await db
      .select()
      .from(ludoRooms)
      .where(eq(ludoRooms.id, roomId));
    expect(checkRoom?.status).toBe("lobby");
    expect(checkRoom?.state).toBeNull();

    // Verify recorded in audit_log
    const auditEntries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "ludo_reset_room"));
    expect(auditEntries.some((a) => a.targetId === roomId)).toBe(true);
  });

  it("deletes room and logs to audit_log", async () => {
    const { csrfToken, fullCookieHeader } = await loginAsAdmin();

    const res = await app.inject({
      method: "DELETE",
      url: `/api/admin/ludo/rooms/${roomId}`,
      headers: {
        origin: env.APP_ORIGIN,
        "x-csrf-token": csrfToken,
        cookie: fullCookieHeader,
      },
    });

    expect(res.statusCode).toBe(204);

    // Verify room deleted
    const [checkRoom] = await db
      .select()
      .from(ludoRooms)
      .where(eq(ludoRooms.id, roomId));
    expect(checkRoom).toBeUndefined();

    // Verify recorded in audit_log
    const auditEntries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "ludo_delete_room"));
    expect(auditEntries.some((a) => a.targetId === roomId)).toBe(true);
  });
});
