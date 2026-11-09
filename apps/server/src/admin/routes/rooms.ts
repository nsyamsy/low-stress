import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { Database } from "@low-stress/db";
import { AppError } from "../../errors";
import type { LoadedGame } from "../../registry/games";
import {
  adminDeleteLudoRoom,
  adminDeleteRiotRoom,
  adminKickLudoPlayer,
  adminKickRiotPlayer,
  adminResetLudoRoom,
  adminResetRiotRoom,
  getAdminLudoRoomDetail,
  getAdminRiotRoomDetail,
  listAdminLudoRooms,
  listAdminRiotRooms,
} from "../service";
import {
  adminLudoKickSchema,
  adminLudoRoomsQuerySchema,
  adminRiotKickSchema,
  adminRiotRoomsQuerySchema,
} from "../validation";

export function registerAdminRoomRoutes(
  app: FastifyInstance,
  options: {
    db: Database;
    games: readonly LoadedGame[];
    requireAdminAuth: preHandlerHookHandler;
    verifyCsrf: preHandlerHookHandler;
  },
): void {
  const { db, games, requireAdminAuth, verifyCsrf } = options;

  // Moderasi Ludo (API_Spec §10)
  app.get(
    "/api/admin/ludo/rooms",
    { preHandler: [requireAdminAuth] },
    async (request) => {
      const parseResult = adminLudoRoomsQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        throw new AppError("VALIDATION_FAILED", 400);
      }
      return listAdminLudoRooms(db, parseResult.data.status);
    },
  );

  app.get(
    "/api/admin/ludo/rooms/:id",
    { preHandler: [requireAdminAuth] },
    async (request) => {
      const { id } = request.params as { id: string };
      return getAdminLudoRoomDetail(db, id);
    },
  );

  app.post(
    "/api/admin/ludo/rooms/:id/reset",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request) => {
      const { id } = request.params as { id: string };
      return adminResetLudoRoom(db, request.admin!.id, id);
    },
  );

  app.post(
    "/api/admin/ludo/rooms/:id/kick",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request) => {
      const { id } = request.params as { id: string };
      const parseResult = adminLudoKickSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new AppError("VALIDATION_FAILED", 400);
      }
      return adminKickLudoPlayer(db, request.admin!.id, id, parseResult.data.userId);
    },
  );

  app.delete(
    "/api/admin/ludo/rooms/:id",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await adminDeleteLudoRoom(db, request.admin!.id, id);
      return reply.status(204).send();
    },
  );

  // Moderasi Riot (RT-51, API_Spec §10)
  app.get(
    "/api/admin/riot/rooms",
    { preHandler: [requireAdminAuth] },
    async (request) => {
      const parseResult = adminRiotRoomsQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        throw new AppError("VALIDATION_FAILED", 400);
      }
      return listAdminRiotRooms(db, parseResult.data.status);
    },
  );

  app.get(
    "/api/admin/riot/rooms/:id",
    { preHandler: [requireAdminAuth] },
    async (request) => {
      const { id } = request.params as { id: string };
      return getAdminRiotRoomDetail(db, id);
    },
  );

  app.post(
    "/api/admin/riot/rooms/:id/reset",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request) => {
      const { id } = request.params as { id: string };
      return adminResetRiotRoom(db, request.admin!.id, id, games);
    },
  );

  app.post(
    "/api/admin/riot/rooms/:id/kick",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request) => {
      const { id } = request.params as { id: string };
      const parseResult = adminRiotKickSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new AppError("VALIDATION_FAILED", 400);
      }
      return adminKickRiotPlayer(
        db,
        request.admin!.id,
        id,
        parseResult.data.userId,
        games,
      );
    },
  );

  app.delete(
    "/api/admin/riot/rooms/:id",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await adminDeleteRiotRoom(db, request.admin!.id, id, games);
      return reply.status(204).send();
    },
  );
}
