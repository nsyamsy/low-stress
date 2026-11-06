import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Database } from "@low-stress/sdk/server";
import { AppError } from "./errors";
import {
  createRoom,
  deleteRoom,
  getRoomView,
  listRooms,
  searchInvitableUsers,
} from "./service";
import type { LudoActor } from "./types";

const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(60),
  maxPlayers: z.number().int().min(2).max(12).optional(),
  play: z.boolean().optional(),
});

function getActor(request: FastifyRequest): LudoActor {
  const reqWithUser = request as FastifyRequest & {
    user?: { id: string; username: string; displayName: string };
  };
  const user = reqWithUser.user;
  if (!user) {
    throw new AppError("UNAUTHENTICATED", 401);
  }
  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
  };
}

export function registerLudoRoutes(
  app: FastifyInstance,
  options: { db: Database },
) {
  const { db } = options;

  // GET /api/games/ludo/rooms
  app.get("/api/games/ludo/rooms", async (request) => {
    const actor = getActor(request);
    const items = await listRooms(db, actor);
    return { items };
  });

  // POST /api/games/ludo/rooms
  app.post("/api/games/ludo/rooms", async (request, reply) => {
    const actor = getActor(request);
    const body = createRoomSchema.parse(request.body);
    const id = await createRoom(
      db,
      actor,
      body.name,
      body.maxPlayers,
      body.play ?? true,
    );
    return reply.status(201).send({ id });
  });

  // GET /api/games/ludo/rooms/:id
  app.get(
    "/api/games/ludo/rooms/:id",
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      const actor = getActor(request);
      const roomId = request.params.id;
      return getRoomView(db, roomId, actor);
    },
  );

  // DELETE /api/games/ludo/rooms/:id
  app.delete(
    "/api/games/ludo/rooms/:id",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const actor = getActor(request);
      const roomId = request.params.id;
      await deleteRoom(db, roomId, actor);
      return reply.status(204).send();
    },
  );

  // GET /api/games/ludo/users/search?q=
  app.get(
    "/api/games/ludo/users/search",
    async (request: FastifyRequest<{ Querystring: { q?: string } }>) => {
      getActor(request); // Autentikasi
      const q = request.query.q || "";
      const items = await searchInvitableUsers(db, q);
      return { items };
    },
  );
}
