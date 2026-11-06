import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as Client, type Socket as ClientSocket } from "socket.io-client";
import {
  createDb,
  games,
  ludoRooms,
  runGameMigrations,
  users,
  type Database,
} from "@low-stress/db";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app";
import { hashPassword } from "../src/auth/password";
import { createSession } from "../src/auth/session";
import { readEnv } from "../src/env";
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

describe("P7-03: Ludo Server Authority with Socket.IO & Restart Recovery", () => {
  let dbHandle: ReturnType<typeof createDb>;
  let db: Database;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let serverPort: number;
  let serverUrl: string;

  let hostUser: typeof users.$inferSelect;
  let hostSessionToken: string;

  let playerUser: typeof users.$inferSelect;
  let playerSessionToken: string;

  let createdRoomId: string;

  beforeAll(async () => {
    dbHandle = createDb(env.DATABASE_URL);
    db = dbHandle.db;

    await runGameMigrations(dbHandle.sql);

    // Pastikan game ludo aktif di tabel games
    await db
      .insert(games)
      .values({ id: "ludo", status: "active" })
      .onConflictDoUpdate({
        target: games.id,
        set: { status: "active" },
      });

    const pwHash = await hashPassword("LudoPass123!");
    const timeSuffix = (Date.now() % 1000000).toString(36);

    const [h] = await db
      .insert(users)
      .values({
        username: `ludo_h_${timeSuffix}`,
        displayName: "Host Ludo",
        email: `ludo_h_${timeSuffix}@example.com`,
        passwordHash: pwHash,
        status: "active",
      })
      .returning();
    hostUser = h!;
    const hSession = await createSession(db, hostUser.id);
    hostSessionToken = hSession.rawToken;

    const [p] = await db
      .insert(users)
      .values({
        username: `ludo_p_${timeSuffix}`,
        displayName: "Player Ludo",
        email: `ludo_p_${timeSuffix}@example.com`,
        passwordHash: pwHash,
        status: "active",
      })
      .returning();
    playerUser = p!;
    const pSession = await createSession(db, playerUser.id);
    playerSessionToken = pSession.rawToken;

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
    if (createdRoomId) {
      await db.delete(ludoRooms).where(eq(ludoRooms.id, createdRoomId));
    }
    if (hostUser) {
      await db.delete(users).where(eq(users.id, hostUser.id));
    }
    if (playerUser) {
      await db.delete(users).where(eq(users.id, playerUser.id));
    }
    await app.close();
    await dbHandle.close();
  });

  it("creates a room via REST and returns room ID", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/games/ludo/rooms",
      cookies: { ls_session: hostSessionToken },
      payload: {
        name: "Ruangan Uji Realtime",
        maxPlayers: 4,
        play: true,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    createdRoomId = body.id;
  });

  it("lists rooms and searches users via REST", async () => {
    const listRes = await app.inject({
      method: "GET",
      url: "/api/games/ludo/rooms",
      cookies: { ls_session: hostSessionToken },
    });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json();
    expect(list.items.some((r: { id: string }) => r.id === createdRoomId)).toBe(true);

    const searchRes = await app.inject({
      method: "GET",
      url: `/api/games/ludo/users/search?q=${playerUser.username}`,
      cookies: { ls_session: hostSessionToken },
    });
    expect(searchRes.statusCode).toBe(200);
    const search = searchRes.json();
    expect(search.items.some((u: { id: string }) => u.id === playerUser.id)).toBe(true);
  });

  it("rejects unauthenticated socket connection to /ludo", async () => {
    const client: ClientSocket = Client(`${serverUrl}/ludo`, {
      path: "/ws",
      transports: ["websocket"],
      reconnection: false,
    });

    const errorPromise = new Promise<string>((resolve) => {
      client.on("connect_error", (err) => resolve(err.message));
    });

    const msg = await errorPromise;
    expect(msg).toContain("UNAUTHENTICATED");
    client.close();
  });

  it("connects authenticated sockets, joins room, invites, responds, and starts game", async () => {
    const hostSocket: ClientSocket = Client(`${serverUrl}/ludo`, {
      path: "/ws",
      transports: ["websocket"],
      extraHeaders: {
        Cookie: `ls_session=${hostSessionToken}`,
      },
    });

    const playerSocket: ClientSocket = Client(`${serverUrl}/ludo`, {
      path: "/ws",
      transports: ["websocket"],
      extraHeaders: {
        Cookie: `ls_session=${playerSessionToken}`,
      },
    });

    await new Promise<void>((resolve) => {
      let count = 0;
      const onConnect = () => {
        count++;
        if (count === 2) resolve();
      };
      hostSocket.on("connect", onConnect);
      playerSocket.on("connect", onConnect);
    });

    // 1. Host joins room
    const hostJoin = await new Promise<{ ok: boolean; view?: RoomView }>((resolve) => {
      hostSocket.emit("room:join", { roomId: createdRoomId }, resolve);
    });
    expect(hostJoin.ok).toBe(true);
    expect(hostJoin.view?.status).toBe("lobby");

    // 2. Host invites playerUser
    const inviteRes = await new Promise<{ ok: boolean; view?: RoomView }>((resolve) => {
      hostSocket.emit(
        "room:action",
        {
          roomId: createdRoomId,
          action: "invite",
          userIds: [playerUser.id],
        },
        resolve,
      );
    });
    expect(inviteRes.ok).toBe(true);

    // 3. Player joins room and receives invited status
    const playerJoin = await new Promise<{ ok: boolean; view?: RoomView }>((resolve) => {
      playerSocket.emit("room:join", { roomId: createdRoomId }, resolve);
    });
    expect(playerJoin.ok).toBe(true);
    const playerMe = playerJoin.view?.players.find((p) => p.userId === playerUser.id);
    expect(playerMe?.status).toBe("invited");

    // 4. Player accepts invitation
    const respondRes = await new Promise<{ ok: boolean; view?: RoomView }>((resolve) => {
      playerSocket.emit(
        "room:action",
        {
          roomId: createdRoomId,
          action: "respond",
          accept: true,
        },
        resolve,
      );
    });
    expect(respondRes.ok).toBe(true);
    const acceptedMe = respondRes.view?.players.find((p) => p.userId === playerUser.id);
    expect(acceptedMe?.status).toBe("accepted");

    // 5. Host sends chat message with profanity to verify censorship
    const chatPromise = new Promise<{ text: string }>((resolve) => {
      playerSocket.on("room:chat", (msg: { text: string }) => resolve(msg));
    });

    await new Promise<{ ok: boolean }>((resolve) => {
      hostSocket.emit(
        "room:action",
        {
          roomId: createdRoomId,
          action: "chat",
          text: "Halo bro anjing jangan kabur",
        },
        resolve,
      );
    });

    const receivedChat = await chatPromise;
    expect(receivedChat.text).not.toContain("anjing");

    // 6. Host starts game
    const startRes = await new Promise<{ ok: boolean; view?: RoomView }>((resolve) => {
      hostSocket.emit(
        "room:action",
        {
          roomId: createdRoomId,
          action: "start",
          pawns: 2,
          exit: "double",
        },
        resolve,
      );
    });
    expect(startRes.ok).toBe(true);
    expect(startRes.view?.status).toBe("playing");
    expect(startRes.view?.state?.phase).toBe("roll");

    // 7. Test roll dice (authoritative on server)
    const activeSocket = startRes.view?.state?.turn === 0 ? hostSocket : playerSocket;
    const inactiveSocket = startRes.view?.state?.turn === 0 ? playerSocket : hostSocket;

    // Inactive player tries to roll -> rejected with LUDO_NOT_YOUR_TURN
    const illegalRoll = await new Promise<{ ok: boolean; code?: string }>((resolve) => {
      inactiveSocket.emit(
        "room:action",
        {
          roomId: createdRoomId,
          action: "roll",
        },
        resolve,
      );
    });
    expect(illegalRoll.ok).toBe(false);
    expect(illegalRoll.code).toBe("LUDO_NOT_YOUR_TURN");

    // Active player rolls -> succeeds
    const rollRes = await new Promise<{ ok: boolean; view?: RoomView }>((resolve) => {
      activeSocket.emit(
        "room:action",
        {
          roomId: createdRoomId,
          action: "roll",
        },
        resolve,
      );
    });
    expect(rollRes.ok).toBe(true);
    expect(rollRes.view?.state?.rolls).toBeGreaterThan(0);

    hostSocket.close();
    playerSocket.close();
  });

  it("recovers running game state without loss across server restart", async () => {
    // 1. Catat state saat ini di DB
    const [beforeRestart] = await db
      .select()
      .from(ludoRooms)
      .where(eq(ludoRooms.id, createdRoomId));
    expect(beforeRestart?.status).toBe("playing");
    const originalVersion = beforeRestart!.version;

    // 2. Tutup server dan buat instance server baru (simulasi restart total)
    await app.close();

    const newApp = await buildApp({
      env,
      db,
      logger: false,
    });
    const address = await newApp.listen({ host: "127.0.0.1", port: 0 });
    const newPort = Number(new URL(address).port);
    const newServerUrl = `http://127.0.0.1:${newPort}`;

    // 3. Klien menyambung kembali ke server baru
    const reconnectSocket: ClientSocket = Client(`${newServerUrl}/ludo`, {
      path: "/ws",
      transports: ["websocket"],
      extraHeaders: {
        Cookie: `ls_session=${hostSessionToken}`,
      },
    });

    await new Promise<void>((resolve) => {
      reconnectSocket.on("connect", () => resolve());
    });

    // 4. Klien emit room:join setelah restart
    const joinAfter = await new Promise<{ ok: boolean; view?: RoomView }>((resolve) => {
      reconnectSocket.emit("room:join", { roomId: createdRoomId }, resolve);
    });

    expect(joinAfter.ok).toBe(true);
    expect(joinAfter.view?.id).toBe(createdRoomId);
    expect(joinAfter.view?.status).toBe("playing");
    expect(joinAfter.view?.version).toBe(originalVersion);
    expect(joinAfter.view?.state).toBeDefined();
    expect(joinAfter.view?.state?.pawns).toHaveLength(2);

    reconnectSocket.close();
    await newApp.close();

    // Buat kembali app original untuk afterAll cleanup
    app = await buildApp({ env, db, logger: false });
    await app.listen({ host: "127.0.0.1", port: 0 });
  });
});
