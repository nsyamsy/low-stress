import { randomInt } from "node:crypto";
import type { Namespace } from "socket.io";
import {
  autoMove,
  cpuMove,
  move,
  roll,
  type LastEvent,
  type LudoState,
} from "../shared/engine";
import {
  type Database,
  ludoRooms,
  ludoPlayers,
  eq,
  and,
  sql,
} from "@low-stress/sdk/server";
import { getRoomView } from "./service";
import type { LudoActor, RoomStatus } from "./types";

const rng = () => randomInt(0, 1_000_000) / 1_000_000;

export interface AutopilotOptions {
  paceMs?: number;
  idleTimeoutMs?: number;
  checkGameGate?: (gameId: string) => Promise<unknown>;
}

export const DEFAULT_AUTOPILOT_PACE_MS = 1500;
export const DEFAULT_IDLE_TIMEOUT_MS = 60 * 1000;

export class AutopilotManager {
  private timers = new Map<string, NodeJS.Timeout>();
  private isStopped = false;
  private paceMs: number;
  private idleTimeoutMs: number;
  private checkGate?: (gameId: string) => Promise<unknown>;

  constructor(
    private nsp: Namespace,
    private db: Database,
    options: AutopilotOptions = {},
  ) {
    this.paceMs = options.paceMs ?? DEFAULT_AUTOPILOT_PACE_MS;
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    this.checkGate = options.checkGameGate;
  }

  public getPaceMs(): number {
    return this.paceMs;
  }

  public getIdleTimeoutMs(): number {
    return this.idleTimeoutMs;
  }

