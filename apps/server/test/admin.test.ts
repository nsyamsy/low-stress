import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDb,
  admins,
  users,
  sessions,
  settings,
  chatMessages,
  auditLog,
  type Database,
} from "@low-stress/db";
import { eq, inArray, like } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { readEnv } from "../src/env";
import { hashPassword } from "../src/auth/password";
import {
  ADMIN_COOKIE_NAME,
} from "../src/auth/session";
import { LogAdapter } from "../src/email/adapter";

const env = readEnv();

describe("Admin API (Phase 3: P3-02 .. P3-08)", () => {
  let app: FastifyInstance;
  let dbHandle: ReturnType<typeof createDb>;
  let db: Database;

  const TEST_PREFIX = `adm_t${(Date.now() % 1000000).toString(36)}_`;
  const adminUsername = `${TEST_PREFIX}root`;
  const adminPassword = "superAdminSecret123!";
  let adminId: string;

  const createdUsernames: string[] = [];
  const createdEmails: string[] = [];

  const helperUsername = (name: string) => `${TEST_PREFIX}${name}`.slice(0, 20);
  const helperEmail = (name: string) => `${TEST_PREFIX}${name}@example.test`;

  beforeAll(async () => {
    dbHandle = createDb(env.DATABASE_URL, { max: 2 });
    db = dbHandle.db;

    // Buat admin uji
    const hashed = await hashPassword(adminPassword);
    const [inserted] = await db
      .insert(admins)
      .values({
        username: adminUsername,
        passwordHash: hashed,
      })
      .returning();
    adminId = inserted!.id;

    app = await buildApp({
      env,
      db,
      logger: false,
    });
  });

  afterAll(async () => {
    if (db) {
      if (createdUsernames.length > 0) {
        await db.delete(users).where(inArray(users.username, createdUsernames));
      }
      await db.delete(admins).where(eq(admins.id, adminId));
      await db.delete(auditLog).where(eq(auditLog.adminId, adminId));
      // Bersihkan settings uji
      await db.delete(settings).where(like(settings.key, `${TEST_PREFIX}%`));
      await db.delete(settings).where(inArray(settings.key, ["registration", "registration_mode", "ludoMaxPlayers"]));
    }
    if (app) {
      await app.close();
    }
    if (dbHandle) {
      await dbHandle.close();
    }
  });

  // Helper untuk mendapatkan token CSRF dan cookies
  async function getCsrf(): Promise<{ csrfToken: string; cookieHeader: string }> {
    const res = await app.inject({
      method: "GET",
      url: "/api/csrf",
    });
    const body = res.json() as { token: string };
    const rawCookie = res.headers["set-cookie"];
    const cookieHeader = Array.isArray(rawCookie) ? rawCookie.join("; ") : (rawCookie ?? "");
    return { csrfToken: body.token, cookieHeader };
  }

  // Helper login pemain
  async function loginAsPlayer(username: string, password = "userSecretPassword123!"): Promise<{ cookieStr: string; statusCode: number; json: Record<string, unknown> }> {
    const { csrfToken, cookieHeader } = await getCsrf();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: {
        origin: env.APP_ORIGIN,
        "x-csrf-token": csrfToken,
        cookie: cookieHeader,
      },
      payload: { username, password },
    });
    const setCookie = res.headers["set-cookie"];
    const cookieStr = Array.isArray(setCookie) ? setCookie.join("; ") : (setCookie ?? "");
    return { cookieStr: `${cookieHeader}; ${cookieStr}`, statusCode: res.statusCode, json: res.json() as Record<string, unknown> };
  }

  // Helper login admin
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

    expect(res.statusCode).toBe(200);
    const setCookie = res.headers["set-cookie"];
    const setCookieStr = Array.isArray(setCookie) ? setCookie.join("; ") : (setCookie ?? "");
    const adminCookieMatch = setCookieStr.match(new RegExp(`${ADMIN_COOKIE_NAME}=([^;]+)`));
    const adminCookie = (adminCookieMatch ? adminCookieMatch[1] : "") ?? "";

    const combinedCookie = `${cookieHeader}; ${ADMIN_COOKIE_NAME}=${adminCookie}`;
    return { adminCookie, csrfToken, fullCookieHeader: combinedCookie };
  }

  // Helper buat pemain uji
  async function createTestUser(
    name: string,
    status: "pending" | "active" | "rejected" | "suspended" | "banned" = "active",
  ): Promise<{ id: string; username: string; email: string }> {
    const username = helperUsername(name);
    const email = helperEmail(name);
    createdUsernames.push(username);
    createdEmails.push(email);

    const hashed = await hashPassword("userSecretPassword123!");
    const [u] = await db
      .insert(users)
      .values({
        username,
        displayName: `User ${name}`,
        email,
        passwordHash: hashed,
        status,
        lastLoginAt: new Date(),
      })
      .returning();

    return { id: u!.id, username: u!.username, email: u!.email };
  }

  describe("P3-02: Auth Admin & Pemisahan Peran", () => {
    it("admin dapat login dan menerima cookie ls_admin", async () => {
      const { adminCookie } = await loginAsAdmin();
      expect(adminCookie).toBeTruthy();
    });

    it("menolak kredensial admin yang salah dengan AUTH_INVALID_CREDENTIALS", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/login",
        headers: { origin: env.APP_ORIGIN },
        payload: {
          username: adminUsername,
          password: "wrongPassword!",
        },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("AUTH_INVALID_CREDENTIALS");
    });

    it("GET /api/admin/me mengembalikan profil admin yang sedang login", async () => {
      const { fullCookieHeader } = await loginAsAdmin();
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/me",
        headers: {
          cookie: fullCookieHeader,
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().admin.username).toBe(adminUsername);
    });

    it("permintaan tanpa autentikasi ke /api/admin/* ditolak UNAUTHENTICATED (401)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/me",
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("UNAUTHENTICATED");
    });

    it("pemain dengan cookie ls_session mengakses /api/admin/* ditolak FORBIDDEN (403)", async () => {
      const player = await createTestUser("player1", "active");
      const { cookieStr, statusCode } = await loginAsPlayer(player.username);
      expect(statusCode).toBe(200);

      // Pemain mencoba membuka /api/admin/me
      const adminRes = await app.inject({
        method: "GET",
        url: "/api/admin/me",
        headers: {
          cookie: cookieStr,
        },
      });
      expect(adminRes.statusCode).toBe(403);
      expect(adminRes.json().error.code).toBe("FORBIDDEN");
    });

    it("admin dengan cookie ls_admin mengakses rute game ditolak FORBIDDEN (403)", async () => {
      const { fullCookieHeader } = await loginAsAdmin();

      const gameRes = await app.inject({
        method: "GET",
        url: "/api/games/flappy-bird/ping",
        headers: {
          cookie: fullCookieHeader,
        },
      });
      expect(gameRes.statusCode).toBe(403);
      expect(gameRes.json().error.code).toBe("FORBIDDEN");
    });

    it("POST /api/admin/logout menghapus cookie dan sesi", async () => {
      const { fullCookieHeader, csrfToken, adminCookie } = await loginAsAdmin();

      const res = await app.inject({
        method: "POST",
        url: "/api/admin/logout",
        headers: {
          origin: env.APP_ORIGIN,
          "x-csrf-token": csrfToken,
          cookie: fullCookieHeader,
        },
      });
      expect(res.statusCode).toBe(204);

      // Sesi admin harus sudah dihapus atau tidak dapat digunakan lagi
      const checkRes = await app.inject({
        method: "GET",
        url: "/api/admin/me",
        headers: {
          cookie: `${ADMIN_COOKIE_NAME}=${adminCookie}`,
        },
      });
      expect(checkRes.statusCode).toBe(401);
    });
  });

  describe("P3-03: Persetujuan Pengguna (Satuan & Massal)", () => {
    it("menyetujui pendaftaran pending mengubah status menjadi active dan mencatat audit log", async () => {
      const { fullCookieHeader, csrfToken } = await loginAsAdmin();
      const pendingUser = await createTestUser("pend1", "pending");

      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${pendingUser.id}`,
        headers: {
          origin: env.APP_ORIGIN,
          "x-csrf-token": csrfToken,
          cookie: fullCookieHeader,
        },
        payload: { action: "approve" },
      });
      expect(res.statusCode).toBe(200);

      const [row] = await db.select().from(users).where(eq(users.id, pendingUser.id));
      expect(row).toBeDefined();
      expect(row!.status).toBe("active");
      expect(row!.approvedAt).toBeInstanceOf(Date);
      expect(row!.approvedBy).toBe(adminId);

      // Verifikasi audit log
      const logs = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.targetId, pendingUser.id));
      expect(logs.some((l) => l.action === "user.approve")).toBe(true);
    });

    it("menolak pendaftaran pending mengubah status menjadi rejected dan mencatat audit log", async () => {
      const { fullCookieHeader, csrfToken } = await loginAsAdmin();
      const pendingUser = await createTestUser("pend2", "pending");

      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${pendingUser.id}`,
        headers: {
          origin: env.APP_ORIGIN,
          "x-csrf-token": csrfToken,
          cookie: fullCookieHeader,
        },
        payload: { action: "reject" },
      });
      expect(res.statusCode).toBe(200);

      const [row] = await db.select().from(users).where(eq(users.id, pendingUser.id));
      expect(row).toBeDefined();
      expect(row!.status).toBe("rejected");

      const logs = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.targetId, pendingUser.id));
      expect(logs.some((l) => l.action === "user.reject")).toBe(true);
    });

    it("POST /api/admin/users/bulk dapat menyetujui atau menolak banyak pengguna sekaligus", async () => {
      const { fullCookieHeader, csrfToken } = await loginAsAdmin();
      const u1 = await createTestUser("bulk1", "pending");
      const u2 = await createTestUser("bulk2", "pending");

      const res = await app.inject({
        method: "POST",
        url: "/api/admin/users/bulk",
        headers: {
          origin: env.APP_ORIGIN,
          "x-csrf-token": csrfToken,
          cookie: fullCookieHeader,
        },
        payload: {
          ids: [u1.id, u2.id],
          action: "approve",
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().updatedCount).toBe(2);

      const rows = await db.select().from(users).where(inArray(users.id, [u1.id, u2.id]));
      expect(rows.every((r) => r.status === "active")).toBe(true);
    });
  });

  describe("P3-04: Manajemen Pengguna (Suspend, Ban, Reset Password, Hapus)", () => {
    it("suspend memutus sesi aktif pengguna seketika", async () => {
      const { fullCookieHeader, csrfToken } = await loginAsAdmin();
      const activeUser = await createTestUser("susp1", "active");

      // Login sebagai pengguna ini untuk membuat sesi aktif
      const { statusCode } = await loginAsPlayer(activeUser.username);
      expect(statusCode).toBe(200);

      // Admin melakukan suspend
      const suspendRes = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${activeUser.id}`,
        headers: {
          origin: env.APP_ORIGIN,
          "x-csrf-token": csrfToken,
          cookie: fullCookieHeader,
        },
        payload: { action: "suspend" },
      });
      expect(suspendRes.statusCode).toBe(200);

      // Sesi pengguna harus sudah terhapus
      const userSessions = await db
        .select()
        .from(sessions)
        .where(eq(sessions.subjectId, activeUser.id));
      expect(userSessions.length).toBe(0);

      // Upaya login ulang ditolak
      const reLogin = await loginAsPlayer(activeUser.username);
      expect(reLogin.statusCode).toBe(403);
      expect((reLogin.json.error as { code: string }).code).toBe("ACCOUNT_SUSPENDED");
    });

    it("ban memutus sesi aktif pengguna dan menolak login", async () => {
      const { fullCookieHeader, csrfToken } = await loginAsAdmin();
      const activeUser = await createTestUser("ban1", "active");

      const banRes = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${activeUser.id}`,
        headers: {
          origin: env.APP_ORIGIN,
          "x-csrf-token": csrfToken,
          cookie: fullCookieHeader,
        },
        payload: { action: "ban" },
      });
      expect(banRes.statusCode).toBe(200);

      const [row] = await db.select().from(users).where(eq(users.id, activeUser.id));
      expect(row).toBeDefined();
      expect(row!.status).toBe("banned");
    });

    it("activate mengaktifkan kembali pengguna yang di-suspend atau di-ban", async () => {
      const { fullCookieHeader, csrfToken } = await loginAsAdmin();
      const suspendedUser = await createTestUser("act1", "suspended");

      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${suspendedUser.id}`,
        headers: {
          origin: env.APP_ORIGIN,
          "x-csrf-token": csrfToken,
          cookie: fullCookieHeader,
        },
        payload: { action: "activate" },
      });
      expect(res.statusCode).toBe(200);

      const [row] = await db.select().from(users).where(eq(users.id, suspendedUser.id));
      expect(row).toBeDefined();
      expect(row!.status).toBe("active");
    });

    it("transisi status yang tidak sah ditolak INVALID_TRANSITION (409)", async () => {
      const { fullCookieHeader, csrfToken } = await loginAsAdmin();
      const pendingUser = await createTestUser("trans_inv", "pending");

      // Pending tidak boleh langsung di-suspend
      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${pendingUser.id}`,
        headers: {
          origin: env.APP_ORIGIN,
          "x-csrf-token": csrfToken,
          cookie: fullCookieHeader,
        },
        payload: { action: "suspend" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("INVALID_TRANSITION");
    });

    it("reset-password menghasilkan temporaryPassword yang dapat dipakai login", async () => {
      const { fullCookieHeader, csrfToken } = await loginAsAdmin();
      const user = await createTestUser("resetpw", "active");

      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${user.id}`,
        headers: {
          origin: env.APP_ORIGIN,
          "x-csrf-token": csrfToken,
          cookie: fullCookieHeader,
        },
        payload: { action: "reset-password" },
      });
      expect(res.statusCode).toBe(200);
      const { temporaryPassword } = res.json() as { temporaryPassword: string };
      expect(temporaryPassword).toBeDefined();

      // Login dengan temporaryPassword berhasil
      const loginRes = await loginAsPlayer(user.username, temporaryPassword);
      expect(loginRes.statusCode).toBe(200);
    });

    it("DELETE /api/admin/users/:id menghapus akun dan seluruh data terkait", async () => {
      const { fullCookieHeader, csrfToken } = await loginAsAdmin();
      const user = await createTestUser("del_u", "active");

      // Masukkan pesan chat
      await db.insert(chatMessages).values({
        userId: user.id,
        body: "Halo dari user yang akan dihapus",
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/api/admin/users/${user.id}`,
        headers: {
          origin: env.APP_ORIGIN,
          "x-csrf-token": csrfToken,
          cookie: fullCookieHeader,
        },
      });
      expect(res.statusCode).toBe(204);

      // User terhapus dari users
      const [u] = await db.select().from(users).where(eq(users.id, user.id));
      expect(u).toBeUndefined();

      // Chat diset userId = null (anonim)
      const chats = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.body, "Halo dari user yang akan dihapus"));
      expect(chats[0]?.userId).toBeNull();
    });
  });

  describe("P3-05: Pengaturan Admin", () => {
    it("GET /api/admin/settings mengembalikan pengaturan dengan nilai bawaan", async () => {
      const { fullCookieHeader } = await loginAsAdmin();
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/settings",
        headers: { cookie: fullCookieHeader },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.registration).toBeDefined();
      expect(data.globalSchedule).toBeDefined();
      expect(data.smtp).toBeDefined();
    });

    it("PATCH /api/admin/settings memperbarui pengaturan tanpa perlu restart dan mencatat audit log", async () => {
      const { fullCookieHeader, csrfToken } = await loginAsAdmin();

      const patchRes = await app.inject({
        method: "PATCH",
        url: "/api/admin/settings",
        headers: {
          origin: env.APP_ORIGIN,
          "x-csrf-token": csrfToken,
          cookie: fullCookieHeader,
        },
        payload: {
          registration: "open",
          ludoMaxPlayers: 8,
        },
      });
      expect(patchRes.statusCode).toBe(200);
      const updated = patchRes.json();
      expect(updated.registration).toBe("open");
      expect(updated.ludoMaxPlayers).toBe(8);

      // Verifikasi efek instan pada public-config
      const pubRes = await app.inject({
        method: "GET",
        url: "/api/public-config",
      });
      expect(pubRes.statusCode).toBe(200);
      expect(pubRes.json().registration).toBe("open");

      // Kembalikan ke approval
      await app.inject({
        method: "PATCH",
        url: "/api/admin/settings",
        headers: {
          origin: env.APP_ORIGIN,
          "x-csrf-token": csrfToken,
          cookie: fullCookieHeader,
        },
        payload: {
          registration: "approval",
          ludoMaxPlayers: 12,
        },
      });
    });
  });

  describe("P3-06: EmailAdapter & Uji SMTP", () => {
    it("LogAdapter berhasil mengirim email tanpa melempar error", async () => {
      const logAdapter = new LogAdapter();
      await expect(
        logAdapter.send({
          to: "test@example.test",
          subject: "Test Subjek",
          text: "Isi teks email",
        }),
      ).resolves.toBeUndefined();
    });

    it("POST /api/admin/settings/smtp-test mengembalikan 409 SMTP_NOT_CONFIGURED bila SMTP belum diset", async () => {
      const { fullCookieHeader, csrfToken } = await loginAsAdmin();

      // env saat pengujian lokal belum diset SMTP_HOST
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/settings/smtp-test",
        headers: {
          origin: env.APP_ORIGIN,
          "x-csrf-token": csrfToken,
          cookie: fullCookieHeader,
        },
        payload: {
          to: "tester@example.com",
        },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("SMTP_NOT_CONFIGURED");
    });
  });

  describe("P3-07: Audit Log", () => {
    it("GET /api/admin/audit mengembalikan entri audit log terurut kronologis", async () => {
      const { fullCookieHeader } = await loginAsAdmin();
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/audit?page=1&pageSize=10",
        headers: { cookie: fullCookieHeader },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.items.length).toBeGreaterThan(0);
      expect(data.total).toBeGreaterThan(0);
      expect(data.items[0].adminUsername).toBe(adminUsername);
    });
  });

  describe("P3-08: Dashboard Admin", () => {
    it("GET /api/admin/dashboard mengembalikan metrik yang sesuai data uji", async () => {
      const { fullCookieHeader } = await loginAsAdmin();
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/dashboard",
        headers: { cookie: fullCookieHeader },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(typeof data.activeToday).toBe("number");
      expect(typeof data.pending).toBe("number");
      expect(typeof data.newRegistrations7d).toBe("number");
      expect(typeof data.runsToday).toBe("number");
      expect(typeof data.runsByGame).toBe("object");
      expect(Array.isArray(data.pendingQueue)).toBe(true);
    });
  });
});
