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
import { expireInactiveRooms, startLudoExpirationJob } from "./expiration.js";
import { setLudoCensor } from "./service.js";
import {
  ludoRooms,
  ludoPlayers,
  ludoMessages,
  eq,
  and,
} from "@low-stress/sdk/server";
import type { AutopilotOptions } from "./autopilot.js";

let currentAutopilot:
  | {
      stopAll: () => void;
      clearRoom: (roomId: string) => void;
      onRoomUpdated: (roomId: string) => Promise<void>;
    }
  | undefined;
let currentExpirationJob: { stop: () => void } | undefined;

export const serverModule: GameServerModule = {
  registerRoutes(app: unknown, ctx: GameServerContext) {
    const censorFn =
      (ctx as GameServerContext & { censorText?: (text: string) => string })
        ?.censorText ??
      (typeof ctx.options?.censorText === "function"
        ? (ctx.options.censorText as (text: string) => string)
        : undefined);
    if (censorFn) {
      setLudoCensor(censorFn);
    }
    registerLudoRoutes(app as FastifyInstance, {
      db: ctx.db as Database,
      io: ctx.io as SocketIOServer | undefined,
    });
  },

  registerRealtime(io: unknown, ctx: GameServerContext) {
    const { autopilot } = setupLudoSocket(
      io as SocketIOServer,
      ctx.db as Database,
      ctx.options?.ludoAutopilot as AutopilotOptions | undefined,
      ctx,
    );
    currentAutopilot = autopilot;
    currentExpirationJob?.stop();
    const expirationJob = startLudoExpirationJob(
      ctx.db as Database,
      io as SocketIOServer,
    );
    currentExpirationJob = expirationJob;
  },

  registerJobs(ctx: GameServerContext): GameJob[] {
    return [
      {
        name: "ludo-expiration",
        intervalMs: 60 * 60 * 1000,
        run: async () => {
          const nsp = ctx.io
            ? (ctx.io as SocketIOServer).of("/ludo")
            : undefined;
          await expireInactiveRooms(
            ctx.db as Database,
            nsp,
            currentAutopilot,
          );
        },
        stop: () => {
          currentExpirationJob?.stop();
        },
      },
    ];
  },

  async onUserDeleted({ userId, db }: GameUserDeletedContext) {
    const database = db as Database;

    // Cari room aktif di mana userId menjadi pemain di seatUsers sebelum menghapus ludoPlayers
    const activeRooms = await database
      .select({ id: ludoRooms.id, seatUsers: ludoRooms.seatUsers })
      .from(ludoRooms)
      .where(eq(ludoRooms.status, "playing"));

    const affectedRoomIds = activeRooms
      .filter((r) => (r.seatUsers ?? []).includes(userId))
      .map((r) => r.id);

    for (const roomId of affectedRoomIds) {
      await database
        .update(ludoPlayers)
        .set({ autopilot: true })
        .where(
          and(
            eq(ludoPlayers.roomId, roomId),
            eq(ludoPlayers.userId, userId),
          ),
        );
    }

    await database.delete(ludoPlayers).where(eq(ludoPlayers.userId, userId));
    await database.delete(ludoMessages).where(eq(ludoMessages.userId, userId));
    await database.delete(ludoRooms).where(eq(ludoRooms.hostId, userId));

    for (const roomId of affectedRoomIds) {
      if (currentAutopilot) {
        void currentAutopilot.onRoomUpdated(roomId);
      }
    }
  },

  dispose() {
    currentExpirationJob?.stop();
    currentAutopilot?.stopAll();
  },
};

export default serverModule;
