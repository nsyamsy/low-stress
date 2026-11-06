import type { GameJob, GameServerModule, GameUserDeletedContext } from "@low-stress/sdk/server";
import type { Server as SocketIOServer } from "socket.io";
import { RiotGameService } from "./service";
import { setupRiotSocket } from "./socket";

let globalService: RiotGameService | undefined;
let stopLoop: (() => void) | undefined;

export const serverModule: GameServerModule = {
  registerRealtime(io: unknown) {
    globalService = new RiotGameService();
    const { service, stopTickLoop } = setupRiotSocket(io as SocketIOServer, globalService);
    globalService = service;
    stopLoop = stopTickLoop;
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
