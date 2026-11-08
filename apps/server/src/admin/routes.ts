import type { FastifyInstance } from "fastify";
import type { Database } from "@low-stress/db";
import type { Env } from "../env";
import { AppError } from "../errors";
import {
  createAdminAuthMiddleware,
  createCsrfMiddleware,
  createGameGateMiddleware,
} from "../auth/middleware";
import {
  clearAdminSessionCookie,
  setAdminSessionCookie,
} from "../auth/session";
import type { LoadedGame } from "../registry/games";
import { createEmailAdapter } from "../email/adapter";
import { listAdminGames, updateAdminGame } from "../games/service";
import { updateGameSchema } from "../games/validation";
import {
  adminDeleteLudoRoom,
  adminDeleteRiotRoom,
  adminKickLudoPlayer,
  adminKickRiotPlayer,
  adminResetLudoRoom,
  adminResetRiotRoom,
  bulkUpdateUsers,
  createBannedWord,
  deleteBannedWord,
  deleteGameRun,
  deleteUserByAdmin,
  getAdminDashboard,
  getAdminLudoRoomDetail,
  getAdminRiotRoomDetail,
  getAdminSettings,
  listAdminLudoRooms,
  listAdminRiotRooms,
  listAuditLogs,
  listBannedWords,
  listGameRuns,
  listUsers,
  loginAdmin,
  logoutAdmin,
  recordAuditLog,
  resetLeaderboard,
  updateAdminSettings,
  updateBannedWord,
  updateUserStatus,
} from "./service";
import {
  adminAuditQuerySchema,
  adminBulkUserActionSchema,
  adminChatQuerySchema,
  adminCreateBannedWordSchema,
  adminLoginBodySchema,
  adminLudoKickSchema,
  adminLudoRoomsQuerySchema,
  adminRiotKickSchema,
  adminRiotRoomsQuerySchema,
  adminMuteUserSchema,
  adminResetLeaderboardSchema,
  adminRunsQuerySchema,
  adminSmtpTestSchema,
  adminUpdateBannedWordSchema,
  adminUpdateSettingsSchema,
  adminUserActionSchema,
  adminUserQuerySchema,
} from "./validation";
import {
  deleteChatMessage,
  getActiveMutes,
  getAdminChatMessages,
  muteUser,
  unmuteUser,
} from "../chat/service";

interface ChatSocketBroadcaster {
  broadcastChatStatus: (enabled: boolean) => void;
  broadcastMessageDeleted: (id: string) => void;
  notifyUserMuted: (userId: string, until: Date) => void;
}

interface FastifyWithChatSocket {
  chatSocket?: ChatSocketBroadcaster;
}
import { reloadBannedWordsCache } from "../chat/profanity-service";

