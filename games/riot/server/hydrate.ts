import {
  eq,
  inArray,
  riotRoomPlayers,
  riotRooms,
  users,
  type Database,
  type GameServerContext,
} from "@low-stress/sdk/server";
import { sanitizeCharacterCustomization } from "../shared/character";
import type { RiotHostOptions } from "../shared/lobby";
import type { RiotGameService } from "./service";

/**
 * Rehidrasi room `lobby` dari tabel riot_* setelah restart server (RT-41).
 * Hanya room berstatus lobby yang dipulihkan — ronde yang sedang berjalan
 * bersifat ephemeral dan sengaja tidak dipulihkan (state simulasi tidak
 * dipersist). Pemain hasil hidrasi ditandai offline; mereka kembali lewat
 * `player:reconnect` / `room:join` seperti biasa.
 */
export async function hydrateRiotRooms(
  service: RiotGameService,
  ctx: GameServerContext,
): Promise<void> {
  const db = ctx.db as Database | undefined;
  if (!db) return;

  try {
    const rows = await db
      .select()
      .from(riotRooms)
      .where(eq(riotRooms.status, "lobby"));

    for (const row of rows) {
      const playerRows = await db
        .select()
        .from(riotRoomPlayers)
        .where(eq(riotRoomPlayers.roomId, row.id));
      if (playerRows.length === 0) continue;

      const userIds = playerRows.map((p) => p.userId);
      const userRows = await db
        .select({ id: users.id, displayName: users.displayName, username: users.username })
        .from(users)
        .where(inArray(users.id, userIds));
      const nameOf = new Map(userRows.map((u) => [u.id, u.displayName || u.username]));

      const options = (row.options ?? {}) as Partial<RiotHostOptions>;
      const hostRow = playerRows.find((p) => p.userId === row.hostId);
      const room = service.createRoom(
        row.hostId,
        nameOf.get(row.hostId) ?? "Player",
        row.id,
        options,
        sanitizeCharacterCustomization(hostRow?.character),
      );

      for (const pr of playerRows) {
        if (pr.userId === row.hostId) continue;
        service.joinRoom(
          row.id,
          pr.userId,
          nameOf.get(pr.userId) ?? "Player",
          sanitizeCharacterCustomization(pr.character),
        );
      }

      // Semua pemain hasil hidrasi berstatus offline sampai socket mereka kembali.
      for (const p of room.players.values()) {
        p.connected = false;
        p.disconnectedAt = Date.now();
      }
      room.updatedAt = Date.now();
    }
  } catch {
    // Hidrasi bersifat opsional; kegagalan tidak boleh menjatuhkan server.
  }
}
