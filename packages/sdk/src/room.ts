/**
 * Primitif Room bersama untuk game multipemain (Ludo, Riot, dll).
 */

export type BaseRoomStatus = "lobby" | "playing" | "finished" | "abandoned";
export type BasePlayerStatus = "invited" | "accepted" | "declined" | "left";

export interface RoomActor {
  userId: string;
  username: string;
  displayName: string;
  isAdmin?: boolean;
}

export function isRoomHost(hostId: string, actorId: string): boolean {
  return hostId === actorId;
}

export function assertRoomHost(hostId: string, actorId: string): void {
  if (!isRoomHost(hostId, actorId)) {
    const err = new Error("Hanya host room yang berhak melakukan tindakan ini");
    (err as { code?: string }).code = "FORBIDDEN";
    throw err;
  }
}

/** Hitung batas waktu kedaluwarsa room tidak aktif. */
export function computeExpirationCutoff(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** Hasilkan kode room acak ramah manusia (misal: 'ABCD'). */
export function generateRoomCode(length = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/** Filter calon pemain yang diundang agar tidak menyertakan pemain yang sudah ada di room. */
export function filterInvitableUsers<T extends { id: string }>(
  allUsers: T[],
  participantIds: readonly string[],
): T[] {
  const participantSet = new Set(participantIds);
  return allUsers.filter((u) => !participantSet.has(u.id));
}

/** Pengelola timer tidak aktif (idle timeout) dengan fungsi reset dan cancel. */
export function createIdleTimer(options: {
  timeoutMs: number;
  onTimeout: () => void | Promise<void>;
}): { reset: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const reset = () => {
    cancel();
    timer = setTimeout(() => {
      void options.onTimeout();
    }, options.timeoutMs);
  };

  reset();

  return { reset, cancel };
}
