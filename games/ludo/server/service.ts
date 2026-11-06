import { randomInt, randomUUID } from "node:crypto";

import {
  type Database,
  users,
  ludoRooms,
  ludoPlayers,
  ludoMessages,
  settings,
  eq,
  and,
  sql,
  desc,
  inArray,
} from "@low-stress/sdk/server";
import { censorProfanity } from "@low-stress/sdk";
const censorServerText = (t: string) => censorProfanity(t);
import { AppError } from "./errors";
import {
  autoMove,
  defaultPawns,
  isExitRule,
  isPawnCharacter,
  legalPawns,
  MAX_PLAYERS,
  MIN_PLAYERS,
  move,
  newState,
  roll,
  skip,
  type ExitRule,
  type LastEvent,
  type LudoState,
  type PawnCharacter,
} from "../shared/engine";
import type {
  ChatMessage,
  LudoAction,
  LudoActor,
  PlayerStatus,
  PlayerView,
  RoomStatus,
  RoomSummary,
  RoomView,
} from "./types";

const rng = () => randomInt(0, 1_000_000) / 1_000_000;

export async function getMaxAllowedPlayers(db: Database): Promise<number> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "ludoMaxPlayers"))
    .limit(1);

  if (row && typeof row.value === "number") {
    return Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, row.value));
  }
  return MAX_PLAYERS;
}

export function clampPlayers(v: unknown, maxAllowed = MAX_PLAYERS): number {
  const parsed = Math.trunc(Number(v)) || 4;
  return Math.min(maxAllowed, Math.max(MIN_PLAYERS, parsed));
}

export async function listRooms(
  db: Database,
  actor: LudoActor,
): Promise<RoomSummary[]> {
  const isPrivileged = !!actor.isAdmin;

  const rows = await db
    .select({
      id: ludoRooms.id,
      name: ludoRooms.name,
      status: ludoRooms.status,
      hostId: ludoRooms.hostId,
      hostName: users.displayName,
      maxPlayers: ludoRooms.maxPlayers,
      updatedAt: ludoRooms.updatedAt,
      myStatus: sql<string | null>`(
        SELECT lp.status FROM ludo_players lp
         WHERE lp.room_id = ${ludoRooms.id} AND lp.user_id = ${actor.userId}::uuid
         LIMIT 1
      )`,
      playersCount: sql<number>`(
        SELECT COUNT(*)::int FROM ludo_players lp
         WHERE lp.room_id = ${ludoRooms.id} AND lp.status = 'accepted'
      )`,
    })
    .from(ludoRooms)
    .innerJoin(users, eq(users.id, ludoRooms.hostId))
    .where(
      isPrivileged
        ? sql`TRUE`
        : sql`EXISTS (
            SELECT 1 FROM ludo_players me
             WHERE me.room_id = ${ludoRooms.id}
               AND me.user_id = ${actor.userId}::uuid
               AND me.status <> 'declined'
          )`,
    )
    .orderBy(desc(ludoRooms.updatedAt))
    .limit(50);

  return rows.map((r) => ({
    id: r.id,
    name: censorServerText(r.name),
    status: r.status as RoomStatus,
    hostId: r.hostId,
    hostName: censorServerText(r.hostName),
    players: r.playersCount,
    maxPlayers: r.maxPlayers,
    myStatus: (r.myStatus as PlayerStatus) ?? null,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function createRoom(
  db: Database,
  actor: LudoActor,
  name: unknown,
  maxPlayers: unknown,
  play = true,
): Promise<string> {
  const title = typeof name === "string" ? name.trim().slice(0, 60) : "";
  if (!title) {
    throw new AppError("VALIDATION_FAILED", 400, {
      message: "Room name is required",
    });
  }

  const maxAllowed = await getMaxAllowedPlayers(db);
  const clampedMax = clampPlayers(maxPlayers, maxAllowed);
  const roomId = randomUUID();
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(ludoRooms).values({
      id: roomId,
      name: title,
      hostId: actor.userId,
      status: "lobby",
      maxPlayers: clampedMax,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await tx.insert(ludoPlayers).values({
      roomId,
      userId: actor.userId,
      status: play ? "accepted" : "observer",
      joinedAt: play ? now : null,
      invitedAt: now,
    });
  });

  return roomId;
}

export async function searchInvitableUsers(
  db: Database,
  q: string,
  excludeUserIds: string[] = [],
): Promise<{ id: string; username: string; displayName: string }[]> {
  const query = q.trim();
  const baseQuery = db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
    })
    .from(users)
    .where(
      and(
        eq(users.status, "active"),
        query
          ? sql`(${users.username} ILIKE ${"%" + query + "%"} OR ${users.displayName} ILIKE ${"%" + query + "%"})`
          : sql`TRUE`,
        excludeUserIds.length > 0
          ? sql`${users.id} NOT IN (${sql.join(excludeUserIds.map((id) => sql`${id}::uuid`), sql`, `)})`
          : sql`TRUE`,
      ),
    )
    .orderBy(users.username)
    .limit(30);

  const results = await baseQuery;
  return results.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: censorServerText(u.displayName),
  }));
}

