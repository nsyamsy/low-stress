import type { RiotRoom } from "./service";

/**
 * RT-50: Entri skor leaderboard generik untuk satu ronde selesai.
 *
 * Skor dihitung server dari hasil ronde (R8) — klien TIDAK PERNAH dapat
 * mengirim skor. Hanya pemain dengan poin > 0 yang dicatat; durasi ronde
 * dihitung dari `roundStartedAt` sampai sekarang (dibatasi 0 bila tidak ada).
 */
export interface LeaderboardScoreEntry {
  gameId: "riot";
  userId: string;
  score: number;
  durationMs: number;
}

export function buildLeaderboardScoreEntries(
  room: RiotRoom,
  now = Date.now(),
): LeaderboardScoreEntry[] {
  if (!room.scores) return [];
  const durationMs =
    room.roundStartedAt > 0 ? Math.max(0, now - room.roundStartedAt) : 0;
  const entries: LeaderboardScoreEntry[] = [];
  for (const breakdown of room.scores.values()) {
    if (breakdown.totalPoints > 0) {
      entries.push({
        gameId: "riot",
        userId: breakdown.id,
        score: breakdown.totalPoints,
        durationMs,
      });
    }
  }
  return entries;
}

/** Kunci pencatatan per ronde agar rematch di room yang sama tetap tercatat. */
export function matchRecordKey(room: RiotRoom): string {
  return `${room.id}_${room.roundStartedAt}`;
}
