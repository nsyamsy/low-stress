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
  bulkUpdateUsers,
  deleteGameRun,
  deleteUserByAdmin,
  getAdminDashboard,
  getAdminSettings,
  listAuditLogs,
  listGameRuns,
  listUsers,
  loginAdmin,
  logoutAdmin,
  resetLeaderboard,
  updateAdminSettings,
  updateUserStatus,
} from "./service";
import {
  adminAuditQuerySchema,
  adminBulkUserActionSchema,
  adminLoginBodySchema,
  adminResetLeaderboardSchema,
  adminRunsQuerySchema,
  adminSmtpTestSchema,
  adminUpdateSettingsSchema,
  adminUserActionSchema,
  adminUserQuerySchema,
} from "./validation";
import {
  registerAdminChatRoutes,
  type FastifyWithChatSocket,
} from "./routes/chat";
import { registerAdminRoomRoutes } from "./routes/rooms";

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

  app.addHook("preHandler", async (request) => {
    if (request.url.startsWith("/api/games")) {
      await requireGameGate(request);
    }
  });

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

  app.get(
    "/api/admin/dashboard",
    { preHandler: [requireAdminAuth] },
    async () => {
      return getAdminDashboard(db);
    },
  );

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

  app.patch(
    "/api/admin/users/:id",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request) => {
      const { id } = request.params as { id: string };
      const parseResult = adminUserActionSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new AppError("VALIDATION_FAILED", 400);
      }

      return updateUserStatus(
        db,
        request.admin!.id,
        id,
        parseResult.data.action,
      );
    },
  );

  app.post(
    "/api/admin/users/bulk",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request) => {
      const parseResult = adminBulkUserActionSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new AppError("VALIDATION_FAILED", 400);
      }

      return bulkUpdateUsers(
        db,
        request.admin!.id,
        parseResult.data.ids,
        parseResult.data.action,
      );
    },
  );

  app.delete(
    "/api/admin/users/:id",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await deleteUserByAdmin(db, request.admin!.id, id, games);
      return reply.status(204).send();
    },
  );

  app.get(
    "/api/admin/settings",
    { preHandler: [requireAdminAuth] },
    async () => {
      return getAdminSettings(db, env);
    },
  );

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
        (app as unknown as FastifyWithChatSocket).chatSocket?.broadcastChatStatus(
          parseResult.data.chatEnabled,
        );
      }

      return updated;
    },
  );

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

  app.get(
    "/api/admin/games",
    { preHandler: [requireAdminAuth] },
    async () => {
      return listAdminGames(db, games);
    },
  );

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

  app.delete(
    "/api/admin/runs/:id",
    { preHandler: [requireAdminAuth, verifyCsrf] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await deleteGameRun(db, request.admin!.id, id, games);
      return reply.status(204).send();
    },
  );

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
        games,
      );
    },
  );

  registerAdminRoomRoutes(app, {
    db,
    games,
    requireAdminAuth,
    verifyCsrf,
  });

  registerAdminChatRoutes(app, {
    db,
    requireAdminAuth,
    verifyCsrf,
  });
}