interface RoomQueryResult {
  id: string;
  name: string;
  hostId: string;
  status: string;
  maxPlayers: number;
  pawns: number | null;
  seatUsers: string[] | null;
  state: LudoState | null;
  version: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
  elapsedSeconds: number | null;
}

export async function loadRoom(
  db: Database,
  roomId: string,
  lock = false,
): Promise<RoomQueryResult> {
  const query = db
    .select({
      id: ludoRooms.id,
      name: ludoRooms.name,
      hostId: ludoRooms.hostId,
      status: ludoRooms.status,
      maxPlayers: ludoRooms.maxPlayers,
      pawns: ludoRooms.pawns,
      seatUsers: ludoRooms.seatUsers,
      state: ludoRooms.state,
      version: ludoRooms.version,
      startedAt: ludoRooms.startedAt,
      finishedAt: ludoRooms.finishedAt,
      lastActivityAt: ludoRooms.lastActivityAt,
      createdAt: ludoRooms.createdAt,
      updatedAt: ludoRooms.updatedAt,
      elapsedSeconds: sql<number | null>`
        CASE
          WHEN ${ludoRooms.startedAt} IS NULL THEN NULL
          ELSE EXTRACT(EPOCH FROM (COALESCE(${ludoRooms.finishedAt}, CURRENT_TIMESTAMP) - ${ludoRooms.startedAt}))::float
        END
      `,
    })
    .from(ludoRooms)
    .where(eq(ludoRooms.id, roomId));

  const [row] = lock
    ? await query.for("update")
    : await query;

  if (!row) {
    throw new AppError("LUDO_ROOM_NOT_FOUND", 404);
  }

  return row as unknown as RoomQueryResult;
}

export async function loadPlayers(
  db: Database,
  roomId: string,
): Promise<
  {
    userId: string;
    username: string;
    displayName: string;
    status: PlayerStatus;
    pawn: string | null;
    autopilot: boolean;
    invitedAt: Date;
    joinedAt: Date | null;
  }[]
> {
  const rows = await db
    .select({
      userId: ludoPlayers.userId,
      username: users.username,
      displayName: users.displayName,
      status: ludoPlayers.status,
      pawn: ludoPlayers.pawn,
      autopilot: ludoPlayers.autopilot,
      invitedAt: ludoPlayers.invitedAt,
      joinedAt: ludoPlayers.joinedAt,
    })
    .from(ludoPlayers)
    .innerJoin(users, eq(users.id, ludoPlayers.userId))
    .where(eq(ludoPlayers.roomId, roomId))
    .orderBy(
      sql`CASE WHEN ${ludoPlayers.userId} = (SELECT host_id FROM ludo_rooms WHERE id = ${roomId}) THEN 0 ELSE 1 END`,
      sql`${ludoPlayers.joinedAt} NULLS LAST`,
      ludoPlayers.invitedAt,
    );

  return rows.map((r) => ({
    ...r,
    displayName: censorServerText(r.displayName),
    status: r.status as PlayerStatus,
  }));
}

