import { describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import fastify from "fastify";
import { Server as SocketIOServer } from "socket.io";
import { loadGameServerModules, type LoadedGame } from "../src/registry/games";
import type { GameServerContext, GameServerModule } from "@low-stress/sdk/server";

describe("RT-01: GameServerModule and Generic Registry Loading", () => {
  it("generically initializes routes, realtime namespace, and background jobs from game server modules", async () => {
    const app = fastify();
    const io = new SocketIOServer();

    let routesRegistered = false;
    let realtimeRegistered = false;
    let jobsRegistered = false;
    let disposed = false;

    const mockModule: GameServerModule = {
      registerRoutes: (fastifyApp) => {
        routesRegistered = true;
        (fastifyApp as FastifyInstance).get("/api/games/test-game/ping", async () => ({ pong: true }));
      },
      registerRealtime: (socketServer) => {
        realtimeRegistered = true;
        expect(socketServer).toBe(io);
      },
      registerJobs: () => {
        jobsRegistered = true;
        return [
          {
            name: "test-game-job",
            intervalMs: 10000,
            run: vi.fn(),
          },
        ];
      },
      dispose: () => {
        disposed = true;
      },
    };

    const mockGame: LoadedGame = {
      manifest: {
        id: "test-game",
        version: "0.1.0",
        title: { id: "Uji", en: "Test" },
        description: { id: "Deskripsi", en: "Description" },
        icon: "icon.svg",
        mode: "multiplayer",
        mobile: { supported: true },
        client: async () => ({ default: () => null }),
        server: async () => mockModule,
      },
      path: "/fake/path/test-game/manifest.ts",
    };

    const mockCtx: GameServerContext = {
      db: {},
      io,
      env: {},
    };

    const initialized = await loadGameServerModules([mockGame], mockCtx, app, io);

    expect(routesRegistered).toBe(true);
    expect(realtimeRegistered).toBe(true);
    expect(jobsRegistered).toBe(true);
    expect(initialized.length).toBe(1);
    expect(initialized[0]!.id).toBe("test-game");
    expect(initialized[0]!.jobs.length).toBe(1);
    expect(initialized[0]!.jobs[0]!.name).toBe("test-game-job");

    // Test route works
    const res = await app.inject({ method: "GET", url: "/api/games/test-game/ping" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ pong: true });

    // Test dispose
    initialized[0]!.module.dispose?.();
    expect(disposed).toBe(true);

    await app.close();
  });
});
