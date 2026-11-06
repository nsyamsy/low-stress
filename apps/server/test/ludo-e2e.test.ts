import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as Client, type Socket as ClientSocket } from "socket.io-client";
import {
  createDb,
  games,
  runGameMigrations,
  users,
  type Database,
} from "@low-stress/db";
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

describe("P7-05: Ludo 2-Player Full Game E2E", () => {
  let dbHandle: ReturnType<typeof createDb>;
  let db: Database;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let serverPort: number;
  let serverUrl: string;

  let p1User: typeof users.$inferSelect;
  let p1SessionToken: string;
  let p1Cookie: string;

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
    const timeSuffix = (Date.now() % 1000000).toString(36) + "_e2e";

    const [p1] = await db
      .insert(users)
      .values({
        username: `e2e_p1_${timeSuffix}`,
        displayName: "Alice",
        email: `e2e_p1_${timeSuffix}@example.com`,
        passwordHash: pwHash,
        status: "active",
      })
      .returning();
    p1User = p1!;
    const p1Session = await createSession(db, p1User.id);
    p1SessionToken = p1Session.rawToken;
    p1Cookie = `ls_session=${p1SessionToken}`;

    const [p2] = await db
      .insert(users)
      .values({
        username: `e2e_p2_${timeSuffix}`,
        displayName: "Bob",
        email: `e2e_p2_${timeSuffix}@example.com`,
        passwordHash: pwHash,
        status: "active",
      })
      .returning();
    p2User = p2!;
    const p2Session = await createSession(db, p2User.id);
    p2SessionToken = p2Session.rawToken;
    p2Cookie = `ls_session=${p2SessionToken}`;

    app = await buildApp({
      env,
      db,
      logger: false,
      ludoAutopilot: {
        paceMs: 20,
        idleTimeoutMs: 500,
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

  it("2 players complete a game through lobby, chat, moves, autopilot, and victory", async () => {
    // 1. P1 creates room
    const createRes = await app.inject({
      method: "POST",
      url: "/api/games/ludo/rooms",
      cookies: { ls_session: p1SessionToken },
      payload: { name: "E2E Final Championship", maxPlayers: 2 },
    });
    expect(createRes.statusCode).toBe(201);
    const { id: roomId } = createRes.json();

    // 2. Host connects & joins
    const s1 = await createSocket(p1Cookie);
    const s2 = await createSocket(p2Cookie);

    try {
      const join1 = await new Promise<{ ok: boolean; view: RoomView }>((r) =>
        s1.emit("room:join", { roomId }, r),
      );
      expect(join1.ok).toBe(true);

      // 3. P1 invites P2
      const inviteRes = await new Promise<{ ok: boolean; view: RoomView }>((r) =>
        s1.emit("room:action", { roomId, action: "invite", userIds: [p2User.id] }, r),
      );
      expect(inviteRes.ok).toBe(true);

      // 4. P2 joins room and accepts
      const join2 = await new Promise<{ ok: boolean; view: RoomView }>((r) =>
        s2.emit("room:join", { roomId }, r),
      );
      expect(join2.ok).toBe(true);

      const respondRes = await new Promise<{ ok: boolean; view: RoomView }>((r) =>
        s2.emit("room:action", { roomId, action: "respond", accept: true }, r),
      );
      expect(respondRes.ok).toBe(true);

      // 5. Send chat in room
      const chatPromise = new Promise<{ text: string }>((resolve) => {
        s2.once("room:chat", (msg: { text: string }) => resolve(msg));
      });
      await new Promise((r) =>
        s1.emit("room:action", { roomId, action: "chat", text: "Selamat bertanding!" }, r),
      );
      const receivedChat = await chatPromise;
      expect(receivedChat.text).toBe("Selamat bertanding!");

      // 6. Start game with 1 pawn each for fast victory
      const startRes = await new Promise<{ ok: boolean; view: RoomView }>((r) =>
        s1.emit("room:action", { roomId, action: "start", pawns: 1, goal: 1 }, r),
      );
      expect(startRes.ok).toBe(true);
      expect(startRes.view.status).toBe("playing");

      // 7. Turn on autopilot for both so the server autonomously plays to completion
      await new Promise((r) =>
        s1.emit("room:action", { roomId, action: "autopilot", on: true }, r),
      );
      await new Promise((r) =>
        s2.emit("room:action", { roomId, action: "autopilot", on: true }, r),
      );

      // 8. Wait for game to finish
      const finishedPromise = new Promise<RoomView>((resolve) => {
        const handler = (v: RoomView) => {
          if (v.status === "finished" && v.state?.winner !== null) {
            s1.off("room:state", handler);
            resolve(v);
          }
        };
        s1.on("room:state", handler);
      });

      const finalView = await finishedPromise;
      expect(finalView.status).toBe("finished");
      expect(finalView.state?.winner).not.toBeNull();
      expect(finalView.state?.place?.length).toBeGreaterThanOrEqual(1);
    } finally {
      s1.disconnect();
      s2.disconnect();
    }
  }, 30000);
});