export async function buildView(
  db: Database,
  room: RoomQueryResult,
  actor: LudoActor,
): Promise<RoomView> {
  const players = await loadPlayers(db, room.id);
  const mine = players.find((p) => p.userId === actor.userId);
  const isHost = room.hostId === actor.userId;
  const isAdmin = !!actor.isAdmin;

  if (!mine && !isAdmin) {
    throw new AppError("LUDO_NOT_MEMBER", 403);
  }

  const seatUsers = room.seatUsers ?? [];
  const mySeat = seatUsers.indexOf(actor.userId);
  const state = room.state;

  let movable: number[] = [];
  if (
    state &&
    state.winner === null &&
    state.phase === "move" &&
    state.dice !== null &&
    mySeat >= 0 &&
    mySeat === state.turn
  ) {
    movable = legalPawns(state, state.dice);
  }

  let invitable: { id: string; username: string; displayName: string }[] = [];
  if (isHost && room.status === "lobby") {
    const taken = players
      .filter((p) => p.status !== "declined")
      .map((p) => p.userId);
    invitable = await searchInvitableUsers(db, "", taken);
  }

  const chatRows = await db
    .select({
      id: ludoMessages.id,
      roomId: ludoMessages.roomId,
      userId: ludoMessages.userId,
      name: users.displayName,
      text: ludoMessages.body,
      createdAt: ludoMessages.createdAt,
    })
    .from(ludoMessages)
    .leftJoin(users, eq(users.id, ludoMessages.userId))
    .where(eq(ludoMessages.roomId, room.id))
    .orderBy(desc(ludoMessages.id))
    .limit(80);

  const messages: ChatMessage[] = chatRows.reverse().map((m) => ({
    id: m.id,
    roomId: m.roomId,
    userId: m.userId,
    name: m.name ? censorServerText(m.name) : "System",
    text: censorServerText(m.text),
    at: m.createdAt.toISOString(),
  }));

  const playerViews: PlayerView[] = players.map((p) => {
    const seat = seatUsers.includes(p.userId) ? seatUsers.indexOf(p.userId) : null;
    const color =
      state && seat !== null && seat >= 0 && seat < state.seats.length
        ? (state.seats[seat] ?? null)
        : null;
    return {
      userId: p.userId,
      name: p.displayName,
      status: p.status,
      isHost: p.userId === room.hostId,
      isMe: p.userId === actor.userId,
      seat,
      pawn: (isPawnCharacter(p.pawn) ? p.pawn : "pin") as PawnCharacter,
      color,
      autopilot: p.autopilot,
    };
  });

  return {
    id: room.id,
    name: censorServerText(room.name),
    status: room.status as RoomStatus,
    hostId: room.hostId,
    maxPlayers: room.maxPlayers,
    pawns:
      state?.pawns[0]?.length ??
      defaultPawns(players.filter((p) => p.status === "accepted").length),
    version: room.version,
    updatedAt: room.updatedAt.toISOString(),
    playSeconds: room.elapsedSeconds ?? null,
    players: playerViews,
    messages,
    state,
    isHost,
    isAdmin,
    mySeat: mySeat >= 0 ? mySeat : null,
    movable,
    invitable,
    event: state?.last ?? null,
  };
}

export async function getRoomView(
  db: Database,
  roomId: string,
  actor: LudoActor,
): Promise<RoomView> {
  const room = await loadRoom(db, roomId, false);
  return buildView(db, room, actor);
}

export async function deleteRoom(
  db: Database,
  roomId: string,
  actor: LudoActor,
): Promise<void> {
  const room = await loadRoom(db, roomId, false);
  const isHost = room.hostId === actor.userId;
  const isAdmin = !!actor.isAdmin;

  if (!isHost && !isAdmin) {
    throw new AppError("LUDO_FORBIDDEN", 403);
  }
  if (!isAdmin && room.status !== "lobby") {
    throw new AppError("LUDO_BAD_STATE", 409, {
      message: "Host can only delete room in lobby status",
    });
  }

  await db.delete(ludoRooms).where(eq(ludoRooms.id, roomId));
}

export interface ActionResult {
  view: RoomView;
  event: LastEvent | null;
  chatMessage?: ChatMessage;
}

