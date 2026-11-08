import type { FastifyInstance } from "fastify";
import type { Database } from "@low-stress/sdk/server";
import type { GameJob, GameServerContext, GameServerModule, GameUserDeletedContext } from "@low-stress/sdk/server";
import type { Server as SocketIOServer } from "socket.io";
import { registerRiotProfileRoutes } from "./profile";
import { hydrateRiotRooms } from "./hydrate";
import { RiotGameService } from "./service";
import { setupRiotSocket } from "./socket";

let globalService: RiotGameService | undefined;
let stopLoop: (() => void) | undefined;

export const serverModule: GameServerModule = {
  registerRoutes(app: unknown, ctx: GameServerContext) {
    registerRiotProfileRoutes(app as FastifyInstance, ctx.db as Database);
  },

  registerRealtime(io: unknown, ctx: GameServerContext) {
    globalService = new RiotGameService();
    const { service, stopTickLoop } = setupRiotSocket(io as SocketIOServer, globalService, ctx);
    globalService = service;
    stopLoop = stopTickLoop;
    void hydrateRiotRooms(service, ctx);
  },

  registerJobs(): GameJob[] {
    return [
      {
        name: "riot-expiration",
        intervalMs: 60 * 60 * 1000, // hourly
        run: async () => {
          globalService?.cleanupExpiredRooms();
        },
        stop: () => {
          stopLoop?.();
        },
      },
    ];
  },

  async onUserDeleted(context: GameUserDeletedContext) {
    if (globalService) {
      for (const room of globalService.getAllRooms()) {
        if (room.players.has(context.userId)) {
          globalService.leaveRoom(room.id, context.userId);
        }
      }
    }
  },
};

export default serverModule;