  public clearRoom(roomId: string): void {
    const existing = this.timers.get(roomId);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(roomId);
    }
  }

  public stopAll(): void {
    this.isStopped = true;
    for (const [, timer] of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  public async resumeActiveRooms(): Promise<void> {
    try {
      const activeRooms = await this.db
        .select({ id: ludoRooms.id })
        .from(ludoRooms)
        .where(eq(ludoRooms.status, "playing"));

      for (const room of activeRooms) {
        void this.onRoomUpdated(room.id);
      }
    } catch {
      // Abaikan bila skema belum siap
    }
  }

  public async onRoomUpdated(roomId: string): Promise<void> {
    if (this.isStopped) return;
    this.clearRoom(roomId);

    if (this.checkGate) {
      try {
        await this.checkGate("ludo");
      } catch {
        return;
      }
    }

    try {
      const [room] = await this.db
        .select({
          id: ludoRooms.id,
          status: ludoRooms.status,
          seatUsers: ludoRooms.seatUsers,
          state: ludoRooms.state,
        })
        .from(ludoRooms)
        .where(eq(ludoRooms.id, roomId))
        .limit(1);

      if (!room || room.status !== "playing") return;
      const state = room.state as unknown as LudoState;
      if (!state) return;
      if (state.winner !== null) return;

      const seatUsers = room.seatUsers ?? [];
      const currentTurnUserId = seatUsers[state.turn];
      if (!currentTurnUserId) return;

      const [player] = await this.db
        .select({
          userId: ludoPlayers.userId,
          autopilot: ludoPlayers.autopilot,
        })
        .from(ludoPlayers)
        .where(
          and(
            eq(ludoPlayers.roomId, roomId),
            eq(ludoPlayers.userId, currentTurnUserId),
          ),
        )
        .limit(1);

      if (this.isStopped) return;

      // Jika pemain pada kursi ini telah dihapus (tidak ada di ludo_players) atau autopilot menyala,
      // jalankan giliran secara otomatis lewat CPU autopilot agar permainan tidak macet.
      if (!player || player.autopilot) {
        const timer = setTimeout(() => {
          this.timers.delete(roomId);
          void this.executeAutopilotTurn(roomId);
        }, this.paceMs);
        this.timers.set(roomId, timer);
      } else {
        const timer = setTimeout(() => {
          this.timers.delete(roomId);
          void this.handleIdleTimeout(roomId, currentTurnUserId);
        }, this.idleTimeoutMs);
        this.timers.set(roomId, timer);
      }
    } catch {
      // Abaikan error penjadwalan
    }
  }

  private async handleIdleTimeout(
    roomId: string,
    userId: string,
  ): Promise<void> {
    if (this.isStopped) return;

    try {
      const updated = await this.db
        .update(ludoPlayers)
        .set({ autopilot: true })
        .where(
          and(
            eq(ludoPlayers.roomId, roomId),
            eq(ludoPlayers.userId, userId),
            eq(ludoPlayers.autopilot, false),
          ),
        )
        .returning({ userId: ludoPlayers.userId });

      if (updated.length > 0) {
        this.nsp.to(`ludo:${roomId}`).emit("player:autopilot", {
          roomId,
          userId,
          autopilot: true,
          reason: "idle_timeout",
        });

        const socketsInRoom = await this.nsp.in(`ludo:${roomId}`).fetchSockets();
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
            const personalView = await getRoomView(this.db, roomId, targetActor);
            s.emit("room:state", personalView);
          } catch {
            // Abaikan error saat kirim personal view
          }
        }

        await this.executeAutopilotTurn(roomId);
      }
    } catch {
      // Abaikan error saat takeover
    }
  }

  public async executeAutopilotTurn(roomId: string): Promise<void> {
    if (this.isStopped) return;

    if (this.checkGate) {
      try {
        await this.checkGate("ludo");
      } catch {
        return;
      }
    }

    let eventToBroadcast: LastEvent | null = null;
    let nextStatus: RoomStatus | null = null;

    try {
      await this.db.transaction(async (tx) => {
        const [room] = await tx
          .select({
            id: ludoRooms.id,
            status: ludoRooms.status,
            seatUsers: ludoRooms.seatUsers,
            state: ludoRooms.state,
          })
          .from(ludoRooms)
          .where(eq(ludoRooms.id, roomId))
          .for("update")
          .limit(1);

        if (!room || room.status !== "playing") return;
        const state = room.state as unknown as LudoState;
        if (!state) return;
        if (state.winner !== null) return;

        const seatUsers = room.seatUsers ?? [];
        const currentTurnUserId = seatUsers[state.turn];
        if (!currentTurnUserId) return;

        const [player] = await tx
          .select({ autopilot: ludoPlayers.autopilot })
          .from(ludoPlayers)
          .where(
            and(
              eq(ludoPlayers.roomId, roomId),
              eq(ludoPlayers.userId, currentTurnUserId),
            ),
          )
          .limit(1);

        if (player && !player.autopilot) return;

        const now = new Date();
        let nextState: LudoState;

        if (state.phase === "roll" || state.dice === null) {
          nextState = roll(state, rng);
          nextState = autoMove(nextState);
          if (nextState.phase === "move" && nextState.dice !== null) {
            const pawn = cpuMove(nextState);
            nextState = move(nextState, pawn);
          }
        } else if (state.phase === "move") {
          const pawn = cpuMove(state);
          nextState = move(state, pawn);
        } else {
          return;
        }

        const isFinished = nextState.winner !== null;
        nextStatus = isFinished ? "finished" : "playing";
        eventToBroadcast = nextState.last ?? null;

        await tx
          .update(ludoRooms)
          .set({
            state: nextState as unknown as Record<string, unknown>,
            status: nextStatus,
            finishedAt: isFinished ? now : null,
            version: sql`${ludoRooms.version} + 1`,
            updatedAt: now,
            lastActivityAt: now,
          })
          .where(eq(ludoRooms.id, roomId));
      });

      if (eventToBroadcast) {
        this.nsp.to(`ludo:${roomId}`).emit("room:event", eventToBroadcast);
      }

      const socketsInRoom = await this.nsp.in(`ludo:${roomId}`).fetchSockets();
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
          const personalView = await getRoomView(this.db, roomId, targetActor);
          s.emit("room:state", personalView);
        } catch {
          // Abaikan error saat kirim personal view
        }
      }

      if (nextStatus === "playing") {
        void this.onRoomUpdated(roomId);
      } else {
        this.clearRoom(roomId);
      }
    } catch {
      // Abaikan error autopilot
    }
  }
}
