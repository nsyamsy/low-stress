import type { Server as SocketIOServer, Socket } from "socket.io";
import {
  AutopilotManager,
  type AutopilotOptions,
} from "./autopilot";
import {
  type Database,
} from "@low-stress/sdk/server";
import { getRoomView, performAction, setLudoCensor } from "./service";
import type { LudoAction, LudoActor, RoomView } from "./types";
import type { GameServerContext } from "@low-stress/sdk/server";

export function setupLudoSocket(
  io: SocketIOServer,
  db: Database,
  options: AutopilotOptions = {},
  ctx?: GameServerContext,
) {
  const censorFn =
    (ctx as GameServerContext & { censorText?: (text: string) => string })
      ?.censorText ??
    (typeof ctx?.options?.censorText === "function"
      ? (ctx.options.censorText as (text: string) => string)
      : undefined);
  if (censorFn) {
    setLudoCensor(censorFn);
  }

  const nsp = io.of("/ludo");
  const autopilot = new AutopilotManager(nsp, db, {
    ...options,
    checkGameGate: ctx?.checkGameGate,
  });

  // Resume running rooms after startup/restart
  void autopilot.resumeActiveRooms();

  // Middleware autentikasi soket via session cookie
  nsp.use(async (socket: Socket, next: (err?: Error) => void) => {
    try {
      if (ctx?.resolvePrincipal) {
        const principal = await ctx.resolvePrincipal(socket.handshake.headers.cookie);
        if (principal.kind === "user" && principal.user) {
          socket.data.user = principal.user;
          return next();
        }
        if (principal.kind === "admin") {
          return next(new Error("FORBIDDEN"));
        }
        return next(new Error("UNAUTHENTICATED"));
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

    // room:join
    socket.on(
      "room:join",
      async (
        payload: { roomId: string },
        callback?: (res: { ok: boolean; view?: RoomView; code?: string }) => void,
      ) => {
        try {
          const roomId = payload?.roomId;
          if (!roomId || typeof roomId !== "string") {
            callback?.({ ok: false, code: "VALIDATION_FAILED" });
            return;
          }

          if (!actor.isAdmin && ctx?.checkGameGate) {
            await ctx.checkGameGate("ludo");
          }

          const view = await getRoomView(db, roomId, actor);
          await socket.join(`ludo:${roomId}`);
          callback?.({ ok: true, view });
        } catch (err) {
          const code =
            err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string"
              ? (err as { code: string }).code
              : "INTERNAL";
          callback?.({ ok: false, code });
        }
      },
    );

    // room:leave
    socket.on("room:leave", async (payload: { roomId: string }) => {
      const roomId = payload?.roomId;
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

          if (!actor.isAdmin && ctx?.checkGameGate) {
            await ctx.checkGameGate("ludo");
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
            err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string"
              ? (err as { code: string }).code
              : "INTERNAL";
          callback?.({ ok: false, code });
        }
      },
    );
  });

  return { nsp, autopilot };
}
