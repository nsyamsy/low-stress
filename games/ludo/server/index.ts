import type {
  GameServerModule,
  GameServerContext,
  GameJob,
  GameUserDeletedContext,
  Database,
} from "@low-stress/sdk/server";
import type { FastifyInstance } from "fastify";
import type { Server as SocketIOServer } from "socket.io";
import { registerLudoRoutes } from "./routes.js";
import { setupLudoSocket } from "./socket.js";
import { startLudoExpirationJob } from "./expiration.js";
import { ludoRooms, ludoPlayers, ludoMessages, eq } from "@low-stress/sdk/server";
import type { AutopilotOptions } from "./autopilot.js";

let currentAutopilot: { stopAll: () => void } | undefined;
let currentExpirationJob: { stop: () => void } | undefined;

export const serverModule: GameServerModule = {
  registerRoutes(app: unknown, ctx: GameServerContext) {
    registerLudoRoutes(app as FastifyInstance, { db: ctx.db as Database });
  },

  registerRealtime(io: unknown, ctx: GameServerContext) {
    const { autopilot } = setupLudoSocket(
      io as SocketIOServer,
      ctx.db as Database,
      ctx.options?.ludoAutopilot as AutopilotOptions | undefined,
      ctx,
    );
    currentAutopilot = autopilot;
    const expirationJob = startLudoExpirationJob(ctx.db as Database, io as SocketIOServer);
    currentExpirationJob = expirationJob;
  },

  registerJobs(ctx: GameServerContext): GameJob[] {
    return [
      {
        name: "ludo-expiration",
        intervalMs: 60 * 60 * 1000,
        run: async () => {
          if (ctx.io) {
            await startLudoExpirationJob(ctx.db as Database, ctx.io as SocketIOServer);
          }
        },
        stop: () => {
          currentExpirationJob?.stop();
        },
      },
    ];
  },

  async onUserDeleted({ userId, db }: GameUserDeletedContext) {
    const database = db as Database;
    await database.delete(ludoPlayers).where(eq(ludoPlayers.userId, userId));
    await database.delete(ludoMessages).where(eq(ludoMessages.userId, userId));
    await database.delete(ludoRooms).where(eq(ludoRooms.hostId, userId));
  },

  dispose() {
    currentExpirationJob?.stop();
    currentAutopilot?.stopAll();
  },
};

export default serverModule;
