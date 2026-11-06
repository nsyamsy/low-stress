import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as Client, type Socket as ClientSocket } from "socket.io-client";
import {
  createDb,
  games,
  ludoPlayers,
  runGameMigrations,
  users,
  type Database,
} from "@low-stress/db";
import { and, eq } from "drizzle-orm";
import { buildApp } from "../src/app";
import { hashPassword } from "../src/auth/password";
import { createSession } from "../src/auth/session";
import { readEnv } from "../src/env";
// Local RoomView type for test assertions
interface RoomView {
  id: string;
  turn?: number | null;
  status: string;
  myStatus?: string | null;
  players: Array<{
    userId: string;
    username: string;
    displayName: string;
    status: string;
    seat?: number | null;
    autopilot?: boolean;
    [k: string]: unknown;
  }>;
  state: {
    turn?: number | null;
    phase?: string;
    rolls?: number[];
    pawns?: Record<string, number>;
    winner?: number | null;
    place?: number[];
    [k: string]: unknown;
  } | null;
  [key: string]: unknown;
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

describe("P7-04: Autopilot and Client Reconnection", () => {
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

    await db
      .insert(games)
      .values({ id: "ludo", status: "active" })
      .onConflictDoUpdate({
        target: games.id,
        set: { status: "active" },
      });

    const pwHash = await hashPassword("LudoPass123!");
    const timeSuffix = (Date.now() % 1000000).toString(36) + "_auto";

    const [h] = await db
      .insert(users)
      .values({
        username: `auto_h_${timeSuffix}`,
        displayName: "Host Autopilot",
        email: `auto_h_${timeSuffix}@example.com`,
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
        username: `auto_p_${timeSuffix}`,
        displayName: "P2 Autopilot",
        email: `auto_p_${timeSuffix}@example.com`,
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
      ludoAutopilot: {
        paceMs: 50,
        idleTimeoutMs: 150,
      },
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
    if (hostUser) {
      await db.delete(users).where(eq(users.id, hostUser.id));
    }
    if (p2User) {
      await db.delete(users).where(eq(users.id, p2User.id));
    }
    if (dbHandle) {
      await dbHandle.close();
    }
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

  it("handles idle takeover: takes over player turn after idle timeout", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/games/ludo/rooms",
      cookies: { ls_session: hostSessionToken },
      payload: { name: "Idle Takeover Room", maxPlayers: 2 },
    });
    expect(res.statusCode).toBe(201);
    const initialRoom = res.json();
    const roomId = initialRoom.id;

    const sHost = await createSocket(hostCookie);
    const sP2 = await createSocket(p2Cookie);

    // Join room
    await new Promise((r) => sHost.emit("room:join", { roomId }, r));
    await new Promise((r) => sP2.emit("room:join", { roomId }, r));

    // Invite P2 & accept
    await new Promise((r) =>
      sHost.emit("room:action", { roomId, action: "invite", userIds: [p2User.id] }, r),
    );
    await new Promise((r) =>
      sP2.emit("room:action", { roomId, action: "respond", accept: true }, r),
    );

    // Start game
    const startRes = await new Promise<{ ok: boolean; view: RoomView }>((r) =>
      sHost.emit("room:action", { roomId, action: "start", pawns: 2 }, r),
    );
    expect(startRes.ok).toBe(true);
    expect(startRes.view.status).toBe("playing");

    // Initially neither player has autopilot
    const hostPlayerBefore = startRes.view.players.find((p) => p.userId === hostUser.id);
    expect(hostPlayerBefore?.autopilot).toBe(false);

    // Host has the first turn (turn 0). Do not roll or move.
    // Wait for idleTimeoutMs (150ms) to fire and autopilot takeover to happen.
    const statePromise = new Promise<RoomView>((resolve) => {
      const handler = (view: RoomView) => {
        const hp = view.players.find((p) => p.userId === hostUser.id);
        if (hp && hp.autopilot) {
          sHost.off("room:state", handler);
          resolve(view);
        }
      };
      sHost.on("room:state", handler);
    });

    const updatedView = await statePromise;
    expect(updatedView.players.find((p) => p.userId === hostUser.id)?.autopilot).toBe(true);

    sHost.disconnect();
    sP2.disconnect();
  });

  it("reconnects player and takes back control when player makes an action", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/games/ludo/rooms",
      cookies: { ls_session: hostSessionToken },
      payload: { name: "Reconnect Control Room", maxPlayers: 2 },
    });
    expect(res.statusCode).toBe(201);
    const room = res.json();
    const roomId = room.id;

    let sHost = await createSocket(hostCookie);
    const sP2 = await createSocket(p2Cookie);

    await new Promise((r) => sHost.emit("room:join", { roomId }, r));
    await new Promise((r) => sP2.emit("room:join", { roomId }, r));

    await new Promise((r) =>
      sHost.emit("room:action", { roomId, action: "invite", userIds: [p2User.id] }, r),
    );
    await new Promise((r) =>
      sP2.emit("room:action", { roomId, action: "respond", accept: true }, r),
    );
    await new Promise((r) =>
      sHost.emit("room:action", { roomId, action: "start", pawns: 2 }, r),
    );

    // Host turns on autopilot explicitly
    await new Promise<{ ok: boolean; view: RoomView }>((r) =>
      sHost.emit("room:action", { roomId, action: "autopilot", on: true }, r),
    );

    // Verify DB shows host is on autopilot
    const [pRow] = await db
      .select({ autopilot: ludoPlayers.autopilot })
      .from(ludoPlayers)
      .where(and(eq(ludoPlayers.roomId, roomId), eq(ludoPlayers.userId, hostUser.id)));
    expect(pRow?.autopilot).toBe(true);

    // Host disconnects client
    sHost.disconnect();

    // Host reconnects with a fresh socket
    sHost = await createSocket(hostCookie);
    const joinRes = await new Promise<{ ok: boolean; view: RoomView }>((r) =>
      sHost.emit("room:join", { roomId }, r),
    );
    expect(joinRes.ok).toBe(true);
    expect(joinRes.view.status).toBe("playing");

    // Host turns off autopilot (takes back control)
    const offRes = await new Promise<{ ok: boolean; view: RoomView }>((r) =>
      sHost.emit("room:action", { roomId, action: "autopilot", on: false }, r),
    );
    expect(offRes.ok).toBe(true);
    expect(offRes.view.players.find((p) => p.userId === hostUser.id)?.autopilot).toBe(false);

    // Verify DB updated
    const [pRowAfter] = await db
      .select({ autopilot: ludoPlayers.autopilot })
      .from(ludoPlayers)
      .where(and(eq(ludoPlayers.roomId, roomId), eq(ludoPlayers.userId, hostUser.id)));
    expect(pRowAfter?.autopilot).toBe(false);

    sHost.disconnect();
    sP2.disconnect();
  });
});
