import type { Database } from "@low-stress/db";
import { purgeOldChatMessages } from "./service";

export interface PurgeChatJobHandle {
  stop: () => void;
  runNow: () => Promise<number>;
}

export const CHAT_PURGE_INTERVAL_MS = 60 * 60 * 1000; // 1 jam

/**
 * Memulai job latar belakang berkala untuk membersihkan pesan chat > 7 hari.
 */
export function startPurgeChatJob(
  db: Database,
  intervalMs = CHAT_PURGE_INTERVAL_MS,
): PurgeChatJobHandle {
  const timer = setInterval(() => {
    purgeOldChatMessages(db).catch(() => {
      // Abaikan kegagalan sementara pada latar belakang
    });
  }, intervalMs);

  // Jangan tahan proses node agar tidak mencegah exit bersih jika timer berjalan
  if (timer.unref) {
    timer.unref();
  }

  return {
    stop: () => clearInterval(timer),
    runNow: () => purgeOldChatMessages(db),
  };
}
