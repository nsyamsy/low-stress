import type { Server, Socket } from "socket.io";
import type { Database } from "@low-stress/db";
import {
  ADMIN_COOKIE_NAME,
  getAdminSession,
  getSessionUser,
  SESSION_COOKIE_NAME,
} from "../auth/session";
import { AppError } from "../errors";
import { checkGameGate } from "../games/service";
import {
  AutopilotManager,
  type AutopilotOptions,
} from "./autopilot";
import {
  getRoomView,
  performAction,
} from "./service";
import type { LudoAction, LudoActor, RoomView } from "./types";

function parseCookies(cookieHeader?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;

  cookieHeader.split(";").forEach((cookie) => {
    const parts = cookie.split("=");
    const key = parts.shift()?.trim();
    if (key) {
      list[key] = decodeURIComponent(parts.join("=").trim());
    }
  });

  return list;
}

export function setupLudoSocket(
  io: Server,
  db: Database,
  options?: AutopilotOptions,
) {
  const nsp = io.of("/ludo");
  const autopilot = new AutopilotManager(nsp, db, options);

  // Resume running rooms after startup/restart
  void autopilot.resumeActiveRooms();

  // Middleware autentikasi soket via session cookie
  nsp.use(async (socket: Socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      const sessionToken = cookies[SESSION_COOKIE_NAME];
      const adminToken = cookies[ADMIN_COOKIE_NAME];

      if (sessionToken) {
        const sessionResult = await getSessionUser(db, sessionToken);
        if (sessionResult && sessionResult.user.status === "active") {
          socket.data.user = sessionResult.user;
          return next();
        }
      }

      if (adminToken) {
        const adminResult = await getAdminSession(db, adminToken);
        if (adminResult) {
          socket.data.admin = adminResult.admin;
          return next();
        }
      }

      return next(new Error("UNAUTHENTICATED"));
    } catch {
      return next(new Error("INTERNAL_ERROR"));
    }
  });

  nsp.on("connection", (socket: Socket) => {
    const user = socket.data.user;
    const admin = socket.data.admin;

    const actor: LudoActor = user
      ? {
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
        }
      : {
          userId: admin.id,
          username: admin.username,
          displayName: admin.username,
          isAdmin: true,
        };

    // Bergabung ke room pribadi per user
    void socket.join(`user:${actor.userId}`);

    // room:join
    socket.on(
      "room:join",
      async (
        payload: { roomId: string },
        callback?: (res: { ok: boolean; view?: RoomView; code?: string }) => void,
      ) => {
        try {
          const { roomId } = payload || {};
          if (!roomId || typeof roomId !== "string") {
            callback?.({ ok: false, code: "VALIDATION_FAILED" });
            return;
          }

          if (!actor.isAdmin) {
            await checkGameGate(db, "ludo");
          }

          const view = await getRoomView(db, roomId, actor);
          await socket.join(`ludo:${roomId}`);
          callback?.({ ok: true, view });
        } catch (err) {
          const code =
            err instanceof AppError
              ? err.code
              : "INTERNAL";
          callback?.({ ok: false, code });
        }
      },
    );

    // room:leave
    socket.on("room:leave", async (payload: { roomId: string }) => {
      const { roomId } = payload || {};
      if (roomId && typeof roomId === "string") {
        await socket.leave(`ludo:${roomId}`);
      }
    });

    // room:action
    socket.on(
      "room:action",
      async (
        payload: { roomId: string } & LudoAction,
        callback?: (res: { ok: boolean; view?: RoomView; code?: string }) => void,
      ) => {
        try {
          const { roomId, ...action } = payload || {};
          if (!roomId || typeof roomId !== "string") {
            callback?.({ ok: false, code: "VALIDATION_FAILED" });
            return;
          }

          if (!actor.isAdmin) {
            await checkGameGate(db, "ludo");
          }

          const result = await performAction(
            db,
            roomId,
            actor,
            action as LudoAction,
          );

          // Siarkan view yang dipersonalisasi untuk setiap socket yang ada di room
          const socketsInRoom = await nsp.in(`ludo:${roomId}`).fetchSockets();
          for (const s of socketsInRoom) {
            const socketUser = s.data.user;
            const socketAdmin = s.data.admin;
            const targetActor: LudoActor = socketUser
              ? {
                  userId: socketUser.id,
                  username: socketUser.username,
                  displayName: socketUser.displayName,
                }
              : {
                  userId: socketAdmin.id,
                  username: socketAdmin.username,
                  displayName: socketAdmin.username,
                  isAdmin: true,
                };
            try {
              const personalView = await getRoomView(db, roomId, targetActor);
              s.emit("room:state", personalView);
            } catch {
              // Abaikan jika bukan anggota lagi
            }
          }

          // Siarkan umpan event jika ada
          if (result.event) {
            nsp.to(`ludo:${roomId}`).emit("room:event", result.event);
          }

          // Siarkan chat jika aksi adalah chat
          if (result.chatMessage) {
            nsp.to(`ludo:${roomId}`).emit("room:chat", result.chatMessage);
          }

          // Perbarui autopilot timer untuk room ini
          if (result.view.status === "playing") {
            void autopilot.onRoomUpdated(roomId);
          } else {
            autopilot.clearRoom(roomId);
          }

          callback?.({ ok: true, view: result.view });
        } catch (err) {
          const code =
            err instanceof AppError
              ? err.code
              : "INTERNAL";
          callback?.({ ok: false, code });
        }
      },
    );
  });

  return { nsp, autopilot };
}
