import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as Client, type Socket as ClientSocket } from "socket.io-client";
import {
  createDb,
  chatMessages,
  users,
  type Database,
} from "@low-stress/db";
import { inArray } from "drizzle-orm";
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

describe("P9-04: Uji beban ringan (200 koneksi Socket.IO bersamaan)", () => {
  let dbHandle: ReturnType<typeof createDb>;
  let db: Database;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let serverPort: number;
  let serverUrl: string;

  let activeUser: typeof users.$inferSelect;
  let activeToken: string;
  const testUserIds: string[] = [];

  beforeAll(async () => {
    dbHandle = createDb(env.DATABASE_URL);
    db = dbHandle.db;

    const pwHash = await hashPassword("LoadTest123!");
    const timeSuffix = (Date.now() % 1000000).toString(36);

    const [u] = await db
      .insert(users)
      .values({
        username: `load_${timeSuffix}`,
        displayName: "Load Tester",
        email: `load_${timeSuffix}@example.com`,
        passwordHash: pwHash,
        status: "active",
      })
      .returning();
    activeUser = u!;
    testUserIds.push(activeUser.id);

    const session = await createSession(db, activeUser.id);
    activeToken = session.rawToken;

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
    if (testUserIds.length > 0) {
      await db.delete(chatMessages).where(inArray(chatMessages.userId, testUserIds));
      await db.delete(users).where(inArray(users.id, testUserIds));
    }
    await app.close();
    await dbHandle.close();
  });

  it(
    "berhasil menangani 200 koneksi bersamaan tanpa error dan memori stabil",
    async () => {
      // 1. Catat memori awal baseline
      if (global.gc) {
        global.gc();
      }
      const baselineMemory = process.memoryUsage();
      const baselineHeapMb = baselineMemory.heapUsed / (1024 * 1024);

      const CONCURRENT_CLIENTS = 200;
      const sockets: ClientSocket[] = [];
      const connectionErrors: Error[] = [];

      // 2. Hubungkan 200 klien secara bersamaan
      const connectPromises = Array.from({ length: CONCURRENT_CLIENTS }, () => {
        return new Promise<ClientSocket>((resolve, reject) => {
          const socket = Client(`${serverUrl}/public-chat`, {
            path: "/ws",
            transports: ["websocket"],
            extraHeaders: {
              cookie: `ls_session=${activeToken}`,
            },
            reconnection: false,
            timeout: 10000,
          });

          socket.on("connect", () => {
            resolve(socket);
          });

          socket.on("connect_error", (err) => {
            connectionErrors.push(err);
            reject(err);
          });
        });
      });

      const connectedSockets = await Promise.all(connectPromises);
      sockets.push(...connectedSockets);

      // Verifikasi: 200 socket terhubung, tidak ada error
      expect(connectionErrors.length).toBe(0);
      expect(sockets.length).toBe(CONCURRENT_CLIENTS);
      for (const s of sockets) {
        expect(s.connected).toBe(true);
      }

      // 3. Uji broadcast: Kirim pesan dari socket ke-0, pastikan diterima oleh socket sampel
      const targetSampleSocket = sockets[CONCURRENT_CLIENTS - 1]!;
      const messagePromise = new Promise<{ id: string; body: string }>((resolve) => {
        targetSampleSocket.on("chat:message", (msg) => {
          resolve(msg);
        });
      });

      sockets[0]!.emit("chat:send", { body: "Halo dari uji beban 200 koneksi!" });
      const receivedMsg = await messagePromise;
      expect(receivedMsg.body).toContain("Halo dari uji beban");

      // 4. Periksa penggunaan memori saat 200 koneksi aktif
      const activeMemory = process.memoryUsage();
      const activeHeapMb = activeMemory.heapUsed / (1024 * 1024);
      const activeRssMb = activeMemory.rss / (1024 * 1024);

      // Memori stabil: untuk 200 klien + 200 server sockets dalam 1 proses,
      // heap harus tetap terkendali dengan baik (< 300 MB, rata-rata < 500 KB per soket)
      expect(activeHeapMb).toBeLessThan(300);

      // 5. Putuskan seluruh 200 koneksi secara bersamaan
      for (const s of sockets) {
        s.disconnect();
      }

      // Tunggu siklus event loop selesai
      await new Promise((r) => setTimeout(r, 300));

      for (const s of sockets) {
        expect(s.connected).toBe(false);
      }

      // 6. Catat memori setelah disconnect
      const finalMemory = process.memoryUsage();
      const finalHeapMb = finalMemory.heapUsed / (1024 * 1024);

      // Pastikan tidak ada lonjakan memori tak terkendali
      expect(finalHeapMb).toBeLessThan(300);

      // Log hasil untuk verifikasi dokumentasi
      console.log(
        `[Load Test] 200 concurrent connections: Baseline Heap=${baselineHeapMb.toFixed(1)}MB, Active Heap=${activeHeapMb.toFixed(1)}MB, RSS=${activeRssMb.toFixed(1)}MB, Final Heap=${finalHeapMb.toFixed(1)}MB. Errors=0.`,
      );
    },
    30000,
  );
});