export async function performAction(
  db: Database,
  roomId: string,
  actor: LudoActor,
  action: LudoAction,
): Promise<ActionResult> {
  return db.transaction(async (tx) => {
    const room = await loadRoom(tx, roomId, true);
    const isHost = room.hostId === actor.userId;
    const isAdmin = !!actor.isAdmin;
    const players = await loadPlayers(tx, roomId);
    const mine = players.find((p) => p.userId === actor.userId);

    if (!mine && !isAdmin) {
      throw new AppError("LUDO_NOT_MEMBER", 403);
    }
    const accepted = players.filter((p) => p.status === "accepted");
    const now = new Date();

    let chatMessage: ChatMessage | undefined;
    let event: LastEvent | null = null;

    switch (action.action) {
      case "invite": {
        if (!isHost) throw new AppError("LUDO_FORBIDDEN", 403);
        if (room.status !== "lobby") throw new AppError("LUDO_BAD_STATE", 409);
        const ids = [
          ...new Set(
            (Array.isArray(action.userIds) ? action.userIds : []).filter(
              (id): id is string => typeof id === "string" && Boolean(id),
            ),
          ),
        ].slice(0, 30);
        if (ids.length === 0) {
          throw new AppError("VALIDATION_FAILED", 400, {
            message: "No users selected",
          });
        }

        const validUsers = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(inArray(users.id, ids), eq(users.status, "active")));

        for (const u of validUsers) {
          await tx
            .insert(ludoPlayers)
            .values({
              roomId,
              userId: u.id,
              status: "invited",
              invitedAt: now,
            })
            .onConflictDoUpdate({
              target: [ludoPlayers.roomId, ludoPlayers.userId],
              set: {
                status: "invited",
                invitedAt: now,
              },
            });
        }

        await tx
          .update(ludoRooms)
          .set({
            version: sql`${ludoRooms.version} + 1`,
            updatedAt: now,
            lastActivityAt: now,
          })
          .where(eq(ludoRooms.id, roomId));
        break;
      }

      case "respond": {
        if (!mine) throw new AppError("LUDO_NOT_MEMBER", 403);
        if (room.status !== "lobby") throw new AppError("LUDO_BAD_STATE", 409);
        if (isHost) throw new AppError("LUDO_FORBIDDEN", 403);

        if (action.accept) {
          if (
            mine.status !== "accepted" &&
            accepted.length >= room.maxPlayers
          ) {
            throw new AppError("LUDO_ROOM_FULL", 409);
          }
          await tx
            .update(ludoPlayers)
            .set({
              status: "accepted",
              joinedAt: sql`COALESCE(${ludoPlayers.joinedAt}, CURRENT_TIMESTAMP)`,
            })
            .where(
              and(
                eq(ludoPlayers.roomId, roomId),
                eq(ludoPlayers.userId, actor.userId),
              ),
            );
        } else {
          await tx
            .update(ludoPlayers)
            .set({ status: "declined", joinedAt: null })
            .where(
              and(
                eq(ludoPlayers.roomId, roomId),
                eq(ludoPlayers.userId, actor.userId),
              ),
            );
        }

        await tx
          .update(ludoRooms)
          .set({
            version: sql`${ludoRooms.version} + 1`,
            updatedAt: now,
            lastActivityAt: now,
          })
          .where(eq(ludoRooms.id, roomId));
        break;
      }

      case "participate": {
        if (!isHost) throw new AppError("LUDO_FORBIDDEN", 403);
        if (room.status !== "lobby") throw new AppError("LUDO_BAD_STATE", 409);
        if (
          action.play &&
          accepted.length >= room.maxPlayers &&
          mine?.status !== "accepted"
        ) {
          throw new AppError("LUDO_ROOM_FULL", 409);
        }

        await tx
          .update(ludoPlayers)
          .set({
            status: action.play ? "accepted" : "observer",
            joinedAt: action.play ? now : null,
          })
          .where(
            and(
              eq(ludoPlayers.roomId, roomId),
              eq(ludoPlayers.userId, actor.userId),
            ),
          );

        await tx
          .update(ludoRooms)
          .set({
            version: sql`${ludoRooms.version} + 1`,
            updatedAt: now,
            lastActivityAt: now,
          })
          .where(eq(ludoRooms.id, roomId));
        break;
      }

      case "kick": {
        if (!isHost) throw new AppError("LUDO_FORBIDDEN", 403);
        if (room.status !== "lobby") throw new AppError("LUDO_BAD_STATE", 409);
        if (action.userId === room.hostId) {
          throw new AppError("LUDO_BAD_STATE", 409, {
            message: "Cannot kick the host",
          });
        }

        await tx
          .delete(ludoPlayers)
          .where(
            and(
              eq(ludoPlayers.roomId, roomId),
              eq(ludoPlayers.userId, action.userId),
            ),
          );

        await tx
          .update(ludoRooms)
          .set({
            version: sql`${ludoRooms.version} + 1`,
            updatedAt: now,
            lastActivityAt: now,
          })
          .where(eq(ludoRooms.id, roomId));
        break;
      }

      case "pawn": {
        if (!mine || mine.status !== "accepted") {
          throw new AppError("LUDO_NOT_MEMBER", 403);
        }
        if (!isPawnCharacter(action.pawn)) {
          throw new AppError("VALIDATION_FAILED", 400, {
            message: "Unknown pawn character",
          });
        }

        await tx
          .update(ludoPlayers)
          .set({ pawn: action.pawn })
          .where(
            and(
              eq(ludoPlayers.roomId, roomId),
              eq(ludoPlayers.userId, actor.userId),
            ),
          );

        await tx
          .update(ludoRooms)
          .set({
            version: sql`${ludoRooms.version} + 1`,
            updatedAt: now,
            lastActivityAt: now,
          })
          .where(eq(ludoRooms.id, roomId));
        break;
      }

      case "start": {
        if (!isHost) throw new AppError("LUDO_FORBIDDEN", 403);
        if (room.status !== "lobby") throw new AppError("LUDO_BAD_STATE", 409);
        if (accepted.length < MIN_PLAYERS) {
          throw new AppError("LUDO_NEED_TWO_PLAYERS", 400, {
            message: "At least 2 players must join",
          });
        }

        const pawnsEach =
          action.pawns === undefined
            ? defaultPawns(accepted.length)
            : Math.min(4, Math.max(1, Math.trunc(Number(action.pawns)) || 1));
        const exitRule: ExitRule = isExitRule(action.exit)
          ? action.exit
          : "double";
        const goal = Math.min(
          Math.max(1, Math.trunc(Number(action.goal)) || 1),
          Math.max(1, accepted.length - 1),
        );

        await tx
          .update(ludoPlayers)
          .set({ autopilot: false })
          .where(eq(ludoPlayers.roomId, roomId));

        const state = newState(accepted.length, pawnsEach, exitRule, goal);
        const seatUserIds = accepted.map((p) => p.userId);

        await tx
          .update(ludoRooms)
          .set({
            status: "playing",
            seatUsers: seatUserIds,
            pawns: pawnsEach,
            state: state as unknown as Record<string, unknown>,
            startedAt: now,
            finishedAt: null,
            version: sql`${ludoRooms.version} + 1`,
            updatedAt: now,
            lastActivityAt: now,
          })
          .where(eq(ludoRooms.id, roomId));
        break;
      }

      case "roll":
      case "move": {
        const state = room.state;
        if (room.status !== "playing" || !state) {
          throw new AppError("LUDO_BAD_STATE", 409);
        }
        const seat = (room.seatUsers ?? []).indexOf(actor.userId);
        if (seat < 0 || seat !== state.turn) {
          throw new AppError("LUDO_NOT_YOUR_TURN", 409);
        }

        // Taking back control turns off autopilot
        await tx
          .update(ludoPlayers)
          .set({ autopilot: false })
          .where(
            and(
              eq(ludoPlayers.roomId, roomId),
              eq(ludoPlayers.userId, actor.userId),
            ),
          );

        let nextState: LudoState;
        try {
          if (action.action === "roll") {
            nextState = autoMove(roll(state, rng));
          } else {
            nextState = move(state, Number(action.pawn));
          }
        } catch (err) {
          throw new AppError(
            action.action === "move" ? "LUDO_ILLEGAL_MOVE" : "LUDO_BAD_STATE",
            400,
            { message: err instanceof Error ? err.message : "Invalid action" },
          );
        }

        const nextStatus: RoomStatus =
          nextState.winner !== null ? "finished" : "playing";
        event = nextState.last ?? null;

        await tx
          .update(ludoRooms)
          .set({
            state: nextState as unknown as Record<string, unknown>,
            status: nextStatus,
            finishedAt: nextState.winner !== null ? now : null,
            version: sql`${ludoRooms.version} + 1`,
            updatedAt: now,
            lastActivityAt: now,
          })
          .where(eq(ludoRooms.id, roomId));
        break;
      }

      case "skip": {
        if (!isHost && !isAdmin) throw new AppError("LUDO_FORBIDDEN", 403);
        if (room.status !== "playing" || !room.state) {
          throw new AppError("LUDO_BAD_STATE", 409);
        }
        const nextState = skip(room.state);
        event = nextState.last ?? null;

        await tx
          .update(ludoRooms)
          .set({
            state: nextState as unknown as Record<string, unknown>,
            version: sql`${ludoRooms.version} + 1`,
            updatedAt: now,
            lastActivityAt: now,
          })
          .where(eq(ludoRooms.id, roomId));
        break;
      }

      case "autopilot": {
        const targetUserId =
          typeof action.userId === "string" && action.userId
            ? action.userId
            : actor.userId;
        if (targetUserId !== actor.userId && !isHost && !isAdmin) {
          throw new AppError("LUDO_FORBIDDEN", 403);
        }
        if (!accepted.some((p) => p.userId === targetUserId)) {
          throw new AppError("LUDO_NOT_MEMBER", 403);
        }
        if (room.status !== "playing") {
          throw new AppError("LUDO_BAD_STATE", 409);
        }

        await tx
          .update(ludoPlayers)
          .set({ autopilot: !!action.on })
          .where(
            and(
              eq(ludoPlayers.roomId, roomId),
              eq(ludoPlayers.userId, targetUserId),
            ),
          );

        await tx
          .update(ludoRooms)
          .set({
            version: sql`${ludoRooms.version} + 1`,
            updatedAt: now,
            lastActivityAt: now,
          })
          .where(eq(ludoRooms.id, roomId));
        break;
      }

      case "reset": {
        if (!isHost && !isAdmin) throw new AppError("LUDO_FORBIDDEN", 403);
        if (room.status === "lobby") throw new AppError("LUDO_BAD_STATE", 409);

        await tx
          .update(ludoRooms)
          .set({
            status: "lobby",
            state: null,
            seatUsers: null,
            pawns: null,
            startedAt: null,
            finishedAt: null,
            version: sql`${ludoRooms.version} + 1`,
            updatedAt: now,
            lastActivityAt: now,
          })
          .where(eq(ludoRooms.id, roomId));

        await tx
          .update(ludoPlayers)
          .set({ autopilot: false })
          .where(eq(ludoPlayers.roomId, roomId));
        break;
      }

      case "chat": {
        const text =
          typeof action.text === "string" ? action.text.trim().slice(0, 300) : "";
        if (!text) {
          throw new AppError("VALIDATION_FAILED", 400, {
            message: "Chat message is empty",
          });
        }

        const cleanText = censorServerText(text);
        const [inserted] = await tx
          .insert(ludoMessages)
          .values({
            roomId,
            userId: actor.userId,
            body: cleanText,
            createdAt: now,
          })
          .returning();

        chatMessage = {
          id: inserted!.id,
          roomId,
          userId: actor.userId,
          name: censorServerText(actor.displayName),
          text: cleanText,
          at: now.toISOString(),
        };

        await tx
          .update(ludoRooms)
          .set({ lastActivityAt: now })
          .where(eq(ludoRooms.id, roomId));
        break;
      }

      default:
        throw new AppError("VALIDATION_FAILED", 400, {
          message: "Unknown action",
        });
    }

    const updatedRoom = await loadRoom(tx, roomId, false);
    const view = await buildView(tx, updatedRoom, actor);

    return { view, event, chatMessage };
  });
}
