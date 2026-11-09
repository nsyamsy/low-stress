import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, users, sessions, settings, loginAttempts, type Database } from "@low-stress/db";
import { eq, inArray, like } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { readEnv } from "../src/env";
import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  generateToken,
  hashToken,
  purgeExpiredSessions,
} from "../src/auth/session";
import {
  generateCaptchaChallenge,
  solveCaptchaChallenge,
  verifyCaptchaSolution,
} from "../src/auth/captcha";
import {
  LOCKOUT_DURATION_MS,
  STALE_ATTEMPT_TTL_MS,
  WINDOW_MS,
  checkLockout,
  clearLockout,
  makeLockoutKey,
  purgeStaleLoginAttempts,
  recordFailedAttempt,
} from "../src/auth/lockout";
import { createJobRunner } from "../src/jobs";
import { createHmac } from "node:crypto";

const env = readEnv();

describe("Auth and Profile API (Phase 2)", () => {
  let app: FastifyInstance;
  let dbHandle: ReturnType<typeof createDb>;
  let db: Database;

  // Prefix unik pendek untuk membersihkan baris data uji saja tanpa mengganggu data lain
  const TEST_PREFIX = `t${(Date.now() % 1000000).toString(36)}_`;
  const createdUsernames: string[] = [];
  const createdEmails: string[] = [];

  const helperUsername = (name: string) => `${TEST_PREFIX}${name}`.slice(0, 20);
  const helperEmail = (name: string) => `${TEST_PREFIX}${name}@example.test`;

  beforeAll(async () => {
    dbHandle = createDb(env.DATABASE_URL, { max: 2 });
    db = dbHandle.db;

    app = await buildApp({
      env,
      db,
      logger: false,
    });
  });

  afterAll(async () => {
    // Bersihkan HANYA baris-baris data yang dibuat oleh rangkaian tes ini
    try {
      if (createdUsernames.length > 0) {
        // Hapus sesi terkait
        const userRows = await db
          .select({ id: users.id })
          .from(users)
          .where(inArray(users.username, createdUsernames));

        const userIds = userRows.map((u) => u.id);
        if (userIds.length > 0) {
          await db.delete(sessions).where(inArray(sessions.subjectId, userIds));
        }

        await db.delete(users).where(inArray(users.username, createdUsernames));
      }
      // Bersihkan login_attempts yang dimulai dengan TEST_PREFIX
      await db.delete(loginAttempts).where(like(loginAttempts.key, `${TEST_PREFIX}%`));
    } catch {
      // Abaikan error saat cleanup
    } finally {
      await app.close();
      await dbHandle.close();
    }
  });

  async function getCsrfTokenAndCookie(): Promise<{ token: string; cookie: string }> {
    const res = await app.inject({ method: "GET", url: "/api/csrf" });
    const json = res.json() as { token: string };
    const cookies = res.cookies;
    const csrfCookie = cookies.find((c) => c.name === CSRF_COOKIE_NAME);
    return {
      token: json.token,
      cookie: `${CSRF_COOKIE_NAME}=${csrfCookie?.value ?? json.token}`,
    };
  }

  // --- P2-01: Register ---
  describe("P2-01: Register", () => {
    it("menerima pendaftaran sah dan menghasilkan status pending di mode lan", async () => {
      const { token, cookie } = await getCsrfTokenAndCookie();
      const username = helperUsername("reg1");
      const email = helperEmail("reg1");
      createdUsernames.push(username);
      createdEmails.push(email);

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: {
          "x-csrf-token": token,
          cookie,
          origin: env.APP_ORIGIN,
        },
        payload: {
          username,
          displayName: "Damar Tester",
          email,
          password: "password123!",
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ status: "pending" });
    });

    it("menolak duplikasi username dengan USERNAME_TAKEN (409)", async () => {
      const { token, cookie } = await getCsrfTokenAndCookie();
      const username = helperUsername("dupuser");
      const email1 = helperEmail("dup1");
      const email2 = helperEmail("dup2");
      createdUsernames.push(username);
      createdEmails.push(email1, email2);

      // Register pertama
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: {
          username,
          displayName: "Damar Satu",
          email: email1,
          password: "password123!",
        },
      });

      // Register kedua dengan username sama
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: {
          username,
          displayName: "Damar Dua",
          email: email2,
          password: "password123!",
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: { code: "USERNAME_TAKEN" } });
    });

    it("menolak duplikasi email dengan EMAIL_TAKEN (409)", async () => {
      const { token, cookie } = await getCsrfTokenAndCookie();
      const username1 = helperUsername("emailu1");
      const username2 = helperUsername("emailu2");
      const email = helperEmail("dupemail");
      createdUsernames.push(username1, username2);
      createdEmails.push(email);

      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: {
          username: username1,
          displayName: "User Satu",
          email,
          password: "password123!",
        },
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: {
          username: username2,
          displayName: "User Dua",
          email,
          password: "password123!",
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: { code: "EMAIL_TAKEN" } });
    });

    it("menolak password yang sama dengan username atau < 8 karakter", async () => {
      const { token, cookie } = await getCsrfTokenAndCookie();
      const username = helperUsername("pwtest");

      // Password sama dengan username
      const resSame = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: {
          username,
          displayName: "Test Name",
          email: helperEmail("pw1"),
          password: username,
        },
      });
      expect(resSame.statusCode).toBe(400);
      expect(resSame.json()).toMatchObject({
        error: { code: "VALIDATION_FAILED" },
      });

      // Password terlalu pendek (< 8)
      const resShort = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: {
          username,
          displayName: "Test Name",
          email: helperEmail("pw2"),
          password: "short",
        },
      });
      expect(resShort.statusCode).toBe(400);
      expect(resShort.json()).toMatchObject({
        error: { code: "VALIDATION_FAILED" },
      });
    });

    it("menolak pendaftaran saat mode registration_mode disetel closed", async () => {
      const { token, cookie } = await getCsrfTokenAndCookie();
      const username = helperUsername("closed_u");
      createdUsernames.push(username);

      // Set sementara registration_mode = closed
      await db
        .insert(settings)
        .values({ key: "registration_mode", value: "closed" })
        .onConflictDoUpdate({ target: settings.key, set: { value: "closed" } });

      try {
        const res = await app.inject({
          method: "POST",
          url: "/api/auth/register",
          headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
          payload: {
            username,
            displayName: "Closed Test",
            email: helperEmail("closed"),
            password: "password123!",
          },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json()).toMatchObject({
          error: { code: "REGISTRATION_CLOSED" },
        });
      } finally {
        await db.delete(settings).where(eq(settings.key, "registration_mode"));
      }
    });
  });

  // --- P2-02: Login, Logout, Lockout ---
  describe("P2-02: Login, Logout, Lockout", () => {
    it("login membuat sesi untuk akun pending dan mengembalikan user Me", async () => {
      const { token, cookie } = await getCsrfTokenAndCookie();
      const username = helperUsername("log_p");
      const email = helperEmail("log_p");
      createdUsernames.push(username);

      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: {
          username,
          displayName: "Pending User",
          email,
          password: "password123!",
        },
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: {
          username,
          password: "password123!",
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json() as { user: { username: string; status: string } };
      expect(data.user.username).toBe(username);
      expect(data.user.status).toBe("pending");

      const sessionCookie = res.cookies.find((c) => c.name === SESSION_COOKIE_NAME);
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie?.httpOnly).toBe(true);
    });

    it("mengunci akun setelah 5 kali gagal berturut-turut (AUTH_LOCKED 429)", async () => {
      const { token, cookie } = await getCsrfTokenAndCookie();
      const username = helperUsername("lockme");
      const email = helperEmail("lockme");
      createdUsernames.push(username);

      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: {
          username,
          displayName: "Lockout User",
          email,
          password: "correct_password123!",
        },
      });

      // 4 kali salah password -> 401 AUTH_INVALID_CREDENTIALS
      for (let i = 0; i < 4; i += 1) {
        const res = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
          payload: { username, password: "wrong_password!" },
        });
        expect(res.statusCode).toBe(401);
      }

      // Kali ke-5 -> mengunci akun
      const res5 = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: { username, password: "wrong_password!" },
      });
      expect(res5.statusCode).toBe(401);

      // Percobaan berikutnya -> 429 AUTH_LOCKED
      const resLocked = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: { username, password: "correct_password123!" },
      });
      expect(resLocked.statusCode).toBe(429);
      expect(resLocked.json()).toMatchObject({
        error: { code: "AUTH_LOCKED" },
      });
    });

    it("memutus sesi aktif saat akun di-ban", async () => {
      const { token, cookie } = await getCsrfTokenAndCookie();
      const username = helperUsername("ban_u");
      const email = helperEmail("ban_u");
      createdUsernames.push(username);

      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: {
          username,
          displayName: "Banned User",
          email,
          password: "password123!",
        },
      });

      // Set user menjadi active dulu agar bisa bermain
      await db
        .update(users)
        .set({ status: "active" })
        .where(eq(users.username, username));

      // Login dan dapatkan sesi
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: { username, password: "password123!" },
      });
      const sessionCookie = loginRes.cookies.find(
        (c) => c.name === SESSION_COOKIE_NAME,
      );

      // Cek sesi valid via /api/me
      const meResBefore = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionCookie?.value}` },
      });
      expect(meResBefore.statusCode).toBe(200);

      // Admin melakukan ban pada pengguna di DB
      await db
        .update(users)
        .set({ status: "banned" })
        .where(eq(users.username, username));

      // Akses berikutnya dengan sesi lama ditolak dengan ACCOUNT_BANNED
      const meResAfter = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionCookie?.value}` },
      });
      expect(meResAfter.statusCode).toBe(403);
      expect(meResAfter.json()).toMatchObject({
        error: { code: "ACCOUNT_BANNED" },
      });

      // Percobaan login ulang juga ditolak
      const loginAgain = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: { username, password: "password123!" },
      });
      expect(loginAgain.statusCode).toBe(403);
      expect(loginAgain.json()).toMatchObject({
        error: { code: "ACCOUNT_BANNED" },
      });
    });

    it("logout menghapus sesi di database dan membersihkan cookie", async () => {
      const { token, cookie } = await getCsrfTokenAndCookie();
      const username = helperUsername("logout_u");
      createdUsernames.push(username);

      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: {
          username,
          displayName: "Logout User",
          email: helperEmail("logout"),
          password: "password123!",
        },
      });

      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: { username, password: "password123!" },
      });
      const sessionVal = loginRes.cookies.find(
        (c) => c.name === SESSION_COOKIE_NAME,
      )?.value;

      const logoutRes = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: {
          "x-csrf-token": token,
          cookie: `${cookie}; ${SESSION_COOKIE_NAME}=${sessionVal}`,
          origin: env.APP_ORIGIN,
        },
      });
      expect(logoutRes.statusCode).toBe(204);

      // Akses /api/me setelah logout harus UNAUTHENTICATED
      const meRes = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionVal}` },
      });
      expect(meRes.statusCode).toBe(401);
    });
  });

  // --- P2-03: CSRF dan Header Keamanan ---
  describe("P2-03: CSRF dan Header Keamanan", () => {
    it("menolak request mutasi tanpa token CSRF dengan CSRF_INVALID (403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          username: "random_usr",
          displayName: "Random",
          email: "random@test.local",
          password: "password123!",
        },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: { code: "CSRF_INVALID" } });
    });

    it("menerapkan header keamanan CSP dan proteksi konten", async () => {
      const res = await app.inject({ method: "GET", url: "/healthz" });
      expect(res.headers["content-security-policy"]).toBeDefined();
      expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("DENY");
    });
  });

  // --- P2-04: Alur E2E Auth (Register -> Pending -> Persetujuan Admin -> Login) ---
  describe("P2-04: Alur E2E Auth (Register -> Pending -> Persetujuan Admin -> Login)", () => {
    it("menjalankan alur lengkap: register -> pending -> admin approval stub -> login active", async () => {
      const { token, cookie } = await getCsrfTokenAndCookie();
      const username = helperUsername("e2e_flow");
      const email = helperEmail("e2e_flow");
      createdUsernames.push(username);

      // Langkah 1: Register pemain baru
      const regRes = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: {
          username,
          displayName: "E2E Tester",
          email,
          password: "FlowPassword123!",
        },
      });
      expect(regRes.statusCode).toBe(201);
      expect(regRes.json()).toEqual({ status: "pending" });

      // Langkah 2: Login saat status masih pending
      const pendingLogin = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: {
          username,
          password: "FlowPassword123!",
        },
      });
      expect(pendingLogin.statusCode).toBe(200);
      const pendingUser = (pendingLogin.json() as { user: { status: string } }).user;
      expect(pendingUser.status).toBe("pending");
      const pendingSessionVal = pendingLogin.cookies.find(
        (c) => c.name === SESSION_COOKIE_NAME,
      )?.value;

      // Status pending dapat melihat /api/me untuk tahu statusnya
      const mePendingRes = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${pendingSessionVal}` },
      });
      expect(mePendingRes.statusCode).toBe(200);
      expect((mePendingRes.json() as { status: string }).status).toBe("pending");

      // Tetapi akun pending ditolak untuk operasi aktif seperti PATCH /api/me (ACCOUNT_PENDING)
      const patchForbiddenRes = await app.inject({
        method: "PATCH",
        url: "/api/me",
        headers: {
          "x-csrf-token": token,
          cookie: `${cookie}; ${SESSION_COOKIE_NAME}=${pendingSessionVal}`,
          origin: env.APP_ORIGIN,
        },
        payload: { displayName: "Should Fail" },
      });
      expect(patchForbiddenRes.statusCode).toBe(403);
      expect(patchForbiddenRes.json()).toMatchObject({
        error: { code: "ACCOUNT_PENDING" },
      });

      // Langkah 3: Stub persetujuan admin (update DB status -> active)
      await db
        .update(users)
        .set({ status: "active" })
        .where(eq(users.username, username));

      // Langkah 4: Pengguna yang sudah aktif kini dapat mengakses /api/me sebagai active
      const meActiveRes = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${pendingSessionVal}` },
      });
      expect(meActiveRes.statusCode).toBe(200);
      expect((meActiveRes.json() as { status: string }).status).toBe("active");

      // Dan operasi mutasi profil kini diizinkan
      const patchSuccessRes = await app.inject({
        method: "PATCH",
        url: "/api/me",
        headers: {
          "x-csrf-token": token,
          cookie: `${cookie}; ${SESSION_COOKIE_NAME}=${pendingSessionVal}`,
          origin: env.APP_ORIGIN,
        },
        payload: { displayName: "Approved Tester" },
      });
      expect(patchSuccessRes.statusCode).toBe(200);
      expect((patchSuccessRes.json() as { displayName: string }).displayName).toBe("Approved Tester");
    });
  });

  // --- P2-05: Profil /api/me ---
  describe("P2-05: Profil /api/me", () => {
    it("mengambil data profil dan menyensor displayName secara otomatis", async () => {
      const { token, cookie } = await getCsrfTokenAndCookie();
      const username = helperUsername("prof_u");
      createdUsernames.push(username);

      // Daftar dengan displayName yang mengandung kata kasar bawaan (anjing)
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: {
          username,
          displayName: "anjing Damar",
          email: helperEmail("prof"),
          password: "password123!",
        },
      });

      // Login
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: { username, password: "password123!" },
      });
      const sessionVal = loginRes.cookies.find(
        (c) => c.name === SESSION_COOKIE_NAME,
      )?.value;

      // Ambil /api/me
      const meRes = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionVal}` },
      });
      expect(meRes.statusCode).toBe(200);
      const me = meRes.json() as { displayName: string };
      // Harus disensor menjadi ****** Damar
      expect(me.displayName).toContain("******");
      expect(me.displayName).not.toContain("anjing");
    });

    it("memperbarui bahasa dan tema (PATCH /api/me)", async () => {
      const { token, cookie } = await getCsrfTokenAndCookie();
      const username = helperUsername("patch_u");
      createdUsernames.push(username);

      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: {
          username,
          displayName: "Patch User",
          email: helperEmail("patch"),
          password: "password123!",
        },
      });

      // Aktifkan user agar bisa PATCH /api/me
      await db
        .update(users)
        .set({ status: "active" })
        .where(eq(users.username, username));

      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: { username, password: "password123!" },
      });
      const sessionVal = loginRes.cookies.find(
        (c) => c.name === SESSION_COOKIE_NAME,
      )?.value;

      const patchRes = await app.inject({
        method: "PATCH",
        url: "/api/me",
        headers: {
          "x-csrf-token": token,
          cookie: `${cookie}; ${SESSION_COOKIE_NAME}=${sessionVal}`,
          origin: env.APP_ORIGIN,
        },
        payload: {
          locale: "en",
          theme: "dark",
          displayName: "Damar Updated",
        },
      });

      expect(patchRes.statusCode).toBe(200);
      const updated = patchRes.json() as {
        locale: string;
        theme: string;
        displayName: string;
      };
      expect(updated.locale).toBe("en");
      expect(updated.theme).toBe("dark");
      expect(updated.displayName).toBe("Damar Updated");
    });

    it("mengganti password dan menguji login dengan password baru", async () => {
      const { token, cookie } = await getCsrfTokenAndCookie();
      const username = helperUsername("pwchg_u");
      createdUsernames.push(username);

      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: {
          username,
          displayName: "Change Pw User",
          email: helperEmail("pwchg"),
          password: "oldPassword123!",
        },
      });

      await db
        .update(users)
        .set({ status: "active" })
        .where(eq(users.username, username));

      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: { username, password: "oldPassword123!" },
      });
      const sessionVal = loginRes.cookies.find(
        (c) => c.name === SESSION_COOKIE_NAME,
      )?.value;

      // Ganti password
      const changeRes = await app.inject({
        method: "POST",
        url: "/api/me/password",
        headers: {
          "x-csrf-token": token,
          cookie: `${cookie}; ${SESSION_COOKIE_NAME}=${sessionVal}`,
          origin: env.APP_ORIGIN,
        },
        payload: {
          currentPassword: "oldPassword123!",
          newPassword: "newAwesomePassword456!",
        },
      });
      expect(changeRes.statusCode).toBe(204);

      // Login dengan password lama harus gagal
      const failLogin = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: { username, password: "oldPassword123!" },
      });
      expect(failLogin.statusCode).toBe(401);

      // Login dengan password baru harus berhasil
      const successLogin = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: { username, password: "newAwesomePassword456!" },
      });
      expect(successLogin.statusCode).toBe(200);
    });
  });

  // --- P2-06: Hapus Akun Sendiri ---
  describe("P2-06: Hapus Akun Sendiri", () => {
    it("menghapus akun dengan password konfirmasi yang benar", async () => {
      const { token, cookie } = await getCsrfTokenAndCookie();
      const username = helperUsername("del_u");
      createdUsernames.push(username);

      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: {
          username,
          displayName: "Deleted User",
          email: helperEmail("del"),
          password: "deleteSecret123!",
        },
      });

      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: { username, password: "deleteSecret123!" },
      });
      const sessionVal = loginRes.cookies.find(
        (c) => c.name === SESSION_COOKIE_NAME,
      )?.value;

      // Password konfirmasi salah -> 401
      const failDel = await app.inject({
        method: "DELETE",
        url: "/api/me",
        headers: {
          "x-csrf-token": token,
          cookie: `${cookie}; ${SESSION_COOKIE_NAME}=${sessionVal}`,
          origin: env.APP_ORIGIN,
        },
        payload: { password: "wrongPassword!" },
      });
      expect(failDel.statusCode).toBe(401);

      // Password konfirmasi benar -> 204
      const successDel = await app.inject({
        method: "DELETE",
        url: "/api/me",
        headers: {
          "x-csrf-token": token,
          cookie: `${cookie}; ${SESSION_COOKIE_NAME}=${sessionVal}`,
          origin: env.APP_ORIGIN,
        },
        payload: { password: "deleteSecret123!" },
      });
      expect(successDel.statusCode).toBe(204);

      // Cek baris user sudah hilang dari database
      const [checkUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username));
      expect(checkUser).toBeUndefined();
    });
  });

  // --- P2-07: CAPTCHA Proof-of-Work & Public Config ---
  describe("P2-07: CAPTCHA Proof-of-Work & Public Config", () => {
    it("GET /api/public-config mengembalikan konfigurasi publik", async () => {
      const res = await app.inject({ method: "GET", url: "/api/public-config" });
      expect(res.statusCode).toBe(200);
      const config = res.json() as {
        registration: string;
        captcha: boolean;
        deployMode: string;
      };
      expect(["approval", "open", "closed"]).toContain(config.registration);
      expect(typeof config.captcha).toBe("boolean");
      expect(config.deployMode).toBe(env.DEPLOY_MODE);
    });

    it("memvalidasi challenge dan solusi CAPTCHA proof-of-work", async () => {
      const challengeRes = await app.inject({
        method: "GET",
        url: "/api/auth/captcha-challenge",
      });
      expect(challengeRes.statusCode).toBe(200);
      const data = challengeRes.json() as {
        challenge: string;
        difficulty: number;
        signature: string;
      };

      // Selesaikan PoW challenge
      const nonce = solveCaptchaChallenge(data.challenge, data.difficulty);
      expect(nonce).toBeDefined();

      // Aktifkan sementara captcha_enabled di settings
      await db
        .insert(settings)
        .values({ key: "captcha_enabled", value: true })
        .onConflictDoUpdate({ target: settings.key, set: { value: true } });

      const { token, cookie } = await getCsrfTokenAndCookie();
      const username = helperUsername("pow_u");
      createdUsernames.push(username);

      try {
        // Register tanpa captcha -> gagal CAPTCHA_FAILED (400)
        const failRes = await app.inject({
          method: "POST",
          url: "/api/auth/register",
          headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
          payload: {
            username,
            displayName: "PoW User",
            email: helperEmail("pow"),
            password: "password123!",
          },
        });
        expect(failRes.statusCode).toBe(400);
        expect(failRes.json()).toMatchObject({
          error: { code: "CAPTCHA_FAILED" },
        });

        // Register dengan solusi captcha valid -> sukses (201)
        const successRes = await app.inject({
          method: "POST",
          url: "/api/auth/register",
          headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
          payload: {
            username,
            displayName: "PoW User",
            email: helperEmail("pow"),
            password: "password123!",
            captcha: {
              challenge: data.challenge,
              nonce,
              signature: data.signature,
            },
          },
        });
        expect(successRes.statusCode).toBe(201);
      } finally {
        await db.delete(settings).where(eq(settings.key, "captcha_enabled"));
      }
    });

    it("T-01: menolak challenge palsu (difficulty: 0 atau signature hilang/tidak valid) dan menolak replay solusi yang sama", () => {
      const secret = env.SESSION_SECRET;

      // 1. Challenge dengan difficulty: 0 (meskipun ditandatangani dengan HMAC valid) harus ditolak
      const expiresAt = Date.now() + 60_000;
      const forgedZeroDiffChallenge = `deadbeefdeadbeefdeadbeefdeadbeef:${expiresAt}:0`;
      const forgedZeroDiffSig = createHmac("sha256", secret)
        .update(forgedZeroDiffChallenge)
        .digest("hex");
      expect(
        verifyCaptchaSolution(
          {
            challenge: forgedZeroDiffChallenge,
            nonce: "0",
            signature: forgedZeroDiffSig,
          },
          secret,
        ),
      ).toBe(false);

      // 2. Challenge valid tetapi signature kosong atau tidak valid harus ditolak
      const validChallenge = generateCaptchaChallenge(secret, 2);
      const validNonce = solveCaptchaChallenge(
        validChallenge.challenge,
        validChallenge.difficulty,
      );

      expect(
        verifyCaptchaSolution(
          {
            challenge: validChallenge.challenge,
            nonce: validNonce,
            signature: undefined,
          },
          secret,
        ),
      ).toBe(false);

      expect(
        verifyCaptchaSolution(
          {
            challenge: validChallenge.challenge,
            nonce: validNonce,
            signature: "0".repeat(64),
          },
          secret,
        ),
      ).toBe(false);

      // 3. Verifikasi pertama dengan solusi sah berhasil (true), replay kedua ditolak (false)
      expect(
        verifyCaptchaSolution(
          {
            challenge: validChallenge.challenge,
            nonce: validNonce,
            signature: validChallenge.signature,
          },
          secret,
        ),
      ).toBe(true);

      expect(
        verifyCaptchaSolution(
          {
            challenge: validChallenge.challenge,
            nonce: validNonce,
            signature: validChallenge.signature,
          },
          secret,
        ),
      ).toBe(false);
    });
  });

  // --- D-02a & D-02b: /api/csrf Reuse Lintas Tab ---
  describe("D-02a & D-02b: /api/csrf reuse across tabs", () => {
    it("mengembalikan token yang sama saat dipanggil ulang dengan cookie ls_csrf valid dan mengganti cookie rusak", async () => {
      const res1 = await app.inject({ method: "GET", url: "/api/csrf" });
      expect(res1.statusCode).toBe(200);
      const token1 = (res1.json() as { token: string }).token;
      const cookie1 = res1.cookies.find((c) => c.name === CSRF_COOKIE_NAME);
      expect(cookie1?.value).toBe(token1);

      // Panggilan kedua dengan cookie ls_csrf dari panggilan pertama
      const res2 = await app.inject({
        method: "GET",
        url: "/api/csrf",
        headers: { cookie: `${CSRF_COOKIE_NAME}=${cookie1!.value}` },
      });
      expect(res2.statusCode).toBe(200);
      const token2 = (res2.json() as { token: string }).token;
      expect(token2).toBe(token1);

      // Panggilan dengan cookie rusak/malformed harus membuat token baru yang sah
      const resMalformed = await app.inject({
        method: "GET",
        url: "/api/csrf",
        headers: { cookie: `${CSRF_COOKIE_NAME}=malformed!short` },
      });
      expect(resMalformed.statusCode).toBe(200);
      const tokenReplacement = (resMalformed.json() as { token: string }).token;
      expect(tokenReplacement).not.toBe("malformed!short");
      expect(tokenReplacement).toMatch(/^[A-Za-z0-9_-]{32,64}$/);
    });

    it("login dari tab A tetap sah setelah tab B memanggil GET /api/csrf dengan cookie yang sama", async () => {
      // Tab A mengambil CSRF token
      const tabACsrf = await getCsrfTokenAndCookie();

      const username = helperUsername("csrf_tab");
      const email = helperEmail("csrf_tab");
      createdUsernames.push(username);
      createdEmails.push(email);

      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: {
          "x-csrf-token": tabACsrf.token,
          cookie: tabACsrf.cookie,
          origin: env.APP_ORIGIN,
        },
        payload: {
          username,
          displayName: "Multi Tab User",
          email,
          password: "password123!",
        },
      });

      // Tab B memuat ulang halaman dan memanggil GET /api/csrf membawa cookie yang dibagi bersama
      const tabBRes = await app.inject({
        method: "GET",
        url: "/api/csrf",
        headers: { cookie: tabACsrf.cookie },
      });
      expect(tabBRes.statusCode).toBe(200);
      const tabBToken = (tabBRes.json() as { token: string }).token;
      expect(tabBToken).toBe(tabACsrf.token);
      const tabBCookieVal =
        tabBRes.cookies.find((c) => c.name === CSRF_COOKIE_NAME)?.value ??
        tabBToken;

      // Tab A melakukan login menggunakan token dari Tab A dan cookie bersama terbaru
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          "x-csrf-token": tabACsrf.token,
          cookie: `${CSRF_COOKIE_NAME}=${tabBCookieVal}`,
          origin: env.APP_ORIGIN,
        },
        payload: {
          username,
          password: "password123!",
        },
      });
      expect(loginRes.statusCode).toBe(200);
    });
  });

  // --- D-02c & D-03: Reset Lockout & Jendela Kegagalan 10 Menit ---
  describe("D-02c & D-03: Lockout reset after expiry & 10-minute failure window", () => {
    it("D-02c: setelah masa kunci berakhir, 1 kegagalan login tidak langsung mengunci ulang akun", async () => {
      const key = makeLockoutKey(helperUsername("exp_lck"), "127.0.0.1");
      const t0 = new Date("2026-01-01T00:00:00.000Z");

      try {
        // 5 kali gagal pada t0 -> akun terkunci selama 15 menit
        for (let i = 0; i < 5; i += 1) {
          await recordFailedAttempt(db, key, new Date(t0.getTime() + i * 1000));
        }

        await expect(
          checkLockout(db, key, new Date(t0.getTime() + 10_000)),
        ).rejects.toMatchObject({
          code: "AUTH_LOCKED",
          statusCode: 429,
        });

        // Setelah 16 menit (> LOCKOUT_DURATION_MS), kunci sudah kedaluwarsa
        const afterExpiry = new Date(
          t0.getTime() + LOCKOUT_DURATION_MS + 60_000,
        );
        await expect(
          checkLockout(db, key, afterExpiry),
        ).resolves.toBeUndefined();

        // 1 percobaan gagal baru setelah kedaluwarsa mereset penghitung ke 1 (tidak langsung mengunci)
        await recordFailedAttempt(db, key, afterExpiry);
        await expect(
          checkLockout(db, key, afterExpiry),
        ).resolves.toBeUndefined();

        const [row] = await db
          .select()
          .from(loginAttempts)
          .where(eq(loginAttempts.key, key));
        expect(row?.count).toBe(1);
        expect(row?.lockedUntil).toBeNull();
      } finally {
        await clearLockout(db, key);
      }
    });

    it("D-03: 4 gagal lalu jeda 11 menit + 1 gagal tidak mengunci; 5 gagal dalam 10 menit mengunci selama 15 menit", async () => {
      const key = makeLockoutKey(helperUsername("win_lck"), "127.0.0.1");
      const t0 = new Date("2026-01-01T00:00:00.000Z");

      try {
        // 4 kali gagal dalam 1 menit pertama
        for (let i = 0; i < 4; i += 1) {
          await recordFailedAttempt(
            db,
            key,
            new Date(t0.getTime() + i * 10_000),
          );
        }

        const lastFailT = t0.getTime() + 3 * 10_000;
        // Tunggu 11 menit sejak kegagalan terakhir (> WINDOW_MS 10 menit)
        const after11Min = new Date(lastFailT + WINDOW_MS + 60_000);

        // 1 kali gagal setelah 11 menit -> mereset penghitung kembali ke 1, TIDAK mengunci
        await recordFailedAttempt(db, key, after11Min);
        await expect(
          checkLockout(db, key, after11Min),
        ).resolves.toBeUndefined();

        const [rowAfterReset] = await db
          .select()
          .from(loginAttempts)
          .where(eq(loginAttempts.key, key));
        expect(rowAfterReset?.count).toBe(1);
        expect(rowAfterReset?.lockedUntil).toBeNull();

        // 4 kali gagal lagi dalam jendela 10 menit yang sama (total 5 gagal beruntun dalam 10 menit)
        let fifthAttemptTime = after11Min;
        for (let i = 1; i <= 4; i += 1) {
          fifthAttemptTime = new Date(after11Min.getTime() + i * 30_000);
          await recordFailedAttempt(db, key, fifthAttemptTime);
        }

        // Sekarang terkunci selama 15 menit sejak kegagalan ke-5
        const [lockedRow] = await db
          .select()
          .from(loginAttempts)
          .where(eq(loginAttempts.key, key));
        expect(lockedRow?.count).toBe(5);
        expect(lockedRow?.lockedUntil?.getTime()).toBe(
          fifthAttemptTime.getTime() + LOCKOUT_DURATION_MS,
        );

        await expect(
          checkLockout(db, key, new Date(fifthAttemptTime.getTime() + 1000)),
        ).rejects.toMatchObject({
          code: "AUTH_LOCKED",
          statusCode: 429,
        });
      } finally {
        await clearLockout(db, key);
      }
    });
  });

  // --- D-08 & R-03: Pembersihan Sesi, Login Attempts, dan Job Runner ---
  describe("D-08 & R-03: purgeExpiredSessions, purgeStaleLoginAttempts, createJobRunner", () => {
    it("purgeExpiredSessions menghapus sesi kedaluwarsa dan mempertahankan sesi aktif", async () => {
      const { token, cookie } = await getCsrfTokenAndCookie();
      const username = helperUsername("purge_s");
      createdUsernames.push(username);

      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { "x-csrf-token": token, cookie, origin: env.APP_ORIGIN },
        payload: {
          username,
          displayName: "Purge Session User",
          email: helperEmail("purge_s"),
          password: "password123!",
        },
      });

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username));
      expect(user).toBeDefined();

      const now = new Date();
      const expiredSessionId = hashToken(generateToken());
      const activeSessionId = hashToken(generateToken());

      await db.insert(sessions).values([
        {
          id: expiredSessionId,
          subjectType: "user",
          subjectId: user!.id,
          expiresAt: new Date(now.getTime() - 60_000),
        },
        {
          id: activeSessionId,
          subjectType: "user",
          subjectId: user!.id,
          expiresAt: new Date(now.getTime() + 3600_000),
        },
      ]);

      const purgedCount = await purgeExpiredSessions(db, now);
      expect(purgedCount).toBeGreaterThanOrEqual(1);

      const remaining = await db
        .select()
        .from(sessions)
        .where(inArray(sessions.id, [expiredSessionId, activeSessionId]));

      expect(remaining.map((s) => s.id)).toEqual([activeSessionId]);
    });

    it("purgeStaleLoginAttempts menghapus percobaan usang/kedaluwarsa dan mempertahankan kunci aktif", async () => {
      const now = new Date();
      const expiredLockKey = `${TEST_PREFIX}purge_explock:127.0.0.1`;
      const staleAttemptKey = `${TEST_PREFIX}purge_stale:127.0.0.1`;
      const activeLockKey = `${TEST_PREFIX}purge_actlock:127.0.0.1`;
      const recentAttemptKey = `${TEST_PREFIX}purge_recent:127.0.0.1`;

      await db.insert(loginAttempts).values([
        {
          key: expiredLockKey,
          count: 5,
          lockedUntil: new Date(now.getTime() - 60_000),
          lastFailedAt: new Date(now.getTime() - 120_000),
        },
        {
          key: staleAttemptKey,
          count: 2,
          lockedUntil: null,
          lastFailedAt: new Date(now.getTime() - STALE_ATTEMPT_TTL_MS - 60_000),
        },
        {
          key: activeLockKey,
          count: 5,
          lockedUntil: new Date(now.getTime() + 600_000),
          lastFailedAt: now,
        },
        {
          key: recentAttemptKey,
          count: 2,
          lockedUntil: null,
          lastFailedAt: new Date(now.getTime() - 60_000),
        },
      ]);

      const deletedCount = await purgeStaleLoginAttempts(db, now);
      expect(deletedCount).toBeGreaterThanOrEqual(2);

      const remaining = await db
        .select()
        .from(loginAttempts)
        .where(
          inArray(loginAttempts.key, [
            expiredLockKey,
            staleAttemptKey,
            activeLockKey,
            recentAttemptKey,
          ]),
        );

      const remainingKeys = remaining.map((r) => r.key).sort();
      expect(remainingKeys).toEqual([activeLockKey, recentAttemptKey].sort());
    });

    it("createJobRunner mendaftarkan job inti, mengeksekusi runJob(name), dan menghentikan job dengan bersih", async () => {
      const runner = createJobRunner({ db, autoStart: false });
      expect(runner.listJobs()).toEqual(
        expect.arrayContaining([
          "purge-chat",
          "purge-sessions",
          "purge-login-attempts",
        ]),
      );

      let customRunCount = 0;
      let customStopped = false;

      runner.register({
        name: "custom-test-job",
        intervalMs: 60_000,
        run: () => {
          customRunCount += 1;
          return customRunCount;
        },
        stop: () => {
          customStopped = true;
        },
      });

      expect(runner.listJobs()).toContain("custom-test-job");

      const result = await runner.runJob("custom-test-job");
      expect(result).toBe(1);
      expect(customRunCount).toBe(1);

      // Menjalankan job inti via runJob
      await expect(runner.runJob("purge-sessions")).resolves.toEqual(
        expect.any(Number),
      );
      await expect(runner.runJob("purge-login-attempts")).resolves.toEqual(
        expect.any(Number),
      );

      // Job yang tidak terdaftar harus melempar error
      await expect(runner.runJob("non-existent-job")).rejects.toThrow();

      runner.startAll();
      runner.stopAll();
      expect(customStopped).toBe(true);
    });
  });
});
