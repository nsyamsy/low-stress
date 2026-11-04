import { randomInt } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Namespace } from "socket.io";
import type { Database } from "@low-stress/db";
import { ludoPlayers, ludoRooms } from "@low-stress/db";
import { checkGameGate } from "../games/service";
import {
  autoMove,
  cpuMove,
  move,
  roll,
  type LastEvent,
  type LudoState,
} from "./engine";
import { getRoomView } from "./service";
import type { LudoActor, RoomStatus } from "./types";

export interface AutopilotOptions {
  paceMs?: number; // bawaan 1500 ms (1.5 detik)
  idleTimeoutMs?: number; // bawaan 60000 ms (60 detik)
}

const rng = () => randomInt(0, 1_000_000) / 1_000_000;

export class AutopilotManager {
  private timers = new Map<string, NodeJS.Timeout>();
  private readonly paceMs: number;
  private readonly idleTimeoutMs: number;
  private isStopped = false;

  constructor(
    private readonly nsp: Namespace,
    private readonly db: Database,
    options: AutopilotOptions = {},
  ) {
    this.paceMs = options.paceMs ?? 1500;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 60_000;
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

      for (const r of activeRooms) {
        void this.onRoomUpdated(r.id);
      }
    } catch {
      // Ignore if DB not ready or migrated yet
    }
  }

  public async broadcastState(roomId: string, event?: LastEvent | null): Promise<void> {
    try {
      const sockets = await this.nsp.in(`ludo:${roomId}`).fetchSockets();
      for (const s of sockets) {
        const u = s.data.user;
        const a = s.data.admin;
        const actor: LudoActor = u
          ? { userId: u.id, username: u.username, displayName: u.displayName }
          : { userId: a?.id, username: a?.username, displayName: a?.username, isAdmin: true };
        try {
          const personalView = await getRoomView(this.db, roomId, actor);
          s.emit("room:state", personalView);
        } catch {
          // Socket might have left
        }
      }

      if (event) {
        this.nsp.to(`ludo:${roomId}`).emit("room:event", event);
      }
    } catch {
      // Ignore broadcast errors
    }
  }

  public async onRoomUpdated(roomId: string): Promise<void> {
    if (this.isStopped) return;
    this.clearRoom(roomId);

    // Jika game ditutup/maintenance, room dibekukan (tidak dijadwalkan giliran autopilot)
    try {
      await checkGameGate(this.db, "ludo");
    } catch {
      return;
    }

    try {
      // Periksa status room dan giliran pemain
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

      if (this.isStopped || !room || room.status !== "playing" || !room.state || !room.seatUsers) {
        return;
      }

      const state = room.state as unknown as LudoState;
      if (state.winner !== null) return;

      const currentTurnUserId = room.seatUsers[state.turn];
      if (!currentTurnUserId) return;

      const [player] = await this.db
        .select({
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

      if (this.isStopped || !player) return;

      if (player.autopilot) {
        // Pemain sedang autopilot: jadwalkan langkah autopilot setelah paceMs (1.5 dtk)
        const timer = setTimeout(() => {
          void this.executeAutopilotTurn(roomId);
        }, this.paceMs);
        this.timers.set(roomId, timer);
      } else {
        // Pemain aktif: jadwalkan pengambilalihan autopilot jika diam selama idleTimeoutMs (60 dtk)
        const timer = setTimeout(() => {
          void this.handleIdleTimeout(roomId, currentTurnUserId);
        }, this.idleTimeoutMs);
        this.timers.set(roomId, timer);
      }
    } catch {
      // Abaikan jika koneksi ditutup saat shutdown / teardown tes
    }
  }

  private async handleIdleTimeout(roomId: string, idleUserId: string): Promise<void> {
    if (this.isStopped) return;
    this.clearRoom(roomId);

    try {
      // Aktifkan autopilot untuk pemain yang idle
      await this.db
        .update(ludoPlayers)
        .set({ autopilot: true })
        .where(
          and(
            eq(ludoPlayers.roomId, roomId),
            eq(ludoPlayers.userId, idleUserId),
          ),
        );

      await this.db
        .update(ludoRooms)
        .set({
          version: sql`${ludoRooms.version} + 1`,
          lastActivityAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(ludoRooms.id, roomId));

      // Siarkan pembaruan bahwa pemain telah dialihkan ke autopilot
      await this.broadcastState(roomId);

      // Jalankan aksi autopilot
      await this.executeAutopilotTurn(roomId);
    } catch {
      // Ignore error during timeout handling
    }
  }

  public async executeAutopilotTurn(roomId: string): Promise<void> {
    if (this.isStopped) return;
    this.clearRoom(roomId);

    // Jika game ditutup/maintenance, jangan jalankan langkah autopilot
    try {
      await checkGameGate(this.db, "ludo");
    } catch {
      return;
    }

    let eventToBroadcast: LastEvent | null = null;
    let shouldContinue = false;

    try {
      await this.db.transaction(async (tx) => {
        const [room] = await tx
          .select({
            id: ludoRooms.id,
            status: ludoRooms.status,
            seatUsers: ludoRooms.seatUsers,
            state: ludoRooms.state,
            version: ludoRooms.version,
          })
          .from(ludoRooms)
          .where(eq(ludoRooms.id, roomId))
          .limit(1);

        if (!room || room.status !== "playing" || !room.state || !room.seatUsers) {
          return;
        }

        const state = room.state as unknown as LudoState;
        if (state.winner !== null) return;

        const currentTurnUserId = room.seatUsers[state.turn];
        if (!currentTurnUserId) return;

        const [player] = await tx
          .select({
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

        if (!player || !player.autopilot) {
          // Pemain mungkin sudah mengambil alih kembali
          return;
        }

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

        const nextStatus: RoomStatus =
          nextState.winner !== null ? "finished" : "playing";
        eventToBroadcast = nextState.last ?? null;

        await tx
          .update(ludoRooms)
          .set({
            state: nextState as unknown as Record<string, unknown>,
            status: nextStatus,
            finishedAt: nextState.winner !== null ? sql`CURRENT_TIMESTAMP` : null,
            version: sql`${ludoRooms.version} + 1`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
            lastActivityAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(ludoRooms.id, roomId));

        shouldContinue = nextStatus === "playing";
      });
    } catch {
      // Transaksi gagal atau rollback
    }

    await this.broadcastState(roomId, eventToBroadcast);

    if (shouldContinue) {
      await this.onRoomUpdated(roomId);
    }
  }
}
