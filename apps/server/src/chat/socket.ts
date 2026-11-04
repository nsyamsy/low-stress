import type { Server, Socket } from "socket.io";
import type { Database } from "@low-stress/db";
import {
  ADMIN_COOKIE_NAME,
  getSessionUser,
  SESSION_COOKIE_NAME,
} from "../auth/session";
import {
  getUserMute,
  isChatEnabled,
  saveChatMessage,
} from "./service";

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

export function setupPublicChatSocket(io: Server, db: Database) {
  const nsp = io.of("/public-chat");

  // Track user cooldown for rate limit (1 message / 2 seconds)
  const lastMessageTimes = new Map<string, number>();

  function broadcastPresence() {
    const uniqueUsers = new Set(
      Array.from(nsp.sockets.values())
        .map((s) => s.data.user?.id)
        .filter(Boolean),
    );
    nsp.emit("chat:presence", { online: uniqueUsers.size });
  }

  // Middleware autentikasi soket: Hanya pemain aktif, admin & pending ditolak
  nsp.use(async (socket: Socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      const sessionToken = cookies[SESSION_COOKIE_NAME];
      const adminToken = cookies[ADMIN_COOKIE_NAME];

      // Jika ada admin token dan tidak ada session token pemain, admin ditolak
      if (adminToken && !sessionToken) {
        return next(new Error("FORBIDDEN"));
      }

      if (!sessionToken) {
        return next(new Error("FORBIDDEN"));
      }

      const sessionResult = await getSessionUser(db, sessionToken);
      if (!sessionResult || sessionResult.user.status !== "active") {
        return next(new Error("FORBIDDEN"));
      }

      socket.data.user = sessionResult.user;
      return next();
    } catch {
      return next(new Error("FORBIDDEN"));
    }
  });

  nsp.on("connection", (socket: Socket) => {
    const user = socket.data.user as { id: string; displayName: string };
    if (!user) {
      socket.disconnect(true);
      return;
    }

    // Bergabung ke room pribadi user untuk notifikasi spesifik (seperti mute)
    void socket.join(`user:${user.id}`);

    // 1. Daftarkan event listener SECARA SINKRON terlebih dahulu
    socket.on("disconnect", () => {
      broadcastPresence();
    });

    socket.on(
      "chat:send",
      async (
        payload: { body?: string },
        ack?: (res: { ok: boolean; code?: string; params?: Record<string, unknown> }) => void,
      ) => {
        try {
          const body = payload?.body;

          // 1. Validasi isi pesan
          if (!body || body.trim().length === 0) {
            ack?.({ ok: false, code: "CHAT_EMPTY" });
            return;
          }

          if (body.length > 300) {
            ack?.({ ok: false, code: "CHAT_TOO_LONG" });
            return;
          }

          // 2. Cek apakah chat publik aktif
          const currentEnabled = await isChatEnabled(db);
          if (!currentEnabled) {
            ack?.({ ok: false, code: "CHAT_DISABLED" });
            return;
          }

          // 3. Cek apakah user dibisukan
          const currentMute = await getUserMute(db, user.id);
          if (currentMute.isMuted && currentMute.until) {
            ack?.({
              ok: false,
              code: "CHAT_MUTED",
              params: { until: currentMute.until.toISOString() },
            });
            return;
          }

          // 4. Rate limit: 1 pesan / 2 detik per pemain
          const now = Date.now();
          const lastTime = lastMessageTimes.get(user.id) ?? 0;
          if (now - lastTime < 2000) {
            ack?.({ ok: false, code: "RATE_LIMITED" });
            return;
          }
          lastMessageTimes.set(user.id, now);

          // 5. Sensor kata di server dan simpan ke database
          const savedMessage = await saveChatMessage(db, user.id, body);

          // 6. Siarkan pesan ke seluruh klien chat publik
          nsp.emit("chat:message", savedMessage);

          ack?.({ ok: true });
        } catch {
          ack?.({ ok: false, code: "INTERNAL_ERROR" });
        }
      },
    );

    // 2. Jalankan query inisialisasi async di latar belakang
    void (async () => {
      try {
        const enabled = await isChatEnabled(db);
        socket.emit("chat:status", { enabled });

        const muteInfo = await getUserMute(db, user.id);
        if (muteInfo.isMuted && muteInfo.until) {
          socket.emit("chat:muted", { until: muteInfo.until.toISOString() });
        }

        broadcastPresence();
      } catch {
        // Abaikan kegagalan emit inisialisasi
      }
    })();
  });

  return {
    nsp,
    broadcastMessageDeleted: (messageId: string) => {
      nsp.emit("chat:deleted", { id: messageId });
    },
    broadcastChatStatus: (enabled: boolean) => {
      nsp.emit("chat:status", { enabled });
    },
    notifyUserMuted: (userId: string, until: Date) => {
      nsp.to(`user:${userId}`).emit("chat:muted", { until: until.toISOString() });
    },
  };
}
