import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@low-stress/db";
import {
  ludoMessages,
  ludoPlayers,
  ludoRooms,
  riotMatches,
  riotRoomPlayers,
  riotRooms,
  users,
} from "@low-stress/db";
import { AppError } from "../../errors";
import { resolveGameServerModule, type LoadedGame } from "../../registry/games";
import { recordAuditLog } from "./audit";

export async function listAdminLudoRooms(
  db: Database,
  status?: string,
) {
  const conditions = [];
  if (status) {
    conditions.push(eq(ludoRooms.status, status));
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: ludoRooms.id,
      name: ludoRooms.name,
      status: ludoRooms.status,
      hostId: ludoRooms.hostId,
      hostName: users.displayName,
      maxPlayers: ludoRooms.maxPlayers,
      pawns: ludoRooms.pawns,
      lastActivityAt: ludoRooms.lastActivityAt,
      createdAt: ludoRooms.createdAt,
      playersCount: sql<number>`(
        SELECT COUNT(*)::int FROM ludo_players lp
         WHERE lp.room_id = ${ludoRooms.id} AND lp.status = 'accepted'
      )`,
    })
    .from(ludoRooms)
    .innerJoin(users, eq(users.id, ludoRooms.hostId))
    .where(whereClause)
    .orderBy(desc(ludoRooms.lastActivityAt));

  return {
    items: rows.map((r) => ({
      ...r,
      lastActivityAt: r.lastActivityAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export async function getAdminLudoRoomDetail(
  db: Database,
  roomId: string,
) {
  const [room] = await db
    .select({
      id: ludoRooms.id,
      name: ludoRooms.name,
      status: ludoRooms.status,
      hostId: ludoRooms.hostId,
      hostName: users.displayName,
      maxPlayers: ludoRooms.maxPlayers,
      pawns: ludoRooms.pawns,
      state: ludoRooms.state,
      version: ludoRooms.version,
      startedAt: ludoRooms.startedAt,
      finishedAt: ludoRooms.finishedAt,
      lastActivityAt: ludoRooms.lastActivityAt,
      createdAt: ludoRooms.createdAt,
    })
    .from(ludoRooms)
    .innerJoin(users, eq(users.id, ludoRooms.hostId))
    .where(eq(ludoRooms.id, roomId))
    .limit(1);

  if (!room) {
    throw new AppError("NOT_FOUND", 404, { roomId });
  }

  const players = await db
    .select({
      userId: ludoPlayers.userId,
      username: users.username,
      displayName: users.displayName,
      status: ludoPlayers.status,
      pawn: ludoPlayers.pawn,
      autopilot: ludoPlayers.autopilot,
      joinedAt: ludoPlayers.joinedAt,
    })
    .from(ludoPlayers)
    .innerJoin(users, eq(users.id, ludoPlayers.userId))
    .where(eq(ludoPlayers.roomId, roomId));

  const messages = await db
    .select({
      id: ludoMessages.id,
      userId: ludoMessages.userId,
      userName: users.displayName,
      body: ludoMessages.body,
      createdAt: ludoMessages.createdAt,
    })
    .from(ludoMessages)
    .leftJoin(users, eq(users.id, ludoMessages.userId))
    .where(eq(ludoMessages.roomId, roomId))
    .orderBy(desc(ludoMessages.id))
    .limit(100);

  return {
    room: {
      ...room,
      startedAt: room.startedAt?.toISOString() ?? null,
      finishedAt: room.finishedAt?.toISOString() ?? null,
      lastActivityAt: room.lastActivityAt.toISOString(),
      createdAt: room.createdAt.toISOString(),
    },
    players: players.map((p) => ({
      ...p,
      joinedAt: p.joinedAt?.toISOString() ?? null,
    })),
    messages: messages.reverse().map((m) => ({
      id: m.id,
      userId: m.userId,
      userName: m.userName ?? "System",
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export async function adminResetLudoRoom(
  db: Database,
  adminId: string,
  roomId: string,
) {
  const [room] = await db
    .select({ id: ludoRooms.id, name: ludoRooms.name })
    .from(ludoRooms)
    .where(eq(ludoRooms.id, roomId))
    .limit(1);

  if (!room) {
    throw new AppError("NOT_FOUND", 404, { roomId });
  }

  await db
    .update(ludoRooms)
    .set({
      status: "lobby",
      state: null,
      seatUsers: null,
      pawns: null,
      startedAt: null,
      finishedAt: null,
      version: sql`${ludoRooms.version} + 1`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
      lastActivityAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(ludoRooms.id, roomId));

  await recordAuditLog(db, {
    adminId,
    action: "ludo_reset_room",
    targetType: "ludo_room",
    targetId: roomId,
    detail: { roomName: room.name },
  });

  return { ok: true };
}

export async function adminKickLudoPlayer(
  db: Database,
  adminId: string,
  roomId: string,
  userId: string,
) {
  const [player] = await db
    .select({ roomId: ludoPlayers.roomId })
    .from(ludoPlayers)
    .where(
      and(
        eq(ludoPlayers.roomId, roomId),
        eq(ludoPlayers.userId, userId),
      ),
    )
    .limit(1);

  if (!player) {
    throw new AppError("NOT_FOUND", 404, { roomId, userId });
  }

  await db
    .delete(ludoPlayers)
    .where(
      and(
        eq(ludoPlayers.roomId, roomId),
        eq(ludoPlayers.userId, userId),
      ),
    );

  await db
    .update(ludoRooms)
    .set({
      version: sql`${ludoRooms.version} + 1`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
      lastActivityAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(ludoRooms.id, roomId));

  await recordAuditLog(db, {
    adminId,
    action: "ludo_kick_player",
    targetType: "ludo_room",
    targetId: roomId,
    detail: { kickedUserId: userId },
  });

  return { ok: true };
}

export async function adminDeleteLudoRoom(
  db: Database,
  adminId: string,
  roomId: string,
) {
  const [room] = await db
    .select({ id: ludoRooms.id, name: ludoRooms.name })
    .from(ludoRooms)
    .where(eq(ludoRooms.id, roomId))
    .limit(1);

  if (!room) {
    throw new AppError("NOT_FOUND", 404, { roomId });
  }

  await db.delete(ludoRooms).where(eq(ludoRooms.id, roomId));

  await recordAuditLog(db, {
    adminId,
    action: "ludo_delete_room",
    targetType: "ludo_room",
    targetId: roomId,
    detail: { roomName: room.name },
  });

  return { ok: true };
}

export async function listAdminRiotRooms(db: Database, status?: string) {
  const conditions = [];
  if (status) {
    conditions.push(eq(riotRooms.status, status));
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: riotRooms.id,
      name: riotRooms.name,
      status: riotRooms.status,
      hostId: riotRooms.hostId,
      hostName: users.displayName,
      options: riotRooms.options,
      lastActivityAt: riotRooms.lastActivityAt,
      createdAt: riotRooms.createdAt,
      playersCount: sql<number>`(
        SELECT COUNT(*)::int FROM riot_room_players rp
         WHERE rp.room_id = ${riotRooms.id}
      )`,
    })
    .from(riotRooms)
    .innerJoin(users, eq(users.id, riotRooms.hostId))
    .where(whereClause)
    .orderBy(desc(riotRooms.lastActivityAt));

  return {
    items: rows.map((r) => ({
      ...r,
      lastActivityAt: r.lastActivityAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export async function getAdminRiotRoomDetail(db: Database, roomId: string) {
  const [room] = await db
    .select({
      id: riotRooms.id,
      name: riotRooms.name,
      status: riotRooms.status,
      hostId: riotRooms.hostId,
      hostName: users.displayName,
      options: riotRooms.options,
      lastActivityAt: riotRooms.lastActivityAt,
      createdAt: riotRooms.createdAt,
    })
    .from(riotRooms)
    .innerJoin(users, eq(users.id, riotRooms.hostId))
    .where(eq(riotRooms.id, roomId))
    .limit(1);

  if (!room) {
    throw new AppError("NOT_FOUND", 404, { roomId });
  }

  const players = await db
    .select({
      userId: riotRoomPlayers.userId,
      username: users.username,
      displayName: users.displayName,
      status: riotRoomPlayers.status,
      character: riotRoomPlayers.character,
      joinedAt: riotRoomPlayers.joinedAt,
    })
    .from(riotRoomPlayers)
    .innerJoin(users, eq(users.id, riotRoomPlayers.userId))
    .where(eq(riotRoomPlayers.roomId, roomId));

  const matches = await db
    .select({
      id: riotMatches.id,
      winner: riotMatches.winner,
      startedAt: riotMatches.startedAt,
      endedAt: riotMatches.endedAt,
      players: riotMatches.players,
    })
    .from(riotMatches)
    .where(eq(riotMatches.roomId, roomId))
    .orderBy(desc(riotMatches.endedAt));

  return {
    room: {
      ...room,
      lastActivityAt: room.lastActivityAt.toISOString(),
      createdAt: room.createdAt.toISOString(),
    },
    players: players.map((p) => ({
      ...p,
      joinedAt: p.joinedAt?.toISOString() ?? null,
    })),
    matches: matches.map((m) => ({
      ...m,
      startedAt: m.startedAt?.toISOString() ?? null,
      endedAt: m.endedAt?.toISOString() ?? null,
    })),
  };
}

export async function adminResetRiotRoom(
  db: Database,
  adminId: string,
  roomId: string,
  games: readonly LoadedGame[] = [],
) {
  const [room] = await db
    .select({ id: riotRooms.id, name: riotRooms.name })
    .from(riotRooms)
    .where(eq(riotRooms.id, roomId))
    .limit(1);

  if (!room) {
    throw new AppError("NOT_FOUND", 404, { roomId });
  }

  await db
    .update(riotRooms)
    .set({
      status: "lobby",
      updatedAt: sql`CURRENT_TIMESTAMP`,
      lastActivityAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(riotRooms.id, roomId));

  const riotGame = games.find((g) => g.manifest.id === "riot");
  if (riotGame) {
    try {
      const serverMod =
        riotGame.serverModule ?? (await resolveGameServerModule(riotGame));
      await serverMod?.adminResetRoom?.(roomId);
    } catch {
      // Abaikan kegagalan sinkronisasi memori
    }
  }

  await recordAuditLog(db, {
    adminId,
    action: "riot_reset_room",
    targetType: "riot_room",
    targetId: roomId,
    detail: { roomName: room.name },
  });

  return { ok: true };
}

export async function adminKickRiotPlayer(
  db: Database,
  adminId: string,
  roomId: string,
  userId: string,
  games: readonly LoadedGame[] = [],
) {
  const [player] = await db
    .select({ roomId: riotRoomPlayers.roomId })
    .from(riotRoomPlayers)
    .where(
      and(
        eq(riotRoomPlayers.roomId, roomId),
        eq(riotRoomPlayers.userId, userId),
      ),
    )
    .limit(1);

  if (!player) {
    throw new AppError("NOT_FOUND", 404, { roomId, userId });
  }

  await db
    .delete(riotRoomPlayers)
    .where(
      and(
        eq(riotRoomPlayers.roomId, roomId),
        eq(riotRoomPlayers.userId, userId),
      ),
    );

  await db
    .update(riotRooms)
    .set({
      updatedAt: sql`CURRENT_TIMESTAMP`,
      lastActivityAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(riotRooms.id, roomId));

  const riotGame = games.find((g) => g.manifest.id === "riot");
  if (riotGame) {
    try {
      const serverMod =
        riotGame.serverModule ?? (await resolveGameServerModule(riotGame));
      await serverMod?.adminKickPlayer?.(roomId, userId);
    } catch {
      // Abaikan kegagalan sinkronisasi memori
    }
  }

  await recordAuditLog(db, {
    adminId,
    action: "riot_kick_player",
    targetType: "riot_room",
    targetId: roomId,
    detail: { kickedUserId: userId },
  });

  return { ok: true };
}

export async function adminDeleteRiotRoom(
  db: Database,
  adminId: string,
  roomId: string,
  games: readonly LoadedGame[] = [],
) {
  const [room] = await db
    .select({ id: riotRooms.id, name: riotRooms.name })
    .from(riotRooms)
    .where(eq(riotRooms.id, roomId))
    .limit(1);

  if (!room) {
    throw new AppError("NOT_FOUND", 404, { roomId });
  }

  await db.delete(riotRooms).where(eq(riotRooms.id, roomId));

  const riotGame = games.find((g) => g.manifest.id === "riot");
  if (riotGame) {
    try {
      const serverMod =
        riotGame.serverModule ?? (await resolveGameServerModule(riotGame));
      await serverMod?.adminDeleteRoom?.(roomId);
    } catch {
      // Abaikan kegagalan sinkronisasi memori
    }
  }

  await recordAuditLog(db, {
    adminId,
    action: "riot_delete_room",
    targetType: "riot_room",
    targetId: roomId,
    detail: { roomName: room.name },
  });

  return { ok: true };
}
