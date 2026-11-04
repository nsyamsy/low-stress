import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as Client, type Socket as ClientSocket } from "socket.io-client";
import {
  createDb,
  games,
  runGameMigrations,
  users,
  type Database,
} from "@low-stress/db";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app";
import { hashPassword } from "../src/auth/password";
import { createSession } from "../src/auth/session";
import { readEnv } from "../src/env";
import type { RoomView } from "../src/ludo/types";

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

describe("P7-07: Ludo Game Gate / Maintenance Freezing & Resuming", () => {
  let dbHandle: ReturnType<typeof createDb>;
  let db: Database;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let serverPort: number;
  let serverUrl: string;

  let hostUser: typeof users.$inferSelect;
  let hostSessionToken: string;
  let hostCookie: string;

  let p2User: typeof users.$inferSelect;
  let p2SessionToken: string;
  let p2Cookie: string;

  beforeAll(async () => {
    dbHandle = createDb(env.DATABASE_URL);
    db = dbHandle.db;
    await runGameMigrations(dbHandle.sql);

    // Pastikan game ludo aktif
    await db
      .insert(games)
      .values({ id: "ludo", status: "active" })
      .onConflictDoUpdate({
        target: games.id,
        set: { status: "active" },
      });

    const pwHash = await hashPassword("LudoPass123!");
    const timeSuffix = (Date.now() % 1000000).toString(36) + "_gate";

    const [h] = await db
      .insert(users)
      .values({
        username: `gate_h_${timeSuffix}`,
        displayName: "Gate Host",
        email: `gate_h_${timeSuffix}@example.com`,
        passwordHash: pwHash,
        status: "active",
      })
      .returning();
    hostUser = h!;
    const hostSession = await createSession(db, hostUser.id);
    hostSessionToken = hostSession.rawToken;
    hostCookie = `ls_session=${hostSessionToken}`;

    const [p] = await db
      .insert(users)
      .values({
        username: `gate_p_${timeSuffix}`,
        displayName: "Gate P2",
        email: `gate_p_${timeSuffix}@example.com`,
        passwordHash: pwHash,
        status: "active",
      })
      .returning();
    p2User = p!;
    const p2Session = await createSession(db, p2User.id);
    p2SessionToken = p2Session.rawToken;
    p2Cookie = `ls_session=${p2SessionToken}`;

    app = await buildApp({
      env,
      db,
      logger: false,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (typeof address === "object" && address) {
      serverPort = address.port;
      serverUrl = `http://127.0.0.1:${serverPort}`;
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    // Kembalikan game ludo ke active
    await db.update(games).set({ status: "active" }).where(eq(games.id, "ludo"));
    await dbHandle.sql.end();
  });

  function createSocket(cookie: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = Client(`${serverUrl}/ludo`, {
        path: "/ws",
        extraHeaders: {
          cookie,
        },
        transports: ["websocket"],
        forceNew: true,
      });

      socket.on("connect", () => resolve(socket));
      socket.on("connect_error", (err) => reject(err));
    });
  }

  it("freezes room when game is in maintenance and resumes when reactivated", async () => {
    // 1. Buat room dan mulai game saat aktif
    const res = await app.inject({
      method: "POST",
      url: "/api/games/ludo/rooms",
      cookies: { ls_session: hostSessionToken },
      payload: { name: "Freeze Test Room", maxPlayers: 2 },
    });
    expect(res.statusCode).toBe(201);
    const { id: roomId } = res.json();

    const sHost = await createSocket(hostCookie);
    const sP2 = await createSocket(p2Cookie);

    try {
      await new Promise((r) => sHost.emit("room:join", { roomId }, r));
      await new Promise((r) =>
        sHost.emit("room:action", { roomId, action: "invite", userIds: [p2User.id] }, r),
      );
      await new Promise((r) => sP2.emit("room:join", { roomId }, r));
      await new Promise((r) =>
        sP2.emit("room:action", { roomId, action: "respond", accept: true }, r),
      );
      const startRes = await new Promise<{ ok: boolean; view: RoomView }>((r) =>
        sHost.emit("room:action", { roomId, action: "start", pawns: 2 }, r),
      );
      expect(startRes.ok).toBe(true);
      expect(startRes.view.status).toBe("playing");

      // 2. Admin mematikan game / set ke maintenance
      await db.update(games).set({ status: "maintenance" }).where(eq(games.id, "ludo"));

      // 3. REST API game ludo ditolak 403 GAME_MAINTENANCE
      const restRes = await app.inject({
        method: "GET",
        url: "/api/games/ludo/rooms",
        cookies: { ls_session: hostSessionToken },
      });
      expect(restRes.statusCode).toBe(403);
      expect(restRes.json().error.code).toBe("GAME_MAINTENANCE");

      // 4. Aksi socket pemain ditolak dengan kode GAME_MAINTENANCE
      const rollRejected = await new Promise<{ ok: boolean; code?: string }>((r) =>
        sHost.emit("room:action", { roomId, action: "roll" }, r),
      );
      expect(rollRejected.ok).toBe(false);
      expect(rollRejected.code).toBe("GAME_MAINTENANCE");

      // 5. Admin mengaktifkan kembali game
      await db.update(games).set({ status: "active" }).where(eq(games.id, "ludo"));

      // 6. REST API kembali 200
      const restActive = await app.inject({
        method: "GET",
        url: "/api/games/ludo/rooms",
        cookies: { ls_session: hostSessionToken },
      });
      expect(restActive.statusCode).toBe(200);

      // 7. Aksi socket pemain berhasil kembali dan game dilanjutkan
      const rollSuccess = await new Promise<{ ok: boolean; view?: RoomView }>((r) =>
        sHost.emit("room:action", { roomId, action: "roll" }, r),
      );
      expect(rollSuccess.ok).toBe(true);
      expect(rollSuccess.view?.status).toBe("playing");
    } finally {
      sHost.disconnect();
      sP2.disconnect();
    }
  });
});
