// Ludo rooms of Commercial > Utilities > Ludo. A room is created by its host, who invites Commercial
// users; invited users accept or decline. Once the host starts, the state lives in the database until
// somebody wins, and only an administrator can reset the room into a new game.
// All rules run here: the server rolls the dice and checks every move, the browser only draws and polls.
import { randomInt, randomUUID } from "crypto";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { commercialUserCondition } from "@/lib/commercial";
import { isPrivilegedRole } from "@/lib/role-constants";
import * as E from "@/lib/ludo-engine";

export class LudoError extends Error {
  constructor(
    message: string,
    public status: number = 400
  ) {
    super(message);
  }
}

type Q = { execute: (query: SQL) => Promise<{ rows: unknown[] }> };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

let ensured = false;
let inFlight: Promise<void> | null = null;

export function ensureLudoTables(): Promise<void> {
  if (ensured) return Promise.resolve();
  inFlight ??= (async () => {
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "commercial_ludo_rooms" (
          "id" varchar(36) PRIMARY KEY,
          "name" varchar(60) NOT NULL,
          "host_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "status" varchar(10) NOT NULL DEFAULT 'lobby',
          "max_players" integer NOT NULL DEFAULT 4,
          "pawns" integer,
          "seat_users" jsonb,
          "state" jsonb,
          "version" integer NOT NULL DEFAULT 0,
          "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS "commercial_ludo_players" (
          "room_id" varchar(36) NOT NULL REFERENCES "commercial_ludo_rooms"("id") ON DELETE CASCADE,
          "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "status" varchar(10) NOT NULL DEFAULT 'invited',
          "invited_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "joined_at" timestamp with time zone,
          PRIMARY KEY ("room_id", "user_id")
        );
        ALTER TABLE "commercial_ludo_players" ADD COLUMN IF NOT EXISTS "pawn" varchar(12);
        ALTER TABLE "commercial_ludo_rooms" ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone;
        ALTER TABLE "commercial_ludo_rooms" ADD COLUMN IF NOT EXISTS "finished_at" timestamp with time zone;
        ALTER TABLE "commercial_ludo_players" ADD COLUMN IF NOT EXISTS "autopilot" boolean NOT NULL DEFAULT false;
        CREATE TABLE IF NOT EXISTS "commercial_ludo_messages" (
          "id" bigserial PRIMARY KEY,
          "room_id" varchar(36) NOT NULL REFERENCES "commercial_ludo_rooms"("id") ON DELETE CASCADE,
          "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "body" varchar(500) NOT NULL,
          "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS "idx_commercial_ludo_messages_room" ON "commercial_ludo_messages" ("room_id", "id");
        CREATE INDEX IF NOT EXISTS "idx_commercial_ludo_players_user" ON "commercial_ludo_players" ("user_id");
      `);
      ensured = true;
    } catch (error) {
      console.error("[Ludo] could not create the tables:", error);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export interface Actor {
  userId: string;
  name: string;
  role: string;
}

export type RoomStatus = "lobby" | "playing" | "finished";
/** "observer" is a host who runs the room without taking a seat. */
export type PlayerStatus = "invited" | "accepted" | "declined" | "observer";

export interface RoomSummary {
  id: string;
  name: string;
  status: RoomStatus;
  hostId: string;
  hostName: string;
  maxPlayers: number;
  accepted: number;
  /** null for an administrator who is not in the room. */
  myStatus: PlayerStatus | null;
  updatedAt: string;
}

export interface PlayerView {
  userId: string;
  name: string;
  status: PlayerStatus;
  isHost: boolean;
  isMe: boolean;
  /** Index in the turn order once the game started. */
  seat: number | null;
  /** The shape of this player's pawns. */
  pawn: E.PawnCharacter;
  /** The CPU plays this player's turns. */
  autopilot: boolean;
}

export interface ChatMessage {
  id: number;
  userId: string;
  name: string;
  text: string;
  at: string;
}

export interface RoomView {
  id: string;
  name: string;
  status: RoomStatus;
  hostId: string;
  maxPlayers: number;
  /** Pawns each player has in the running game. */
  pawns: number;
  version: number;
  updatedAt: string;
  players: PlayerView[];
  /** Seconds the game has been running (frozen once somebody won); null for a game that has not started. */
  elapsed: number | null;
  /** The latest chat messages, oldest first. */
  messages: ChatMessage[];
  state: E.LudoState | null;
  isHost: boolean;
  isAdmin: boolean;
  mySeat: number | null;
  /** Pawns the viewer may move right now. */
  movable: number[];
  /** Commercial users the host can still invite (lobby only). */
  invitable: { id: string; name: string }[];
}

interface RoomRow {
  id: string;
  name: string;
  host_id: string;
  status: RoomStatus;
  max_players: number;
  pawns: number | null;
  seat_users: string[] | null;
  state: E.LudoState | null;
  version: number;
  updated_at: string | Date;
  elapsed: number | null;
}

const CHAT_LIMIT = 80;

const clampPlayers = (v: unknown) => Math.min(E.MAX_PLAYERS, Math.max(E.MIN_PLAYERS, Math.trunc(Number(v)) || 4));

/** The rooms the user takes part in; an administrator sees every room, since only they can reset one. */
export async function listRooms(actor: Actor): Promise<RoomSummary[]> {
  await ensureLudoTables();
  const all = isPrivilegedRole(actor.role);
  const res = await db.execute(sql`
    SELECT r.id, r.name, r.status, r.host_id AS "hostId", h.name AS "hostName", r.max_players AS "maxPlayers",
           (SELECT COUNT(*) FROM commercial_ludo_players a WHERE a.room_id = r.id AND a.status = 'accepted')::int AS accepted,
           me.status AS "myStatus", r.updated_at AS "updatedAt"
      FROM commercial_ludo_rooms r
      JOIN users h ON h.id = r.host_id
      LEFT JOIN commercial_ludo_players me ON me.room_id = r.id AND me.user_id = ${actor.userId}
     WHERE ${all ? sql`TRUE` : sql`me.status IS NOT NULL AND me.status <> 'declined'`}
     ORDER BY r.updated_at DESC
     LIMIT 50
  `);
  return (res.rows as (Omit<RoomSummary, "updatedAt"> & { updatedAt: string | Date })[]).map((r) => ({
    ...r,
    updatedAt: new Date(r.updatedAt).toISOString(),
  }));
}

export async function createRoom(actor: Actor, name: unknown, maxPlayers: unknown, play: unknown = true): Promise<string> {
  await ensureLudoTables();
  const title = typeof name === "string" ? name.trim().slice(0, 60) : "";
  if (!title) throw new LudoError("Give the room a name");
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.execute(sql`INSERT INTO commercial_ludo_rooms (id, name, host_id, max_players) VALUES (${id}, ${title}, ${actor.userId}, ${clampPlayers(maxPlayers)})`);
    await tx.execute(sql`INSERT INTO commercial_ludo_players (room_id, user_id, status, joined_at) VALUES (${id}, ${actor.userId}, ${play === false ? "observer" : "accepted"}, CURRENT_TIMESTAMP)`);
  });
  return id;
}

const ELAPSED = sql.raw("CASE WHEN started_at IS NULL THEN NULL ELSE EXTRACT(EPOCH FROM (COALESCE(finished_at, CURRENT_TIMESTAMP) - started_at))::float END");

async function loadRoom(q: Q, roomId: string, lock: boolean): Promise<RoomRow> {
  const res = lock
    ? await q.execute(sql`SELECT *, ${ELAPSED} AS elapsed FROM commercial_ludo_rooms WHERE id = ${roomId} FOR UPDATE`)
    : await q.execute(sql`SELECT *, ${ELAPSED} AS elapsed FROM commercial_ludo_rooms WHERE id = ${roomId}`);
  const row = res.rows[0] as RoomRow | undefined;
  if (!row) throw new LudoError("Room not found", 404);
  return row;
}

async function loadPlayers(q: Q, roomId: string) {
  const res = await q.execute(sql`
    SELECT p.user_id AS "userId", u.name, p.status, p.pawn, p.autopilot
      FROM commercial_ludo_players p JOIN users u ON u.id = p.user_id
     WHERE p.room_id = ${roomId}
     ORDER BY p.joined_at NULLS LAST, p.invited_at
  `);
  return res.rows as { userId: string; name: string; status: PlayerStatus; pawn: string | null; autopilot: boolean }[];
}

async function buildView(q: Q, room: RoomRow, actor: Actor): Promise<RoomView> {
  const players = await loadPlayers(q, room.id);
  const mine = players.find((p) => p.userId === actor.userId);
  const isAdmin = isPrivilegedRole(actor.role);
  if (!mine && !isAdmin) throw new LudoError("Room not found", 404);

  const seatUsers = room.seat_users ?? [];
  const mySeat = seatUsers.indexOf(actor.userId);
  const state = room.state;
  const isHost = room.host_id === actor.userId;

  let movable: number[] = [];
  if (state && state.winner === null && state.phase === "move" && state.dice !== null && mySeat === state.turn) {
    movable = E.legalPawns(state, state.dice);
  }

  let invitable: { id: string; name: string }[] = [];
  if (isHost && room.status === "lobby") {
    const taken = players.filter((p) => p.status !== "declined").map((p) => p.userId);
    const rows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.isActive, true), commercialUserCondition()))
      .orderBy(users.name);
    invitable = rows.filter((u) => !taken.includes(u.id));
  }

  const chat = await q.execute(sql`
    SELECT * FROM (
      SELECT m.id::int AS id, m.user_id AS "userId", u.name, m.body AS text, m.created_at AS at
        FROM commercial_ludo_messages m JOIN users u ON u.id = m.user_id
       WHERE m.room_id = ${room.id} ORDER BY m.id DESC LIMIT ${CHAT_LIMIT}
    ) t ORDER BY id
  `);
  const messages = (chat.rows as (Omit<ChatMessage, "at"> & { at: string | Date })[]).map((m) => ({ ...m, at: new Date(m.at).toISOString() }));

  return {
    id: room.id,
    name: room.name,
    status: room.status,
    hostId: room.host_id,
    maxPlayers: room.max_players,
    pawns: state ? state.pawns[0].length : E.defaultPawns(players.filter((p) => p.status === "accepted").length),
    version: room.version,
    updatedAt: new Date(room.updated_at).toISOString(),
    players: players.map((p) => ({
      userId: p.userId,
      name: p.name,
      status: p.status,
      isHost: p.userId === room.host_id,
      isMe: p.userId === actor.userId,
      seat: seatUsers.includes(p.userId) ? seatUsers.indexOf(p.userId) : null,
      pawn: E.isPawnCharacter(p.pawn) ? p.pawn : "pin",
      autopilot: p.autopilot,
    })),
    messages,
    elapsed: room.elapsed === null || room.elapsed === undefined ? null : Number(room.elapsed),
    state,
    isHost,
    isAdmin,
    mySeat: mySeat >= 0 ? mySeat : null,
    movable,
    invitable,
  };
}

export async function getRoom(roomId: string, actor: Actor): Promise<RoomView> {
  await ensureLudoTables();
  try {
    await autopilotTick(roomId);
  } catch (error) {
    console.error("[Ludo] autopilot step failed:", error);
  }
  return buildView(db, await loadRoom(db, roomId, false), actor);
}

export type LudoAction =
  | { action: "invite"; userIds: string[] }
  | { action: "respond"; accept: boolean }
  | { action: "kick"; userId: string }
  | { action: "start"; pawns?: number; exit?: string; goal?: number }
  | { action: "roll" }
  | { action: "move"; pawn: number }
  | { action: "skip" }
  | { action: "pawn"; pawn: string }
  | { action: "participate"; play: boolean }
  | { action: "chat"; text: string }
  | { action: "autopilot"; on: boolean; userId?: string }
  | { action: "reset" };

/** With a single choice there is nothing to decide: when every pawn that can move stands on the same square (or there is only one), the move is made at once. */
function autoMove(state: E.LudoState): E.LudoState {
  if (state.phase !== "move" || state.dice === null) return state;
  const legal = E.legalPawns(state, state.dice);
  const mine = state.pawns[state.turn];
  if (legal.length === 0 || legal.some((j) => mine[j] !== mine[legal[0]])) return state;
  return E.move(state, legal[0]);
}

// The CPU waits a moment so everybody can follow its moves, and takes over a player who sits out their turn.
const PACE_SECONDS = 1.5;
const IDLE_SECONDS = 60;

/**
 * Plays one step for a player on autopilot. There is no background worker, so whoever polls the room
 * drives it; the row lock keeps two pollers from playing the same step twice.
 */
async function autopilotTick(roomId: string): Promise<void> {
  const peek = await db.execute(sql`SELECT status, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - updated_at))::float AS idle FROM commercial_ludo_rooms WHERE id = ${roomId}`);
  const first = peek.rows[0] as { status: RoomStatus; idle: number } | undefined;
  if (!first || first.status !== "playing" || Number(first.idle) < PACE_SECONDS) return;
  await db.transaction(async (tx) => {
    const res = await tx.execute(sql`SELECT *, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - updated_at))::float AS idle FROM commercial_ludo_rooms WHERE id = ${roomId} FOR UPDATE`);
    const room = res.rows[0] as unknown as (RoomRow & { idle: number }) | undefined;
    if (!room || room.status !== "playing" || !room.state || room.state.winner !== null || Number(room.idle) < PACE_SECONDS) return;
    const userId = (room.seat_users ?? [])[room.state.turn];
    const player = userId ? (await loadPlayers(tx, roomId)).find((p) => p.userId === userId) : undefined;
    if (!player) return;
    if (!player.autopilot) {
      if (Number(room.idle) < IDLE_SECONDS) return;
      await tx.execute(sql`UPDATE commercial_ludo_players SET autopilot = TRUE WHERE room_id = ${roomId} AND user_id = ${player.userId}`);
    }
    const state = room.state;
    await saveState(tx, room, state.phase === "roll" ? autoMove(E.roll(state, rng)) : E.move(state, E.cpuMove(state)));
  });
}

const rng = () => randomInt(0, 1_000_000) / 1_000_000;

async function saveState(tx: Tx, room: RoomRow, state: E.LudoState) {
  const status: RoomStatus = state.winner !== null ? "finished" : "playing";
  await tx.execute(sql`
    UPDATE commercial_ludo_rooms
       SET state = ${JSON.stringify(state)}::jsonb, status = ${status}, version = version + 1, updated_at = CURRENT_TIMESTAMP${state.winner !== null ? sql`, finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP)` : sql``}
     WHERE id = ${room.id}
  `);
}

async function touch(tx: Tx, roomId: string) {
  await tx.execute(sql`UPDATE commercial_ludo_rooms SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ${roomId}`);
}

/** Removes a room with its players, whatever state it is in. Administrators only. */
export async function deleteRoom(roomId: string, actor: Actor): Promise<void> {
  await ensureLudoTables();
  if (!isPrivilegedRole(actor.role)) throw new LudoError("Only an administrator can delete a room", 403);
  const res = await db.execute(sql`DELETE FROM commercial_ludo_rooms WHERE id = ${roomId} RETURNING id`);
  if (res.rows.length === 0) throw new LudoError("Room not found", 404);
}

/** Runs one action under a row lock, so two players acting at once cannot both win a race. */
export async function performAction(roomId: string, actor: Actor, body: LudoAction): Promise<RoomView> {
  await ensureLudoTables();
  return db.transaction(async (tx) => {
    const room = await loadRoom(tx, roomId, true);
    const isHost = room.host_id === actor.userId;
    const isAdmin = isPrivilegedRole(actor.role);
    const players = await loadPlayers(tx, roomId);
    const mine = players.find((p) => p.userId === actor.userId);
    if (!mine && !isAdmin) throw new LudoError("Room not found", 404);
    const accepted = players.filter((p) => p.status === "accepted");

    switch (body.action) {
      case "invite": {
        if (!isHost) throw new LudoError("Only the host can invite", 403);
        if (room.status !== "lobby") throw new LudoError("The game already started");
        const ids = [...new Set((Array.isArray(body.userIds) ? body.userIds : []).filter((i): i is string => typeof i === "string"))].slice(0, 30);
        if (ids.length === 0) throw new LudoError("Pick who to invite");
        const valid = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(inArray(users.id, ids), eq(users.isActive, true), commercialUserCondition()));
        if (valid.length === 0) throw new LudoError("Those users cannot play");
        for (const v of valid) {
          await tx.execute(sql`
            INSERT INTO commercial_ludo_players (room_id, user_id, status) VALUES (${roomId}, ${v.id}, 'invited')
            ON CONFLICT (room_id, user_id) DO UPDATE SET status = 'invited', invited_at = CURRENT_TIMESTAMP
              WHERE commercial_ludo_players.status = 'declined'
          `);
        }
        await touch(tx, roomId);
        break;
      }
      case "respond": {
        if (!mine) throw new LudoError("You are not invited to this room", 403);
        if (room.status !== "lobby") throw new LudoError("The game already started");
        if (isHost) throw new LudoError("The host stays in the room");
        if (body.accept) {
          if (mine.status !== "accepted" && accepted.length >= room.max_players) throw new LudoError("The room is full");
          await tx.execute(sql`UPDATE commercial_ludo_players SET status = 'accepted', joined_at = COALESCE(joined_at, CURRENT_TIMESTAMP) WHERE room_id = ${roomId} AND user_id = ${actor.userId}`);
        } else {
          await tx.execute(sql`UPDATE commercial_ludo_players SET status = 'declined', joined_at = NULL WHERE room_id = ${roomId} AND user_id = ${actor.userId}`);
        }
        await touch(tx, roomId);
        break;
      }
      case "chat": {
        // everybody in the room can talk, in every state of the game; messages do not bump the room version
        const text = typeof body.text === "string" ? body.text.trim().slice(0, 500) : "";
        if (!text) throw new LudoError("Write a message first");
        await tx.execute(sql`INSERT INTO commercial_ludo_messages (room_id, user_id, body) VALUES (${roomId}, ${actor.userId}, ${text})`);
        break;
      }
      case "autopilot": {
        // a player switches their own autopilot; the host or an administrator can do it for somebody who left
        const target = typeof body.userId === "string" && body.userId ? body.userId : actor.userId;
        if (target !== actor.userId && !isHost && !isAdmin) throw new LudoError("Only the host or an administrator can do that", 403);
        if (!accepted.some((p) => p.userId === target)) throw new LudoError("That player is not in the game");
        if (room.status !== "playing") throw new LudoError("The game is not running");
        await tx.execute(sql`UPDATE commercial_ludo_players SET autopilot = ${!!body.on} WHERE room_id = ${roomId} AND user_id = ${target}`);
        await touch(tx, roomId);
        break;
      }
      case "participate": {
        // the host chooses to play, or to only run the room
        if (!isHost) throw new LudoError("Only the host can choose this", 403);
        if (room.status !== "lobby") throw new LudoError("The game already started");
        if (body.play && accepted.length >= room.max_players && mine?.status !== "accepted") throw new LudoError("The room is full");
        await tx.execute(sql`UPDATE commercial_ludo_players SET status = ${body.play ? "accepted" : "observer"} WHERE room_id = ${roomId} AND user_id = ${actor.userId}`);
        await touch(tx, roomId);
        break;
      }
      case "pawn": {
        // anybody who joined can change their pawn, also during the game: it only changes how it looks
        if (!mine || mine.status !== "accepted") throw new LudoError("Join the room first", 403);
        if (!E.isPawnCharacter(body.pawn)) throw new LudoError("Unknown pawn");
        await tx.execute(sql`UPDATE commercial_ludo_players SET pawn = ${body.pawn} WHERE room_id = ${roomId} AND user_id = ${actor.userId}`);
        await touch(tx, roomId);
        break;
      }
      case "kick": {
        if (!isHost) throw new LudoError("Only the host can remove players", 403);
        if (room.status !== "lobby") throw new LudoError("The game already started");
        if (body.userId === room.host_id) throw new LudoError("The host cannot be removed");
        await tx.execute(sql`DELETE FROM commercial_ludo_players WHERE room_id = ${roomId} AND user_id = ${String(body.userId)}`);
        await touch(tx, roomId);
        break;
      }
      case "start": {
        if (!isHost) throw new LudoError("Only the host can start the game", 403);
        if (room.status !== "lobby") throw new LudoError("The game already started");
        if (accepted.length < E.MIN_PLAYERS) throw new LudoError("At least 2 players must have joined");
        const pawnsEach = body.pawns === undefined ? E.defaultPawns(accepted.length) : Math.min(E.PAWNS, Math.max(1, Math.trunc(Number(body.pawns)) || 1));
        await tx.execute(sql`UPDATE commercial_ludo_players SET autopilot = FALSE WHERE room_id = ${roomId}`);
        const state = E.newState(accepted.length, pawnsEach, E.isExitRule(body.exit) ? body.exit : "double", Number(body.goal) || 1);
        await tx.execute(sql`UPDATE commercial_ludo_rooms SET seat_users = ${JSON.stringify(accepted.map((p) => p.userId))}::jsonb, pawns = ${pawnsEach}, started_at = CURRENT_TIMESTAMP, finished_at = NULL WHERE id = ${roomId}`);
        await saveState(tx, room, state);
        break;
      }
      case "roll":
      case "move": {
        const state = room.state;
        if (room.status !== "playing" || !state) throw new LudoError("The game is not running");
        const seat = (room.seat_users ?? []).indexOf(actor.userId);
        if (seat < 0 || seat !== state.turn) throw new LudoError("It is not your turn");
        // playing yourself takes the turn back from the CPU
        await tx.execute(sql`UPDATE commercial_ludo_players SET autopilot = FALSE WHERE room_id = ${roomId} AND user_id = ${actor.userId}`);
        try {
          await saveState(tx, room, body.action === "roll" ? autoMove(E.roll(state, rng)) : E.move(state, Number(body.pawn)));
        } catch (e) {
          throw new LudoError(e instanceof Error ? e.message : "Invalid move");
        }
        break;
      }
      case "skip": {
        if (!isHost && !isAdmin) throw new LudoError("Only the host or an administrator can skip a turn", 403);
        if (room.status !== "playing" || !room.state) throw new LudoError("The game is not running");
        await saveState(tx, room, E.skip(room.state));
        break;
      }
      case "reset": {
        // The host and the players cannot start over on their own: that is for administrators only.
        if (!isAdmin) throw new LudoError("Only an administrator can start a new game", 403);
        if (room.status === "lobby") throw new LudoError("The room is already in the lobby");
        await tx.execute(sql`
          UPDATE commercial_ludo_rooms
             SET status = 'lobby', state = NULL, seat_users = NULL, pawns = NULL, started_at = NULL, finished_at = NULL, version = version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE id = ${roomId}
        `);
        await tx.execute(sql`UPDATE commercial_ludo_players SET autopilot = FALSE WHERE room_id = ${roomId}`);
        break;
      }
      default:
        throw new LudoError("Unknown action");
    }

    return buildView(tx, await loadRoom(tx, roomId, false), actor);
  });
}
