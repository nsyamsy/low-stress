import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admins,
  auditLog,
  createDb,
  games,
  sessions,
  settings,
  users,
  type Database,
} from "@low-stress/db";
import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { hashPassword } from "../src/auth/password";
import { resolvePrincipal } from "../src/auth/principal";
import {
  ADMIN_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  createAdminSession,
  createSession,
  generateToken,
  hashToken,
} from "../src/auth/session";
import { readEnv } from "../src/env";
import type { LoadedGame } from "../src/registry/games";
import type { GameProps } from "@low-stress/sdk";

const env = readEnv();

describe("Game Gateway, Status & Schedule (Phase 4: P4-01 .. P4-04)", () => {
  let app: FastifyInstance;
  let dbHandle: ReturnType<typeof createDb>;
  let db: Database;

  const TEST_PREFIX = `gate_t${(Date.now() % 1000000).toString(36)}_`;
  const adminUsername = `${TEST_PREFIX}adm`;
  const adminPassword = "superAdminSecret123!";
  let adminId: string;

  const playerUsername = `${TEST_PREFIX}usr`;
  const playerPassword = "playerSecretPassword123!";
  let playerId: string;

  const pendingUsername = `${TEST_PREFIX}pnd`;
  let pendingId: string;

  const game1Id = `${TEST_PREFIX}game1`;
  const game2Id = `${TEST_PREFIX}game2`;

  const dummyManifest1: LoadedGame = {
    manifest: {
      id: game1Id,
      version: "1.0.0",
      title: { id: "Game Uji Satu", en: "Test Game One" },
      description: { id: "Deskripsi satu", en: "Description one" },
      icon: "icon.svg",
      mode: "solo",
      mobile: { supported: true, orientation: "portrait" },
      client: async () => ({ default: (() => null) as unknown as React.ComponentType<GameProps> }),
    },
    path: `/mock/${game1Id}/manifest.ts`,
  };

  const dummyManifest2: LoadedGame = {
    manifest: {
      id: game2Id,
      version: "1.0.0",
      title: { id: "Game Uji Dua", en: "Test Game Two" },
      description: { id: "Deskripsi dua", en: "Description two" },
      icon: "icon.svg",
      mode: "multiplayer",
      mobile: { supported: false },
      client: async () => ({ default: (() => null) as unknown as React.ComponentType<GameProps> }),
    },
    path: `/mock/${game2Id}/manifest.ts`,
  };

  beforeAll(async () => {
    dbHandle = createDb(env.DATABASE_URL, { max: 2 });
    db = dbHandle.db;

    // 1. Buat admin
    const hashedAdmin = await hashPassword(adminPassword);
    const [insertedAdmin] = await db
      .insert(admins)
      .values({
        username: adminUsername,
        passwordHash: hashedAdmin,
      })
      .returning();
    adminId = insertedAdmin!.id;

    // 2. Buat pemain active
    const hashedUser = await hashPassword(playerPassword);
    const [insertedUser] = await db
      .insert(users)
      .values({
        username: playerUsername,
        displayName: "Pemain Uji",
        email: `${TEST_PREFIX}usr@example.test`,
        passwordHash: hashedUser,
        status: "active",
      })
      .returning();
    playerId = insertedUser!.id;

    // 3. Buat pemain pending
    const [insertedPending] = await db
      .insert(users)
      .values({
        username: pendingUsername,
        displayName: "Pemain Pending",
        email: `${TEST_PREFIX}pnd@example.test`,
        passwordHash: hashedUser,
        status: "pending",
      })
      .returning();
    pendingId = insertedPending!.id;

    // 4. Buat baris game uji di DB
    await db.insert(games).values([
      {
        id: game1Id,
        status: "inactive",
        sortOrder: 2,
        badge: "hot",
      },
      {
        id: game2Id,
        status: "inactive",
        sortOrder: 1,
        badge: "new",
      },
    ]);

    app = await buildApp({
      env,
      db,
      games: [dummyManifest1, dummyManifest2],
      logger: false,
    });
  });

  afterAll(async () => {
    if (db) {
      await db
        .delete(sessions)
        .where(inArray(sessions.subjectId, [playerId, pendingId, adminId]));
      await db.delete(users).where(inArray(users.id, [playerId, pendingId]));
      await db.delete(admins).where(eq(admins.id, adminId));
      await db.delete(games).where(inArray(games.id, [game1Id, game2Id]));
      await db.delete(auditLog).where(eq(auditLog.adminId, adminId));
      await db.delete(settings).where(eq(settings.key, "globalSchedule"));
    }
    if (app) {
      await app.close();
    }
    if (dbHandle) {
      await dbHandle.close();
    }
  });

  async function getCsrf(): Promise<{ csrfToken: string; cookieHeader: string }> {
    const res = await app.inject({ method: "GET", url: "/api/csrf" });
    const body = res.json() as { token: string };
    const rawCookie = res.headers["set-cookie"];
    const cookieHeader = Array.isArray(rawCookie) ? rawCookie.join("; ") : (rawCookie ?? "");
    return { csrfToken: body.token, cookieHeader };
  }

  async function loginAsAdmin(): Promise<{ fullCookieHeader: string; csrfToken: string }> {
    const { csrfToken, cookieHeader } = await getCsrf();
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      headers: {
        origin: env.APP_ORIGIN,
        "x-csrf-token": csrfToken,
        cookie: cookieHeader,
      },
      payload: { username: adminUsername, password: adminPassword },
    });
    const setCookie = res.headers["set-cookie"];
    const adminCookie = Array.isArray(setCookie) ? setCookie.join("; ") : (setCookie ?? "");
    return { fullCookieHeader: `${cookieHeader}; ${adminCookie}`, csrfToken };
  }

  async function loginAsPlayer(): Promise<{ fullCookieHeader: string }> {
    const { csrfToken, cookieHeader } = await getCsrf();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: {
        origin: env.APP_ORIGIN,
        "x-csrf-token": csrfToken,
        cookie: cookieHeader,
      },
      payload: { username: playerUsername, password: playerPassword },
    });
    const setCookie = res.headers["set-cookie"];
    const playerCookie = Array.isArray(setCookie) ? setCookie.join("; ") : (setCookie ?? "");
    return { fullCookieHeader: `${cookieHeader}; ${playerCookie}` };
  }

  async function loginAsPending(): Promise<{ fullCookieHeader: string }> {
    const { csrfToken, cookieHeader } = await getCsrf();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: {
        origin: env.APP_ORIGIN,
        "x-csrf-token": csrfToken,
        cookie: cookieHeader,
      },
      payload: { username: pendingUsername, password: playerPassword },
    });
    const setCookie = res.headers["set-cookie"];
    const pendingCookie = Array.isArray(setCookie) ? setCookie.join("; ") : (setCookie ?? "");
    return { fullCookieHeader: `${cookieHeader}; ${pendingCookie}` };
  }

  // ==========================================
  // P4-01: Status per game, urutan, badge, pesan maintenance
  // ==========================================
  describe("P4-01: Status per game, maintenance message, sortOrder, badge", () => {
    it("admin dapat mengambil daftar seluruh game lewat GET /api/admin/games (termasuk inactive)", async () => {
      const { fullCookieHeader } = await loginAsAdmin();
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/games",
        headers: { cookie: fullCookieHeader },
      });
      expect(res.statusCode).toBe(200);
      const json = res.json() as { items: Array<{ id: string; status: string; sortOrder: number; badge: string | null }> };
      const ids = json.items.map((g) => g.id);
      expect(ids).toContain(game1Id);
      expect(ids).toContain(game2Id);

      // Pastikan urutan sortOrder dihormati (game2: sortOrder 1, game1: sortOrder 2)
      const idx2 = ids.indexOf(game2Id);
      const idx1 = ids.indexOf(game1Id);
      expect(idx2).toBeLessThan(idx1);
    });

    it("game inactive TIDAK muncul bagi pemain di GET /api/games", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/games",
      });
      expect(res.statusCode).toBe(200);
      const json = res.json() as { items: Array<{ id: string }> };
      const ids = json.items.map((g) => g.id);
      expect(ids).not.toContain(game1Id);
      expect(ids).not.toContain(game2Id);
    });

    it("admin dapat memperbarui status game, pesan maintenance dwibahasa, sortOrder, dan badge", async () => {
      const { fullCookieHeader, csrfToken } = await loginAsAdmin();

      const patchRes = await app.inject({
        method: "PATCH",
        url: `/api/admin/games/${game1Id}`,
        headers: {
          origin: env.APP_ORIGIN,
          "x-csrf-token": csrfToken,
          cookie: fullCookieHeader,
        },
        payload: {
          status: "maintenance",
          maintenanceMessage: {
            id: "Server sedang ditingkatkan.",
            en: "Server is being upgraded.",
          },
          badge: "popular",
          sortOrder: 5,
        },
      });

      expect(patchRes.statusCode).toBe(200);
      const updated = patchRes.json() as {
        status: string;
        maintenanceMessage: { id: string; en: string };
        badge: string;
        sortOrder: number;
      };
      expect(updated.status).toBe("maintenance");
      expect(updated.maintenanceMessage.id).toBe("Server sedang ditingkatkan.");
      expect(updated.badge).toBe("popular");
      expect(updated.sortOrder).toBe(5);

      // Aksi admin tercatat di audit_log
      const [log] = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.targetId, game1Id));
      expect(log).toBeDefined();
      expect(log?.action).toBe("game.update");
    });

    it("game maintenance muncul di GET /api/games dengan open: false dan pesan maintenance", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/games",
      });
      expect(res.statusCode).toBe(200);
      const json = res.json() as { items: Array<{ id: string; status: string; open: boolean; maintenanceMessage: { id: string; en: string } | null }> };
      const found = json.items.find((g) => g.id === game1Id);
      expect(found).toBeDefined();
      expect(found?.status).toBe("maintenance");
      expect(found?.open).toBe(false);
      expect(found?.maintenanceMessage?.id).toBe("Server sedang ditingkatkan.");
    });

    it("E2E: admin menutup game → pemain melihat kartu terkunci", async () => {
      // 1. Admin login dan menutup game (mengubah status menjadi maintenance)
      const { fullCookieHeader, csrfToken } = await loginAsAdmin();
      const closeRes = await app.inject({
        method: "PATCH",
        url: `/api/admin/games/${game1Id}`,
        headers: {
          origin: env.APP_ORIGIN,
          "x-csrf-token": csrfToken,
          cookie: fullCookieHeader,
        },
        payload: {
          status: "maintenance",
          maintenanceMessage: {
            id: "Game ditutup sementara untuk perbaikan teknis.",
            en: "Game temporarily closed for technical maintenance.",
          },
        },
      });
      expect(closeRes.statusCode).toBe(200);

      // 2. Pemain memuat daftar game di beranda (/api/games)
      const playerListRes = await app.inject({
        method: "GET",
        url: "/api/games",
      });
      expect(playerListRes.statusCode).toBe(200);
      const listJson = playerListRes.json() as {
        items: Array<{
          id: string;
          status: string;
          open: boolean;
          maintenanceMessage: { id: string; en: string } | null;
        }>;
      };
      const playerGameCard = listJson.items.find((g) => g.id === game1Id);

      // Kartu berstatus maintenance dan tidak dapat dibuka (terkunci)
      expect(playerGameCard).toBeDefined();
      expect(playerGameCard?.status).toBe("maintenance");
      expect(playerGameCard?.open).toBe(false);
      expect(playerGameCard?.maintenanceMessage?.id).toBe(
        "Game ditutup sementara untuk perbaikan teknis.",
      );

      // 3. Pemain mencoba masuk ke rute game ditolak oleh gerbang
      const player = await loginAsPlayer();
      const gateRes = await app.inject({
        method: "GET",
        url: `/api/games/${game1Id}/ping`,
        headers: { cookie: player.fullCookieHeader },
      });
      expect(gateRes.statusCode).toBe(403);
      expect(gateRes.json().error.code).toBe("GAME_MAINTENANCE");
    });
  });

  // ==========================================
  // P4-02 & P4-04: Jadwal WIB, jendela multi-waktu, dan Gerbang API
  // ==========================================
  describe("P4-02 & P4-04: Jadwal dan Gerbang API /api/games/:id/*", () => {
    it("gerbang menolak game inactive dengan 404 NOT_FOUND", async () => {
      const { fullCookieHeader } = await loginAsPlayer();
      const res = await app.inject({
        method: "GET",
        url: `/api/games/${game2Id}/ping`, // game2 masih inactive
        headers: { cookie: fullCookieHeader },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("NOT_FOUND");
    });

    it("gerbang menolak game non-existent dengan 404 NOT_FOUND", async () => {
      const { fullCookieHeader } = await loginAsPlayer();
      const res = await app.inject({
        method: "GET",
        url: `/api/games/game-yang-tidak-ada/ping`,
        headers: { cookie: fullCookieHeader },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("NOT_FOUND");
    });

    it("gerbang menolak game maintenance dengan 403 GAME_MAINTENANCE dan pesan admin", async () => {
      const { fullCookieHeader } = await loginAsPlayer();
      const res = await app.inject({
        method: "GET",
        url: `/api/games/${game1Id}/ping`, // game1 status maintenance
        headers: { cookie: fullCookieHeader },
      });
      expect(res.statusCode).toBe(403);
      const json = res.json() as { error: { code: string; params: { message: { id: string; en: string } } } };
      expect(json.error.code).toBe("GAME_MAINTENANCE");
      expect(json.error.params.message.id).toBe("Game ditutup sementara untuk perbaikan teknis.");
    });

    it("gerbang menolak jika di luar jadwal dengan 403 GAME_CLOSED (params: windows, days, opensAt)", async () => {
      const { fullCookieHeader, csrfToken } = await loginAsAdmin();

      // Aktifkan game1, tapi set jadwalnya ke hari/jam yang pasti tutup sekarang (misal: 04:00 - 05:00)
      await app.inject({
        method: "PATCH",
        url: `/api/admin/games/${game1Id}`,
        headers: {
          origin: env.APP_ORIGIN,
          "x-csrf-token": csrfToken,
          cookie: fullCookieHeader,
        },
        payload: {
          status: "active",
          schedule: {
            enabled: true,
            windows: [{ start: "04:00", end: "04:30" }],
            days: [0, 1, 2, 3, 4, 5, 6],
          },
        },
      });

      // Pemain mengakses rute game
      const player = await loginAsPlayer();
      const res = await app.inject({
        method: "GET",
        url: `/api/games/${game1Id}/ping`,
        headers: { cookie: player.fullCookieHeader },
      });

      expect(res.statusCode).toBe(403);
      const json = res.json() as {
        error: {
          code: string;
          params: { windows: Array<{ start: string; end: string }>; days: number[]; opensAt: string };
        };
      };
      expect(json.error.code).toBe("GAME_CLOSED");
      expect(json.error.params.windows).toEqual([{ start: "04:00", end: "04:30" }]);
      expect(json.error.params.opensAt).toBeDefined();

      // Di daftar GET /api/games, game berstatus active tapi open: false dan ada opensAt
      const listRes = await app.inject({ method: "GET", url: "/api/games" });
      const listJson = listRes.json() as { items: Array<{ id: string; open: boolean; opensAt: string | null }> };
      const item = listJson.items.find((g) => g.id === game1Id);
      expect(item?.open).toBe(false);
      expect(item?.opensAt).not.toBeNull();
    });

    it("gerbang mengizinkan akses jika game active dan berada di dalam jadwal", async () => {
      const { fullCookieHeader, csrfToken } = await loginAsAdmin();

      // Buka jadwal 24 jam dengan enabled: false (selalu buka)
      await app.inject({
        method: "PATCH",
        url: `/api/admin/games/${game1Id}`,
        headers: {
          origin: env.APP_ORIGIN,
          "x-csrf-token": csrfToken,
          cookie: fullCookieHeader,
        },
        payload: {
          status: "active",
          schedule: {
            enabled: false,
            windows: [{ start: "12:00", end: "13:00" }],
            days: [1, 2, 3, 4, 5],
          },
        },
      });

      const player = await loginAsPlayer();
      const res = await app.inject({
        method: "GET",
        url: `/api/games/${game1Id}/ping`,
        headers: { cookie: player.fullCookieHeader },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    });

    it("pemain pending ditolak dari gerbang game dengan 403 ACCOUNT_PENDING", async () => {
      const pending = await loginAsPending();
      const res = await app.inject({
        method: "GET",
        url: `/api/games/${game1Id}/ping`,
        headers: { cookie: pending.fullCookieHeader },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("ACCOUNT_PENDING");
    });

    it("tamu tanpa login ditolak dari gerbang game dengan 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/games/${game1Id}/ping`,
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("UNAUTHENTICATED");
    });

    it("admin dengan cookie ls_admin dilarang mengakses API game dengan 403 FORBIDDEN", async () => {
      const admin = await loginAsAdmin();
      const res = await app.inject({
        method: "GET",
        url: `/api/games/${game1Id}/ping`,
        headers: { cookie: admin.fullCookieHeader },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("FORBIDDEN");
    });

    it("D-02d & R-02: matriks resolvePrincipal (tanpa cookie, hanya user, hanya admin, user + admin, user kedaluwarsa + admin)", async () => {
      const userSess = await createSession(db, playerId);
      const adminSess = await createAdminSession(db, adminId);

      const expiredRawToken = generateToken();
      await db.insert(sessions).values({
        id: hashToken(expiredRawToken),
        subjectType: "user",
        subjectId: playerId,
        expiresAt: new Date(Date.now() - 60_000),
      });

      // 1. Tanpa cookie -> none
      const pNone = await resolvePrincipal(db, {});
      expect(pNone).toEqual({ kind: "none" });

      // 2. Hanya cookie pemain -> user
      const pUser = await resolvePrincipal(db, {
        [SESSION_COOKIE_NAME]: userSess.rawToken,
      });
      expect(pUser.kind).toBe("user");
      if (pUser.kind === "user") {
        expect(pUser.user.id).toBe(playerId);
      }

      // 3. Hanya cookie admin -> admin
      const pAdmin = await resolvePrincipal(db, {
        [ADMIN_COOKIE_NAME]: adminSess.rawToken,
      });
      expect(pAdmin.kind).toBe("admin");
      if (pAdmin.kind === "admin") {
        expect(pAdmin.admin.id).toBe(adminId);
      }

      // 4. Kedua cookie (pemain sah + admin sah) -> user menang (prioritas sesi pemain)
      const pBoth = await resolvePrincipal(
        db,
        `${SESSION_COOKIE_NAME}=${userSess.rawToken}; ${ADMIN_COOKIE_NAME}=${adminSess.rawToken}`,
      );
      expect(pBoth.kind).toBe("user");
      if (pBoth.kind === "user") {
        expect(pBoth.user.id).toBe(playerId);
      }

      // 5. Cookie pemain kedaluwarsa + cookie admin sah -> jatuh ke admin
      const pExpiredUserPlusAdmin = await resolvePrincipal(db, {
        [SESSION_COOKIE_NAME]: expiredRawToken,
        [ADMIN_COOKIE_NAME]: adminSess.rawToken,
      });
      expect(pExpiredUserPlusAdmin.kind).toBe("admin");
      if (pExpiredUserPlusAdmin.kind === "admin") {
        expect(pExpiredUserPlusAdmin.admin.id).toBe(adminId);
      }
    });

    it("D-02d & R-02: GET /api/games dan GET /api/games/:id/ping dengan cookie pemain + admin mengembalikan 200 OK; hanya cookie admin mengembalikan 403 FORBIDDEN pada gerbang game", async () => {
      const player = await loginAsPlayer();
      const admin = await loginAsAdmin();
      const combinedCookies = `${player.fullCookieHeader}; ${admin.fullCookieHeader}`;

      // 1. Kedua cookie (pemain + admin) pada GET /api/games -> 200 OK
      const listRes = await app.inject({
        method: "GET",
        url: "/api/games",
        headers: { cookie: combinedCookies },
      });
      expect(listRes.statusCode).toBe(200);
      const listJson = listRes.json() as { items: Array<{ id: string }> };
      expect(listJson.items.some((g) => g.id === game1Id)).toBe(true);

      // 2. Kedua cookie (pemain + admin) pada GET /api/games/:id/ping -> 200 OK
      const pingBothRes = await app.inject({
        method: "GET",
        url: `/api/games/${game1Id}/ping`,
        headers: { cookie: combinedCookies },
      });
      expect(pingBothRes.statusCode).toBe(200);
      expect(pingBothRes.json()).toEqual({ ok: true });

      // 3. Hanya cookie admin pada GET /api/games/:id/ping -> 403 FORBIDDEN
      const pingAdminOnlyRes = await app.inject({
        method: "GET",
        url: `/api/games/${game1Id}/ping`,
        headers: { cookie: admin.fullCookieHeader },
      });
      expect(pingAdminOnlyRes.statusCode).toBe(403);
      expect(pingAdminOnlyRes.json().error.code).toBe("FORBIDDEN");
    });
  });
});
