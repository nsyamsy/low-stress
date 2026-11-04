import type { FastifyInstance } from "fastify";
import type { Database } from "@low-stress/db";
import { createAuthMiddleware } from "../auth/middleware";
import { AppError } from "../errors";
import { getChatHistory, isChatEnabled } from "./service";

export async function registerChatRoutes(
  app: FastifyInstance,
  { db }: { db: Database },
) {
  const requireAuth = createAuthMiddleware(db);

  app.get("/api/chat/history", { preHandler: requireAuth }, async (request) => {
    // Pastikan pemain berstatus aktif (pending ditolak)
    if (request.user?.status === "pending") {
      throw new AppError("ACCOUNT_PENDING", 403);
    }
    if (request.user?.status !== "active") {
      throw new AppError("FORBIDDEN", 403);
    }

    // Pastikan chat sedang aktif
    const enabled = await isChatEnabled(db);
    if (!enabled) {
      throw new AppError("CHAT_DISABLED", 403);
    }

    const items = await getChatHistory(db, 50);
    return { items };
  });
}
