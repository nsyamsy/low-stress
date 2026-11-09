import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { Database } from "@low-stress/db";
import { reloadBannedWordsCache } from "../../chat/profanity-service";
import {
  deleteChatMessage,
  getActiveMutes,
  getAdminChatMessages,
  muteUser,
  unmuteUser,
} from "../../chat/service";
import { AppError } from "../../errors";
import {
  createBannedWord,
  deleteBannedWord,
  listBannedWords,
  recordAuditLog,
  updateBannedWord,
} from "../service";
import {
  adminChatQuerySchema,
  adminCreateBannedWordSchema,
  adminMuteUserSchema,
  adminUpdateBannedWordSchema,
} from "../validation";

export interface ChatSocketBroadcaster {
  broadcastChatStatus: (enabled: boolean) => void;
  broadcastMessageDeleted: (id: string) => void;
  notifyUserMuted: (userId: string, until: Date) => void;
}

export interface FastifyWithChatSocket {
  chatSocket?: ChatSocketBroadcaster;
}

export function registerAdminChatRoutes(
  app: FastifyInstance,
  options: {
    db: Database;
    requireAdminAuth: preHandlerHookHandler;
    verifyCsrf: preHandlerHookHandler;
  },
): void {
  const { db, requireAdminAuth, verifyCsrf } = options;

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

      (app as unknown as FastifyWithChatSocket).chatSocket?.broadcastMessageDeleted(id);

      return reply.status(204).send();
    },
  );

  app.get(
    "/api/admin/chat/mutes",
    { preHandler: [requireAdminAuth] },
    async () => {
      return getActiveMutes(db);
    },
  );

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

      (app as unknown as FastifyWithChatSocket).chatSocket?.notifyUserMuted(
        parse.data.userId,
        mutedUntil,
      );

      return { ok: true, mutedUntil: mutedUntil.toISOString() };
    },
  );

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

  app.get(
    "/api/admin/banned-words",
    { preHandler: [requireAdminAuth] },
    async () => {
      return listBannedWords(db);
    },
  );

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
