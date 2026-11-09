import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  admins,
  auditLog,
  createDb,
  riotRoomPlayers,
  riotRooms,
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

describe("RT-51: Admin Moderation for Riot", () => {
  let app: FastifyInstance;
  let dbHandle: ReturnType<typeof createDb>;
  let db: Database;

  const TEST_PREFIX = `riot_adm_${(Date.now() % 1000000).toString(36)}_`;
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

    const adminHashed = await hashPassword(adminPassword);
    const [insertedAdmin] = await db
      .insert(admins)
      .values({
        username: adminUsername,
        passwordHash: adminHashed,
      })
      .returning();
    adminId = insertedAdmin!.id;

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

    roomId = randomUUID().slice(0, 36);
    await db.insert(riotRooms).values({
      id: roomId,
      name: "Room Moderasi Uji",
      hostId: playerUser.id,
      status: "playing",
    });

    await db.insert(riotRoomPlayers).values([
      { roomId, userId: playerUser.id, status: "alive" },
      { roomId, userId: otherUser.id, status: "alive" },
    ]);

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
      await db.delete(riotRooms).where(eq(riotRooms.id, roomId));
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

  it("lists all riot rooms with optional status filter", async () => {
    const { fullCookieHeader } = await loginAsAdmin();

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/riot/rooms?status=playing",
      headers: {
        cookie: fullCookieHeader,
      },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.items).toBeDefined();
    expect(data.items.some((r: { id: string }) => r.id === roomId)).toBe(true);
  });

  it("gets room detail including players and matches", async () => {
    const { fullCookieHeader } = await loginAsAdmin();

    const res = await app.inject({
      method: "GET",
      url: `/api/admin/riot/rooms/${roomId}`,
      headers: {
        cookie: fullCookieHeader,
      },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.room.id).toBe(roomId);
    expect(data.players.length).toBe(2);
    expect(Array.isArray(data.matches)).toBe(true);
  });

  it("kicks a player from room and logs to audit_log", async () => {
    const { csrfToken, fullCookieHeader } = await loginAsAdmin();

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/riot/rooms/${roomId}/kick`,
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

    const remainingPlayers = await db
      .select()
      .from(riotRoomPlayers)
      .where(eq(riotRoomPlayers.roomId, roomId));
    expect(remainingPlayers.some((p) => p.userId === otherUser.id)).toBe(false);

    const auditEntries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "riot_kick_player"));
    expect(auditEntries.some((a) => a.targetId === roomId)).toBe(true);
  });

  it("resets room to lobby and logs to audit_log", async () => {
    const { csrfToken, fullCookieHeader } = await loginAsAdmin();

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/riot/rooms/${roomId}/reset`,
      headers: {
        origin: env.APP_ORIGIN,
        "x-csrf-token": csrfToken,
        cookie: fullCookieHeader,
      },
    });

    expect(res.statusCode).toBe(200);

    const [checkRoom] = await db
      .select()
      .from(riotRooms)
      .where(eq(riotRooms.id, roomId));
    expect(checkRoom?.status).toBe("lobby");

    const auditEntries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "riot_reset_room"));
    expect(auditEntries.some((a) => a.targetId === roomId)).toBe(true);
  });

  it("deletes room and logs to audit_log", async () => {
    const { csrfToken, fullCookieHeader } = await loginAsAdmin();

    const res = await app.inject({
      method: "DELETE",
      url: `/api/admin/riot/rooms/${roomId}`,
      headers: {
        origin: env.APP_ORIGIN,
        "x-csrf-token": csrfToken,
        cookie: fullCookieHeader,
      },
    });

    expect(res.statusCode).toBe(204);

    const [checkRoom] = await db
      .select()
      .from(riotRooms)
      .where(eq(riotRooms.id, roomId));
    expect(checkRoom).toBeUndefined();

    const auditEntries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "riot_delete_room"));
    expect(auditEntries.some((a) => a.targetId === roomId)).toBe(true);
  });
});
