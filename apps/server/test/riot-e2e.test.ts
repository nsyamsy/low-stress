import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as Client, type Socket as ClientSocket } from "socket.io-client";
import {
  createDb,
  games,
  gameScores,
  runGameMigrations,
  users,
  type Database,
} from "@low-stress/db";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app";
import { hashPassword } from "../src/auth/password";
import { createSession } from "../src/auth/session";
import { readEnv } from "../src/env";

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

interface RiotView {
  roomId: string;
  phase: string;
  viewerId: string;
  players: Array<{ id: string; status: string; connected: boolean }>;
  scores?: Record<string, { totalPoints: number }>;
  winner?: string | null;
  [key: string]: unknown;
}

function emitAck<T>(
  socket: ClientSocket,
  event: string,
  data?: unknown,
): Promise<T> {
  return new Promise((resolve) => {
    socket.emit(event, data, (res: T) => resolve(res));
  });
}

/**
 * RT-53: E2E Riot — daftar (sesi) → bergabung → ronde singkat → hasil.
 * Ronde diselesaikan lewat rapat + voting: semua pemain memilih penyusup
 * (identitas dikumpulkan dari event `role` masing-masing klien), sehingga
 * kru menang dan poin tercatat ke leaderboard generik (RT-50).
 */
describe("RT-53: Riot full round E2E (lobby -> playing -> finished -> leaderboard)", () => {
  let dbHandle: ReturnType<typeof createDb>;
  let db: Database;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let serverUrl: string;

  const TEST_PREFIX = `riot_e2e_${(Date.now() % 1000000).toString(36)}_`;
  const createdUsers: Array<{ id: string; token: string; cookie: string }> = [];

  beforeAll(async () => {
    dbHandle = createDb(env.DATABASE_URL);
    db = dbHandle.db;
    await runGameMigrations(dbHandle.sql);

    await db
      .insert(games)
      .values({ id: "riot", status: "active" })
      .onConflictDoUpdate({
        target: games.id,
        set: { status: "active" },
      });

    const pwHash = await hashPassword("RiotPass123!");
    for (let i = 1; i <= 4; i++) {
      const [u] = await db
        .insert(users)
        .values({
          username: `${TEST_PREFIX}p${i}`,
          displayName: `Pemain ${i}`,
          email: `${TEST_PREFIX}p${i}@example.com`,
          passwordHash: pwHash,
          status: "active",
        })
        .returning();
      const session = await createSession(db, u!.id);
      createdUsers.push({
        id: u!.id,
        token: session.rawToken,
        cookie: `ls_session=${session.rawToken}`,
      });
    }

    app = await buildApp({
      env,
      db,
      logger: false,
      ludoAutopilot: { paceMs: 100_000, idleTimeoutMs: 100_000 },
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (typeof address === "object" && address) {
      serverUrl = `http://127.0.0.1:${address.port}`;
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    for (const u of createdUsers) {
      await db.delete(gameScores).where(eq(gameScores.userId, u.id));
      await db.delete(users).where(eq(users.id, u.id));
    }
    await dbHandle.sql.end();
  });

  function createSocket(cookie: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = Client(`${serverUrl}/riot`, {
        path: "/ws",
        extraHeaders: { cookie },
        transports: ["websocket"],
        forceNew: true,
      });
      socket.on("connect", () => resolve(socket));
      socket.on("connect_error", (err) => reject(err));
    });
  }

  it("4 pemain menyelesaikan ronde dan poin masuk leaderboard", async () => {
    const sockets: ClientSocket[] = [];
    try {
      for (const u of createdUsers) {
        sockets.push(await createSocket(u.cookie));
      }
      const s1 = sockets[0]!;

      // 1. Host membuat room
      const createRes = await emitAck<{ success: boolean; room: RiotView }>(
        s1,
        "room:create",
      );
      expect(createRes.success).toBe(true);
      const roomId = createRes.room.roomId;
      expect(createRes.room.phase).toBe("lobby");

      // 2. Tiga pemain lain bergabung
      for (const s of sockets.slice(1)) {
        const joinRes = await emitAck<{ success: boolean; room: RiotView }>(
          s,
          "room:join",
          { roomId },
        );
        expect(joinRes.success).toBe(true);
      }

      // 3. Host memulai ronde; setiap klien menerima peran rahasianya sendiri
      const roles = new Map<number, string>();
      const rolePromises = sockets.map(
        (s, idx) =>
          new Promise<void>((resolve) => {
            s.once("role", (data: { role: string }) => {
              roles.set(idx, data.role);
              resolve();
            });
          }),
      );
      const startRes = await emitAck<{ success: boolean }>(s1, "game:start", {});
      expect(startRes.success).toBe(true);
      await Promise.all(rolePromises);

      expect(roles.size).toBe(4);
      const infiltratorSockets = [...roles.entries()].filter(
        ([, role]) => role === "infiltrator",
      );
      expect(infiltratorSockets.length).toBe(1); // ceil(4/6) = 1

      // 4. Klien TIDAK dapat mengirim skor (RT-50): ditolak server-otoritatif
      const scoreRes = await app.inject({
        method: "POST",
        url: "/api/games/riot/scores",
        cookies: { ls_session: createdUsers[0]!.token },
        payload: { score: 999, durationMs: 1000 },
      });
      expect(scoreRes.statusCode).toBe(403);
      expect(scoreRes.body).toContain("SCORE_SERVER_AUTHORITATIVE");

      // 5. Rapat darurat dipanggil host lalu maju ke voting
      const meetingRes = await emitAck<{ success: boolean }>(
        s1,
        "meeting:call",
        {},
      );
      expect(meetingRes.success).toBe(true);

      const advanceRes = await emitAck<{ success: boolean }>(
        s1,
        "meeting:advance",
        {},
      );
      expect(advanceRes.success).toBe(true);

      // 6. Semua pemain hidup memilih penyusup -> kru menang
      // (urutan socket = urutan createdUsers)
      const infiltratorIndex = infiltratorSockets[0]![0];
      const infiltratorUserId = createdUsers[infiltratorIndex]!.id;

      for (const s of sockets) {
        const voteRes = await emitAck<{ success: boolean }>(s, "vote:cast", {
          targetId: infiltratorUserId,
        });
        expect(voteRes.success).toBe(true);
      }

      // 7. Tunggu tick server mencatat hasil + skor leaderboard (RT-50)
      let leaderboardOk = false;
      for (let attempt = 0; attempt < 30 && !leaderboardOk; attempt++) {
        await new Promise((r) => setTimeout(r, 200));
        const lb = await app.inject({
          method: "GET",
          url: "/api/games/riot/leaderboard?period=all",
          cookies: { ls_session: createdUsers[0]!.token },
        });
        if (lb.statusCode === 200) {
          const body = lb.json() as {
            entries: Array<{ userId: string; score: number }>;
          };
          // Kru pemenang (3 pemain) mencatat poin > 0; penyusup 0 tidak tampil.
          // Host bisa berpoin 0 bila ia penyusup, jadi cek entri mana pun.
          if (
            body.entries.length >= 3 &&
            body.entries.every((e) => e.score > 0)
          ) {
            leaderboardOk = true;
          }
        }
      }
      expect(leaderboardOk).toBe(true);
    } finally {
      for (const s of sockets) s.disconnect();
    }
  }, 60000);
});