export interface AdminRoutesOptions {
  db: Database;
  env: Env;
  games?: readonly LoadedGame[];
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  options: AdminRoutesOptions,
): Promise<void> {
  const { db, env, games = [] } = options;

  const requireAdminAuth = createAdminAuthMiddleware(db);
  const verifyCsrf = createCsrfMiddleware(env);
  const requireGameGate = createGameGateMiddleware(db);
  const emailAdapter = createEmailAdapter(env, app.log);

  // Gerbang game: Admin tidak boleh bisa bermain atau mengakses API game
  app.addHook("preHandler", async (request) => {
    if (request.url.startsWith("/api/games")) {
      await requireGameGate(request);
    }
  });

  // POST /api/admin/login
  app.post("/api/admin/login", async (request, reply) => {
    const parseResult = adminLoginBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new AppError("VALIDATION_FAILED", 400);
    }

    const { admin, rawToken } = await loginAdmin(
      db,
      parseResult.data,
      {
        ip: request.ip,
        userAgent: request.headers["user-agent"],
      },
    );

    setAdminSessionCookie(reply, env, request, rawToken);

    return { admin };
  });

  // POST /api/admin/logout
  app.post(
    "/api/admin/logout",
    { preHandler: [requireAdminAuth] },
    async (request, reply) => {
      const rawToken = request.cookies.ls_admin;
      if (rawToken) {
        await logoutAdmin(db, rawToken);
      }
      clearAdminSessionCookie(reply, env, request);
      return reply.status(204).send();
    },
  );

  // GET /api/admin/me
  app.get(
    "/api/admin/me",
    { preHandler: [requireAdminAuth] },
    async (request) => {
      return {
        admin: {
          id: request.admin!.id,
          username: request.admin!.username,
        },
      };
    },
  );

  // GET /api/admin/dashboard
  app.get(
    "/api/admin/dashboard",
    { preHandler: [requireAdminAuth] },
    async () => {
      return getAdminDashboard(db);
    },
  );

  // GET /api/admin/users
  app.get(
    "/api/admin/users",
    { preHandler: [requireAdminAuth] },
    async (request) => {
      const parseResult = adminUserQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        throw new AppError("VALIDATION_FAILED", 400);
      }

      return listUsers(db, parseResult.data);
    },
  );

  // PATCH /api/admin/users/:id
  app.patch(
    "/api/admin/users/:id",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request) => {
      const { id } = request.params as { id: string };
      const parseResult = adminUserActionSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new AppError("VALIDATION_FAILED", 400);
      }

      const result = await updateUserStatus(
        db,
        request.admin!.id,
        id,
        parseResult.data.action,
      );

      return result;
    },
  );

  // POST /api/admin/users/bulk
  app.post(
    "/api/admin/users/bulk",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request) => {
      const parseResult = adminBulkUserActionSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new AppError("VALIDATION_FAILED", 400);
      }

      const result = await bulkUpdateUsers(
        db,
        request.admin!.id,
        parseResult.data.ids,
        parseResult.data.action,
      );

      return result;
    },
  );

  // DELETE /api/admin/users/:id
  app.delete(
    "/api/admin/users/:id",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await deleteUserByAdmin(db, request.admin!.id, id, games);
      return reply.status(204).send();
    },
  );

  // GET /api/admin/settings
  app.get(
    "/api/admin/settings",
    { preHandler: [requireAdminAuth] },
    async () => {
      return getAdminSettings(db, env);
    },
  );

  // PATCH /api/admin/settings
  app.patch(
    "/api/admin/settings",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request) => {
      const parseResult = adminUpdateSettingsSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new AppError("VALIDATION_FAILED", 400);
      }

      const updated = await updateAdminSettings(
        db,
        request.admin!.id,
        env,
        parseResult.data,
      );

      if (parseResult.data.chatEnabled !== undefined) {
        (app as unknown as FastifyWithChatSocket).chatSocket?.broadcastChatStatus(parseResult.data.chatEnabled);
      }

      return updated;
    },
  );

  // POST /api/admin/settings/smtp-test
  app.post(
    "/api/admin/settings/smtp-test",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request, reply) => {
      const parseResult = adminSmtpTestSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new AppError("VALIDATION_FAILED", 400);
      }

      const settingsData = await getAdminSettings(db, env);
      if (!settingsData.smtp.configured) {
        throw new AppError("SMTP_NOT_CONFIGURED", 409);
      }

      await emailAdapter.send({
        to: parseResult.data.to,
        subject: "Low Stress — Uji Koneksi Email SMTP",
        text: "Koneksi SMTP berhasil terhubung dan email uji ini dikirim oleh panel admin Low Stress.",
      });

      return reply.status(204).send();
    },
  );

  // GET /api/admin/audit
  app.get(
    "/api/admin/audit",
    { preHandler: [requireAdminAuth] },
    async (request) => {
      const parseResult = adminAuditQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        throw new AppError("VALIDATION_FAILED", 400);
      }

      return listAuditLogs(db, parseResult.data);
    },
  );

  // GET /api/admin/games
  app.get(
    "/api/admin/games",
    { preHandler: [requireAdminAuth] },
    async () => {
      return listAdminGames(db, games);
    },
  );

  // PATCH /api/admin/games/:id
  app.patch(
    "/api/admin/games/:id",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request) => {
      const { id } = request.params as { id: string };
      const parseResult = updateGameSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new AppError("VALIDATION_FAILED", 400);
      }

      return updateAdminGame(db, request.admin!.id, id, parseResult.data);
    },
  );

  // GET /api/admin/runs (API_Spec §6)
  app.get(
    "/api/admin/runs",
    { preHandler: [requireAdminAuth] },
    async (request) => {
      const parseResult = adminRunsQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        throw new AppError("VALIDATION_FAILED", 400);
      }

      return listGameRuns(db, parseResult.data);
    },
  );

  // GET /api/admin/games/:id/runs (alias terarah)
  app.get(
    "/api/admin/games/:id/runs",
    { preHandler: [requireAdminAuth] },
    async (request) => {
      const { id } = request.params as { id: string };
      const parseResult = adminRunsQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        throw new AppError("VALIDATION_FAILED", 400);
      }

      return listGameRuns(db, { ...parseResult.data, gameId: id });
    },
  );

  // DELETE /api/admin/runs/:id (API_Spec §6)
  app.delete(
    "/api/admin/runs/:id",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await deleteGameRun(db, request.admin!.id, id);
      return reply.status(204).send();
    },
  );

  // POST /api/admin/leaderboard/:gameId/reset (API_Spec §6)
  app.post(
    "/api/admin/leaderboard/:gameId/reset",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request) => {
      const { gameId } = request.params as { gameId: string };
      const parseResult = adminResetLeaderboardSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new AppError("VALIDATION_FAILED", 400);
      }

      return resetLeaderboard(
        db,
        request.admin!.id,
        gameId,
        parseResult.data.period,
      );
    },
  );

  // Moderasi Ludo (API_Spec §10)
  // GET /api/admin/ludo/rooms?status=
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

  // GET /api/admin/ludo/rooms/:id
  app.get(
    "/api/admin/ludo/rooms/:id",
    { preHandler: [requireAdminAuth] },
    async (request) => {
      const { id } = request.params as { id: string };
      return getAdminLudoRoomDetail(db, id);
    },
  );

  // POST /api/admin/ludo/rooms/:id/reset
  app.post(
    "/api/admin/ludo/rooms/:id/reset",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request) => {
      const { id } = request.params as { id: string };
      return adminResetLudoRoom(db, request.admin!.id, id);
    },
  );

  // POST /api/admin/ludo/rooms/:id/kick
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

  // DELETE /api/admin/ludo/rooms/:id
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
  // GET /api/admin/riot/rooms?status=
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

  // GET /api/admin/riot/rooms/:id
  app.get(
    "/api/admin/riot/rooms/:id",
    { preHandler: [requireAdminAuth] },
    async (request) => {
      const { id } = request.params as { id: string };
      return getAdminRiotRoomDetail(db, id);
    },
  );

  // POST /api/admin/riot/rooms/:id/reset
  app.post(
    "/api/admin/riot/rooms/:id/reset",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request) => {
      const { id } = request.params as { id: string };
      return adminResetRiotRoom(db, request.admin!.id, id);
    },
  );

  // POST /api/admin/riot/rooms/:id/kick
  app.post(
    "/api/admin/riot/rooms/:id/kick",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request) => {
      const { id } = request.params as { id: string };
      const parseResult = adminRiotKickSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new AppError("VALIDATION_FAILED", 400);
      }
      return adminKickRiotPlayer(db, request.admin!.id, id, parseResult.data.userId);
    },
  );

  // DELETE /api/admin/riot/rooms/:id
  app.delete(
    "/api/admin/riot/rooms/:id",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await adminDeleteRiotRoom(db, request.admin!.id, id);
      return reply.status(204).send();
    },
  );

  // Moderasi Chat (API_Spec §11)
  // GET /api/admin/chat?page=
  app.get(
    "/api/admin/chat",
    { preHandler: [requireAdminAuth] },
    async (request) => {
      const parse = adminChatQuerySchema.safeParse(request.query);
      if (!parse.success) {
        throw new AppError("VALIDATION_FAILED", 400);
      }
      return getAdminChatMessages(db, parse.data.page, parse.data.limit);
    },
  );

  // DELETE /api/admin/chat/:id
  app.delete(
    "/api/admin/chat/:id",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const deleted = await deleteChatMessage(db, id);
      if (!deleted) {
        throw new AppError("NOT_FOUND", 404, { id });
      }

      await recordAuditLog(db, {
        adminId: request.admin!.id,
        action: "chat_delete_message",
        targetType: "chat_message",
        targetId: id,
      });

      // Siarkan seketika ke seluruh klien socket bahwa pesan dihapus
      (app as unknown as FastifyWithChatSocket).chatSocket?.broadcastMessageDeleted(id);

      return reply.status(204).send();
    },
  );

  // GET /api/admin/chat/mutes
  app.get(
    "/api/admin/chat/mutes",
    { preHandler: [requireAdminAuth] },
    async () => {
      return getActiveMutes(db);
    },
  );

  // POST /api/admin/chat/mute
  app.post(
    "/api/admin/chat/mute",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request) => {
      const parse = adminMuteUserSchema.safeParse(request.body);
      if (!parse.success) {
        throw new AppError("VALIDATION_FAILED", 400);
      }

      const mutedUntil = await muteUser(
        db,
        parse.data.userId,
        parse.data.minutes,
        parse.data.reason,
        request.admin!.id,
      );

      await recordAuditLog(db, {
        adminId: request.admin!.id,
        action: "chat_mute_user",
        targetType: "user",
        targetId: parse.data.userId,
        detail: {
          minutes: parse.data.minutes,
          reason: parse.data.reason,
          mutedUntil: mutedUntil.toISOString(),
        },
      });

      // Beritahu soket pemain yang dibisukan
      (app as unknown as FastifyWithChatSocket).chatSocket?.notifyUserMuted(parse.data.userId, mutedUntil);

      return { ok: true, mutedUntil: mutedUntil.toISOString() };
    },
  );

  // DELETE /api/admin/chat/mute/:userId
  app.delete(
    "/api/admin/chat/mute/:userId",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };
      await unmuteUser(db, userId);

      await recordAuditLog(db, {
        adminId: request.admin!.id,
        action: "chat_unmute_user",
        targetType: "user",
        targetId: userId,
      });

      return reply.status(204).send();
    },
  );

  // Kelola Kata Terlarang (API_Spec §11)
  // GET /api/admin/banned-words
  app.get(
    "/api/admin/banned-words",
    { preHandler: [requireAdminAuth] },
    async () => {
      return listBannedWords(db);
    },
  );

  // POST /api/admin/banned-words
  app.post(
    "/api/admin/banned-words",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request, reply) => {
      const parse = adminCreateBannedWordSchema.safeParse(request.body);
      if (!parse.success) {
        throw new AppError("VALIDATION_FAILED", 400);
      }

      const row = await createBannedWord(
        db,
        request.admin!.id,
        parse.data.word,
        parse.data.lang,
      );

      await reloadBannedWordsCache(db);
      return reply.status(201).send(row);
    },
  );

  // PATCH /api/admin/banned-words/:id
  app.patch(
    "/api/admin/banned-words/:id",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request) => {
      const { id } = request.params as { id: string };
      const parse = adminUpdateBannedWordSchema.safeParse(request.body);
      if (!parse.success) {
        throw new AppError("VALIDATION_FAILED", 400);
      }

      const row = await updateBannedWord(
        db,
        request.admin!.id,
        id,
        parse.data.enabled,
      );

      await reloadBannedWordsCache(db);
      return row;
    },
  );

  // DELETE /api/admin/banned-words/:id
  app.delete(
    "/api/admin/banned-words/:id",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await deleteBannedWord(db, request.admin!.id, id);
      await reloadBannedWordsCache(db);
      return reply.status(204).send();
    },
  );
}
