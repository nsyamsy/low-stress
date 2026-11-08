import type { FastifyInstance } from "fastify";
import { computeExpirationCutoff } from "@low-stress/sdk";
import {
  type Database,
  eq,
  type GameJob,
  type GameServerContext,
  type GameServerModule,
  type GameUserDeletedContext,
  lt,
  riotProfiles,
  riotRoomPlayers,
  riotRooms,
} from "@low-stress/sdk/server";
import type { Server as SocketIOServer } from "socket.io";
import { registerRiotProfileRoutes } from "./profile";
import { hydrateRiotRooms } from "./hydrate";
import { RiotGameService } from "./service";
import { setupRiotSocket, type SetupRiotSocketResult } from "./socket";

let globalService: RiotGameService | undefined;
let socketControl: SetupRiotSocketResult | undefined;
let stopLoop: (() => void) | undefined;

export function adminResetRiotRoomInMemory(roomId: string): boolean {
  if (socketControl) {
    return socketControl.adminResetRoom(roomId);
  }
  return globalService?.adminResetRoom(roomId) ?? false;
}

export function adminKickRiotPlayerInMemory(roomId: string, userId: string): boolean {
  if (socketControl) {
    return socketControl.adminKickPlayer(roomId, userId);
  }
  return globalService?.adminKickPlayer(roomId, userId).removed ?? false;
}

export function adminDeleteRiotRoomInMemory(roomId: string): boolean {
  if (socketControl) {
    return socketControl.adminDeleteRoom(roomId);
  }
  return globalService?.adminDeleteRoom(roomId) ?? false;
}

export interface RiotServerModule extends GameServerModule {
  adminResetRiotRoomInMemory: (roomId: string) => boolean;
  adminKickRiotPlayerInMemory: (roomId: string, userId: string) => boolean;
  adminDeleteRiotRoomInMemory: (roomId: string) => boolean;
}

export const serverModule: RiotServerModule = {
  registerRoutes(app: unknown, ctx: GameServerContext) {
    registerRiotProfileRoutes(app as FastifyInstance, ctx.db as Database);
  },

  registerRealtime(io: unknown, ctx: GameServerContext) {
    globalService = new RiotGameService();
    const res = setupRiotSocket(io as SocketIOServer, globalService, ctx);
    socketControl = res;
    globalService = res.service;
    stopLoop = res.stopTickLoop;
    void hydrateRiotRooms(res.service, ctx);
  },

  registerJobs(regCtx?: GameServerContext): GameJob[] {
    return [
      {
        name: "riot-expiration",
        intervalMs: 60 * 60 * 1000, // hourly
        run: async (runCtx?: GameServerContext) => {
          globalService?.cleanupExpiredRooms(1);
          const db = (runCtx?.db ?? regCtx?.db) as Database | undefined;
          if (db) {
            const cutoff = computeExpirationCutoff(1);
            await db.delete(riotRooms).where(lt(riotRooms.lastActivityAt, cutoff));
          }
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
          if (socketControl) {
            socketControl.adminKickPlayer(room.id, context.userId);
          } else {
            globalService.leaveRoom(room.id, context.userId);
          }
        }
      }
    }
    const db = context.db as Database | undefined;
    if (db) {
      await db.delete(riotRoomPlayers).where(eq(riotRoomPlayers.userId, context.userId));
      await db.delete(riotProfiles).where(eq(riotProfiles.userId, context.userId));
      await db.delete(riotRooms).where(eq(riotRooms.hostId, context.userId));
    }
  },

  dispose() {
    stopLoop?.();
  },

  adminResetRiotRoomInMemory,
  adminKickRiotPlayerInMemory,
  adminDeleteRiotRoomInMemory,
};

export const riotServerModule = serverModule;

export default serverModule;
