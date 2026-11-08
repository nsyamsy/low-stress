import type { Server as SocketIOServer, Socket } from "socket.io";
import {
  type Database,
  riotMatches,
  riotRoomPlayers,
  riotRooms,
  type GameServerContext,
} from "@low-stress/sdk/server";
import { RiotGameService, type RiotRoom } from "./service";
import { buildLeaderboardScoreEntries, matchRecordKey } from "./leaderboard";
import { sanitizeCharacterCustomization } from "../shared/character";
import { SERVER_TICK_MS } from "../shared/types";
import type { RiotHostOptions } from "../shared/lobby";
import type { SabotageKind } from "../shared/sabotage";

export interface SetupRiotSocketResult {
  service: RiotGameService;
  stopTickLoop: () => void;
}

interface RiotSocketUser {
  id: string;
  username: string;
  displayName: string;
  status: string;
}

export function setupRiotSocket(
  io: SocketIOServer,
  service = new RiotGameService(),
  ctx?: GameServerContext,
): SetupRiotSocketResult {
  const riotNamespace = io.of("/riot");
  const db = ctx?.db as Database | undefined;

  // --- Persistensi opsional (RT-41): room & match ke tabel riot_* ---
  // Throttle per room agar broadcast view tidak membanjiri DB.
  const lastPersistAt = new Map<string, number>();
  const recordedMatches = new Set<string>();

  const persistRoom = (room: RiotRoom): void => {
    if (!db) return;
    const now = Date.now();
    if (now - (lastPersistAt.get(room.id) ?? 0) < 5000) return;
    lastPersistAt.set(room.id, now);
    void (async () => {
      try {
        await db
          .insert(riotRooms)
          .values({
            id: room.id,
            name: `Room ${room.id.slice(-6).toUpperCase()}`,
            hostId: room.hostId,
            status: room.phase,
            options: room.options as unknown as Record<string, unknown>,
            lastActivityAt: new Date(room.updatedAt),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: riotRooms.id,
            set: {
              status: room.phase,
              options: room.options as unknown as Record<string, unknown>,
              lastActivityAt: new Date(room.updatedAt),
              updatedAt: new Date(),
            },
          });
        for (const p of room.players.values()) {
          await db
            .insert(riotRoomPlayers)
            .values({
              roomId: room.id,
              userId: p.id,
              status: p.status,
              character: (p.character ?? null) as Record<string, unknown> | null,
            })
            .onConflictDoUpdate({
              target: [riotRoomPlayers.roomId, riotRoomPlayers.userId],
              set: {
                status: p.status,
                character: (p.character ?? null) as Record<string, unknown> | null,
              },
            });
        }
      } catch {
        // Persistensi tidak boleh menjatuhkan gameplay; dicatat untuk diagnosa.
      }
    })();
  };

  const recordMatch = (room: RiotRoom): void => {
    const key = matchRecordKey(room);
    if (recordedMatches.has(key)) return;
    recordedMatches.add(key);
    // RT-50: catat poin ronde ke leaderboard generik lewat ctx.recordScore.
    // Skor SELALU dihitung server dari room.scores; klien tidak dapat mengirim skor.
    void (async () => {
      if (ctx?.recordScore) {
        for (const entry of buildLeaderboardScoreEntries(room)) {
          try {
            await ctx.recordScore(entry);
          } catch {
            // Kegagalan pencatatan skor tidak boleh menjatuhkan gameplay.
          }
        }
      }
    })();
    if (!db) return;
    void (async () => {
      try {
        await db.insert(riotMatches).values({
          id: `match_${room.id}_${Date.now()}`,
          roomId: room.id,
          winner: room.winner,
          endedAt: new Date(),
          players: Array.from(room.players.values()).map((p) => ({
            id: p.id,
            role: p.role,
            status: p.status,
            tasksCompleted: p.tasksCompleted,
            correctVotes: p.correctVotes,
          })) as unknown as Record<string, unknown>,
        });
      } catch {
        /* sama: jangan jatuhkan gameplay */
      }
    })();
  };

  // Middleware autentikasi: identitas pemain SELALU dari sesi cookie yang
  // diverifikasi server (resolvePrincipal), tidak pernah dari auth klien.
  riotNamespace.use(async (socket: Socket, next: (err?: Error) => void) => {
    try {
      if (ctx?.resolvePrincipal) {
        const principal = await ctx.resolvePrincipal(socket.handshake.headers.cookie);
        if (principal.kind === "user" && principal.user) {
          socket.data.user = principal.user satisfies RiotSocketUser;
          return next();
        }
        return next(new Error("UNAUTHENTICATED"));
      }
      return next(new Error("UNAUTHENTICATED"));
    } catch {
      return next(new Error("INTERNAL_ERROR"));
    }
  });

  // Track socket to player & room mapping
  const socketPlayerMap = new Map<string, { playerId: string; roomId: string }>();

  riotNamespace.on("connection", (socket: Socket) => {
    // Identitas sudah diverifikasi middleware; admin ditolak.
    const user = socket.data.user as RiotSocketUser | undefined;
    if (!user) {
      socket.disconnect(true);
      return;
    }
    const userId = user.id;
    const displayName = user.displayName || user.username;

    socket.on(
      "room:create",
      (data?: { options?: Partial<RiotHostOptions>; character?: unknown }, callback?: (res: unknown) => void) => {
        const room = service.createRoom(
          userId,
          displayName,
          undefined,
          data?.options,
          sanitizeCharacterCustomization(data?.character),
        );
      socket.join(room.id);
      socketPlayerMap.set(socket.id, { playerId: userId, roomId: room.id });

      const view = service.getClientRoomView(room.id, userId);
      if (callback) callback({ success: true, room: view });
      socket.emit("room:view", view);
    });

    socket.on("room:options", (data: { options: Partial<RiotHostOptions> }, callback?: (res: unknown) => void) => {
      const mapping = socketPlayerMap.get(socket.id);
      if (!mapping) return;

      const res = service.updateHostOptions(mapping.roomId, mapping.playerId, data.options);
      if (callback) callback(res);
      if (res.success) {
        broadcastRoomViews(riotNamespace, mapping.roomId, service);
      }
    });

    socket.on(
      "room:join",
      (data: { roomId: string; character?: unknown }, callback?: (res: unknown) => void) => {
        const res = service.joinRoom(
          data.roomId,
          userId,
          displayName,
          sanitizeCharacterCustomization(data.character),
        );
      if (!res.success || !res.room) {
        if (callback) callback({ success: false, reason: res.reason });
        return;
      }

      socket.join(res.room.id);
      socketPlayerMap.set(socket.id, { playerId: userId, roomId: res.room.id });

      const view = service.getClientRoomView(res.room.id, userId);
      if (callback) callback({ success: true, room: view });

      // Notify all players in room with their personalized safe views
      broadcastRoomViews(riotNamespace, res.room.id, service);
    });

    socket.on(
      "character:update",
      (data: { character?: unknown }, callback?: (res: unknown) => void) => {
        const mapping = socketPlayerMap.get(socket.id);
        if (!mapping) return;
        const res = service.updateCharacter(
          mapping.roomId,
          mapping.playerId,
          sanitizeCharacterCustomization(data?.character),
        );
        if (callback) callback(res);
        if (res.success) {
          broadcastRoomViews(riotNamespace, mapping.roomId, service);
        }
      },
    );

    socket.on("game:start", (_data: unknown, callback?: (res: unknown) => void) => {
      const mapping = socketPlayerMap.get(socket.id);
      if (!mapping) return;

      const res = service.startGame(mapping.roomId, mapping.playerId);
      if (!res.success) {
        if (callback) callback({ success: false, reason: res.reason });
        return;
      }

      if (callback) callback({ success: true });

      // CRITICAL: Emit individual secret role to each player socket individually
      for (const [sockId, map] of socketPlayerMap.entries()) {
        if (map.roomId === mapping.roomId) {
          const clientSock = riotNamespace.sockets.get(sockId);
          if (clientSock) {
            const role = res.roles?.get(map.playerId);
            if (role) {
              clientSock.emit("role", { role });
            }
          }
        }
      }

      broadcastRoomViews(riotNamespace, mapping.roomId, service);
    });

    socket.on("input", (input: { seq: number; dx: number; dy: number; dt: number }) => {
      const mapping = socketPlayerMap.get(socket.id);
      if (!mapping) return;
      service.processMovementInput(mapping.roomId, mapping.playerId, input);
    });

    socket.on(
      "task:complete",
      (
        data: { taskId: string; startedAt: number; completedAt: number; durationMs: number },
        callback?: (res: unknown) => void,
      ) => {
        const mapping = socketPlayerMap.get(socket.id);
        if (!mapping) return;

        const res = service.completeTask(mapping.roomId, mapping.playerId, data);
        if (callback) callback(res);

        if (res.success) {
          broadcastRoomViews(riotNamespace, mapping.roomId, service);
          if (res.winResult) {
            riotNamespace.to(mapping.roomId).emit("game:finished", res.winResult);
          }
        }
      },
    );

    socket.on("action:eliminate", (data: { targetId: string }, callback?: (res: unknown) => void) => {
      const mapping = socketPlayerMap.get(socket.id);
      if (!mapping) return;

      const res = service.performInfiltratorAction(mapping.roomId, mapping.playerId, data.targetId);
      if (callback) callback(res);

      if (res.success) {
        broadcastRoomViews(riotNamespace, mapping.roomId, service);
        if (res.marker) {
          riotNamespace.to(mapping.roomId).emit("hologram:spawned", res.marker);
        }
        if (res.winResult) {
          riotNamespace.to(mapping.roomId).emit("game:finished", res.winResult);
        }
      }
    });

    socket.on("report", (data: { markerId: string }, callback?: (res: unknown) => void) => {
      const mapping = socketPlayerMap.get(socket.id);
      if (!mapping) return;

      const res = service.reportHologramMarker(mapping.roomId, mapping.playerId, data.markerId);
      if (callback) callback(res);

      if (res.success) {
        riotNamespace.to(mapping.roomId).emit("meeting:started", { reason: "hologram_reported" });
        broadcastRoomViews(riotNamespace, mapping.roomId, service);
      }
    });

    socket.on("meeting:call", (_data: unknown, callback?: (res: unknown) => void) => {
      const mapping = socketPlayerMap.get(socket.id);
      if (!mapping) return;

      const res = service.callEmergencyMeeting(mapping.roomId, mapping.playerId);
      if (callback) callback(res);

      if (res.success) {
        riotNamespace.to(mapping.roomId).emit("meeting:started", { reason: "emergency_button" });
        broadcastRoomViews(riotNamespace, mapping.roomId, service);
      }
    });

    // --- RT-30: Rapat Chat & Voting ---
    socket.on("chat:send", (data: { text: string }, callback?: (res: unknown) => void) => {
      const mapping = socketPlayerMap.get(socket.id);
      if (!mapping) return;

      const res = service.sendChatMessage(mapping.roomId, mapping.playerId, data.text);
      if (callback) callback({ success: res.success, reason: res.reason });

      if (res.success && res.message) {
        if (res.audience === "ghosts_only") {
          // Emit only to ghost sockets in room
          for (const [sockId, map] of socketPlayerMap.entries()) {
            if (map.roomId === mapping.roomId) {
              const p = service.getRoom(mapping.roomId)?.players.get(map.playerId);
              if (p?.status === "ghost") {
                riotNamespace.to(sockId).emit("chat:message", res.message);
              }
            }
          }
        } else {
          // Emit to all sockets in room
          riotNamespace.to(mapping.roomId).emit("chat:message", res.message);
        }
      }
    });

    socket.on("meeting:advance", (_data: unknown, callback?: (res: unknown) => void) => {
      const mapping = socketPlayerMap.get(socket.id);
      if (!mapping) return;

      const room = service.getRoom(mapping.roomId);
      if (!room || room.hostId !== mapping.playerId) {
        if (callback) callback({ success: false, reason: "NOT_ROOM_HOST" });
        return;
      }

      const res = service.advanceMeetingToVoting(mapping.roomId);
      if (callback) callback(res);
      if (res.success) {
        riotNamespace.to(mapping.roomId).emit("meeting:voting_started");
        broadcastRoomViews(riotNamespace, mapping.roomId, service);
      }
    });

    socket.on("vote:cast", (data: { targetId: string | "skip" }, callback?: (res: unknown) => void) => {
      const mapping = socketPlayerMap.get(socket.id);
      if (!mapping) return;

      const res = service.castVote(mapping.roomId, mapping.playerId, data.targetId);
      if (callback) callback({ success: res.success, reason: res.reason });

      if (res.success) {
        broadcastRoomViews(riotNamespace, mapping.roomId, service);
        if (res.concluded) {
          riotNamespace.to(mapping.roomId).emit("voting:result", res.votingResult);
          if (res.winResult) {
            riotNamespace.to(mapping.roomId).emit("game:finished", res.winResult);
          }
        }
      }
    });

    // --- RT-31: Sabotase ---
    socket.on(
      "sabotage:trigger",
      (data: { kind: SabotageKind; targetRoom?: string }, callback?: (res: unknown) => void) => {
        const mapping = socketPlayerMap.get(socket.id);
        if (!mapping) return;

        const res = service.triggerSabotage(mapping.roomId, mapping.playerId, data.kind, data.targetRoom);
        if (callback) callback(res);

        if (res.success && res.sabotage) {
          riotNamespace.to(mapping.roomId).emit("sabotage:active", res.sabotage);
          broadcastRoomViews(riotNamespace, mapping.roomId, service);
        }
      },
    );

    socket.on("sabotage:repair", (data: { stationId: string }, callback?: (res: unknown) => void) => {
      const mapping = socketPlayerMap.get(socket.id);
      if (!mapping) return;

      const res = service.repairSabotage(mapping.roomId, mapping.playerId, data.stationId);
      if (callback) callback(res);

      if (res.success) {
        if (res.resolved) {
          riotNamespace.to(mapping.roomId).emit("sabotage:resolved");
        }
        broadcastRoomViews(riotNamespace, mapping.roomId, service);
      }
    });

    // --- RT-32: Putus Koneksi & Reconnect & Kick ---
    socket.on("player:reconnect", (data: { roomId: string }, callback?: (res: unknown) => void) => {
      const res = service.reconnectPlayer(data.roomId, userId);
      if (!res.success) {
        if (callback) callback({ success: false });
        return;
      }

      socket.join(data.roomId);
      socketPlayerMap.set(socket.id, { playerId: userId, roomId: data.roomId });

      if (callback) callback({ success: true, room: res.view });
      broadcastRoomViews(riotNamespace, data.roomId, service);
    });

    socket.on("room:kick", (data: { targetId: string }, callback?: (res: unknown) => void) => {
      const mapping = socketPlayerMap.get(socket.id);
      if (!mapping) return;

      const res = service.kickPlayer(mapping.roomId, mapping.playerId, data.targetId);
      if (callback) callback(res);

      if (res.success) {
        for (const [sockId, map] of socketPlayerMap.entries()) {
          if (map.roomId === mapping.roomId && map.playerId === data.targetId) {
            const kickedSock = riotNamespace.sockets.get(sockId);
            kickedSock?.emit("room:kicked");
            kickedSock?.leave(mapping.roomId);
            socketPlayerMap.delete(sockId);
          }
        }
        broadcastRoomViews(riotNamespace, mapping.roomId, service);
      }
    });

    socket.on("room:rematch", (_data: unknown, callback?: (res: unknown) => void) => {
      const mapping = socketPlayerMap.get(socket.id);
      if (!mapping) return;

      const res = service.returnToLobby(mapping.roomId, mapping.playerId);
      if (callback) callback(res);
      if (res.success) {
        broadcastRoomViews(riotNamespace, mapping.roomId, service);
      }
    });

    socket.on("room:leave", (_data: unknown, callback?: (res: unknown) => void) => {
      const mapping = socketPlayerMap.get(socket.id);
      if (mapping) {
        socketPlayerMap.delete(socket.id);
        const room = service.getRoom(mapping.roomId);
        if (room && room.phase === "lobby") {
          service.leaveRoom(mapping.roomId, mapping.playerId);
        } else if (room) {
          service.handleDisconnect(mapping.roomId, mapping.playerId);
        }
        socket.leave(mapping.roomId);
      }
      if (callback) callback({ success: true });
    });

    socket.on("disconnect", () => {
      const mapping = socketPlayerMap.get(socket.id);
      if (mapping) {
        socketPlayerMap.delete(socket.id);
        const room = service.getRoom(mapping.roomId);
        if (room && room.phase === "lobby") {
          service.leaveRoom(mapping.roomId, mapping.playerId);
        } else if (room) {
          service.handleDisconnect(mapping.roomId, mapping.playerId);
        }
        broadcastRoomViews(riotNamespace, mapping.roomId, service);
      }
    });
  });

  // 15 Hz Authoritative Tick Loop broadcasting interest-managed snapshots and advancing timers
  const tickInterval = setInterval(() => {
    const now = Date.now();
    for (const room of service.getAllRooms()) {
      persistRoom(room); // throttled 5 dtk per room; menjaga riot_rooms sinkron
      if (room.phase === "finished") {
        recordMatch(room);
        continue;
      }
      // Handle server tick timers: sabotage expiration, discussion/voting timer, disconnect timeout
      const tickRes = service.processServerTick(room.id, now);
      if (tickRes.phaseAdvanced) {
        if (room.phase === "voting") {
          riotNamespace.to(room.id).emit("meeting:voting_started");
        } else if (room.phase === "playing") {
          riotNamespace.to(room.id).emit("voting:result", room.votingResult);
        }
        broadcastRoomViews(riotNamespace, room.id, service);
      }
      if (tickRes.winResult) {
        riotNamespace.to(room.id).emit("game:finished", tickRes.winResult);
        broadcastRoomViews(riotNamespace, room.id, service);
      }

      if (room.phase !== "playing") continue;

      // Advance authoritative tick
      room.simulation.stepTick(now);

      // Send personalized interest snapshot to each socket in the room
      for (const [sockId, map] of socketPlayerMap.entries()) {
        if (map.roomId === room.id) {
          const clientSock = riotNamespace.sockets.get(sockId);
          if (clientSock) {
            const snapshot = service.getClientSnapshot(room.id, map.playerId, now);
            if (snapshot) {
              clientSock.emit("snapshot", snapshot);
            }
          }
        }
      }
    }
  }, SERVER_TICK_MS);

  return {
    service,
    stopTickLoop: () => clearInterval(tickInterval),
  };
}

function broadcastRoomViews(namespace: unknown, roomId: string, service: RiotGameService) {
  const room = service.getRoom(roomId);
  if (!room) return;

  const ns = namespace as { sockets: Map<string, Socket> };
  for (const socket of ns.sockets.values()) {
    const pId = (socket.data.user as { id?: string } | undefined)?.id || socket.id;
    if (room.players.has(pId)) {
      const view = service.getClientRoomView(roomId, pId);
      if (view) {
        socket.emit("room:view", view);
      }
    }
  }
}
