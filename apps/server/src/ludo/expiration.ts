import { lt } from "drizzle-orm";
import type { Server, Namespace } from "socket.io";
import type { Database } from "@low-stress/db";
import { ludoRooms } from "@low-stress/db";

export const LUDO_ROOM_EXPIRATION_DAYS = 7;
export const LUDO_EXPIRATION_INTERVAL_MS = 60 * 60 * 1000; // 1 jam

export interface ExpireOptions {
  now?: Date;
  io?: Server | Namespace;
}

/**
 * Menghapus room Ludo yang tidak aktif selama lebih dari 7 hari.
 * Mengembalikan jumlah room yang dihapus.
 */
export async function expireInactiveRooms(
  db: Database,
  options: ExpireOptions = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const cutoff = new Date(
    now.getTime() - LUDO_ROOM_EXPIRATION_DAYS * 24 * 60 * 60 * 1000,
  );

  // Cari room yang kedaluwarsa
  const expiredRooms = await db
    .select({ id: ludoRooms.id })
    .from(ludoRooms)
    .where(lt(ludoRooms.lastActivityAt, cutoff));

  if (expiredRooms.length === 0) {
    return 0;
  }

  // Beritahu klien yang mungkin masih tersambung
  if (options.io) {
    for (const r of expiredRooms) {
      try {
        options.io.to(`ludo:${r.id}`).emit("room:closed", { reason: "expired" });
      } catch {
        // Abaikan
      }
    }
  }

  // Hapus dari database (cascade ke ludo_players dan ludo_messages)
  const res = await db.delete(ludoRooms).where(lt(ludoRooms.lastActivityAt, cutoff));
  return (res as { count?: number }).count ?? expiredRooms.length;
}

/**
 * Menjalankan background job tiap jam untuk membersihkan room yang kedaluwarsa.
 */
export function startLudoExpirationJob(
  db: Database,
  io?: Server | Namespace,
  intervalMs = LUDO_EXPIRATION_INTERVAL_MS,
): { stop: () => void } {
  const timer = setInterval(() => {
    void expireInactiveRooms(db, { io }).catch(() => {
      // Abaikan kegagalan background job
    });
  }, intervalMs);

  return {
    stop: () => {
      clearInterval(timer);
    },
  };
}
