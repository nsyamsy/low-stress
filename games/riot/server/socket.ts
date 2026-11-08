import type { Server as SocketIOServer, Socket } from "socket.io";
import { censorProfanity } from "@low-stress/sdk";
import {
  and,
  bannedWords,
  type Database,
  eq,
  inArray,
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
  adminResetRoom: (roomId: string) => boolean;
  adminKickPlayer: (roomId: string, userId: string) => boolean;
  adminDeleteRoom: (roomId: string) => boolean;
}

interface RiotSocketUser {
  id: string;
  username: string;
  displayName: string;
  status: string;
}

function extractErrorCode(err: unknown, fallback = "GAME_UNAVAILABLE"): string {
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string"
  ) {
    return (err as { code: string }).code;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}

export function setupRiotSocket(
  io: SocketIOServer,
  service = new RiotGameService(),
  ctx?: GameServerContext,
): SetupRiotSocketResult {
  const riotNamespace = io.of("/riot");
  const db = ctx?.db as Database | undefined;

  // Setup profanity censor function (ctx.censorText -> DB banned_words -> censorProfanity)
  const ctxWithCensor = ctx as
    | (GameServerContext & { censorText?: (text: string) => string })
    | undefined;
  let dbBannedWords: string[] = [];
  if (ctxWithCensor?.censorText) {
    service.setCensorFn(ctxWithCensor.censorText);
  } else if (db) {
    service.setCensorFn((text: string) =>
      censorProfanity(
        text,
        dbBannedWords.length > 0 ? { extraWords: dbBannedWords } : undefined,
      ),
    );
    void (async () => {
      try {
        const rows = await db
          .select({ word: bannedWords.word })
          .from(bannedWords);
        dbBannedWords = rows.map((r) => r.word);
      } catch {
        // Ignore if table not ready
      }
    })();
  }

  // --- Persistensi opsional (RT-41): room & match ke tabel riot_* ---
  // Throttle per room agar broadcast view tidak membanjiri DB.
  const lastPersistAt = new Map<string, number>();
  const recordedMatches = new Set<string>();

  const pruneRoomTracking = (roomId: string): void => {
    lastPersistAt.delete(roomId);
    for (const key of [...recordedMatches]) {
      if (key.startsWith(`${roomId}:`)) {
        recordedMatches.delete(key);
      }
    }
  };

  const deleteRoomFromDb = (roomId: string): void => {
    pruneRoomTracking(roomId);
    if (!db) return;
    void (async () => {
      try {
        await db.delete(riotRooms).where(eq(riotRooms.id, roomId));
      } catch {
        // Persistensi tidak boleh menjatuhkan gameplay
      }
    })();
  };

  const deletePlayerFromDb = (roomId: string, userId: string): void => {
    if (!db) return;
    void (async () => {
      try {
        await db
          .delete(riotRoomPlayers)
          .where(
            and(
              eq(riotRoomPlayers.roomId, roomId),
              eq(riotRoomPlayers.userId, userId),
            ),
          );
      } catch {
        // Persistensi tidak boleh menjatuhkan gameplay
      }
    })();
  };

  const persistRoom = (room: RiotRoom, force = false): void => {
    if (!db) return;
    if (room.players.size === 0 || !service.getRoom(room.id)) {
      deleteRoomFromDb(room.id);
      return;
    }
    const now = Date.now();
    if (!force && now - (lastPersistAt.get(room.id) ?? 0) < 5000) return;
    lastPersistAt.set(room.id, now);
    const currentPlayers = Array.from(room.players.values());
    const currentPlayerIds = new Set(currentPlayers.map((p) => p.id));

    void (async () => {
      try {
        // Pastikan room masih ada di memori sebelum menulis ke DB
        if (!service.getRoom(room.id)) return;

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
              hostId: room.hostId,
              status: room.phase,
              options: room.options as unknown as Record<string, unknown>,
              lastActivityAt: new Date(room.updatedAt),
              updatedAt: new Date(),
            },
          });
        for (const p of currentPlayers) {
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

        // Hapus baris riot_room_players yang sudah keluar/dikick dari room.players
        const existingRows = await db
          .select({ userId: riotRoomPlayers.userId })
          .from(riotRoomPlayers)
          .where(eq(riotRoomPlayers.roomId, room.id));
        const staleUserIds = existingRows
          .map((r) => r.userId)
          .filter((uid) => !currentPlayerIds.has(uid));
        if (staleUserIds.length > 0) {
          await db
            .delete(riotRoomPlayers)
            .where(
              and(
                eq(riotRoomPlayers.roomId, room.id),
                inArray(riotRoomPlayers.userId, staleUserIds),
              ),
            );
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
    persistRoom(room, true);
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
          if (ctx.checkGameGate) {
            try {
              await ctx.checkGameGate("riot");
            } catch (err) {
              return next(new Error(extractErrorCode(err)));
            }
          }
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

  const registerPlayerSocket = (
    socket: Socket,
    playerId: string,
    roomId: string,
  ): void => {
    for (const [sockId, map] of [...socketPlayerMap.entries()]) {
      if (map.playerId === playerId && sockId !== socket.id) {
        socketPlayerMap.delete(sockId);
        if (map.roomId !== roomId) {
          riotNamespace.sockets.get(sockId)?.leave(map.roomId);
        }
      }
    }
    socket.join(roomId);
    socketPlayerMap.set(socket.id, { playerId, roomId });
  };

  const hasAnotherActiveSocket = (playerId: string, roomId: string, excludeSocketId: string): boolean => {
    for (const [sockId, map] of socketPlayerMap.entries()) {
      if (sockId !== excludeSocketId && map.playerId === playerId && map.roomId === roomId) {
        return true;
      }
    }
    return false;
  };

  const checkGateForEvent = async (callback?: (res: unknown) => void): Promise<boolean> => {
    if (!ctx?.checkGameGate) return true;
    try {
      await ctx.checkGameGate("riot");
      return true;
    } catch (err) {
      const code = extractErrorCode(err);
      if (callback) callback({ ok: false, success: false, error: code, reason: code });
      return false;
    }
  };

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
      async (
        data?: { options?: Partial<RiotHostOptions>; character?: unknown },
        callback?: (res: unknown) => void,
      ) => {
        if (!(await checkGateForEvent(callback))) return;

        const room = service.createRoom(
          userId,
          displayName,
          undefined,
          data?.options,
          sanitizeCharacterCustomization(data?.character),
        );
        registerPlayerSocket(socket, userId, room.id);
        persistRoom(room, true);

        const view = service.getClientRoomView(room.id, userId);
        if (callback) callback({ success: true, room: view });
        socket.emit("room:view", view);
      },
    );

    socket.on("room:options", (data: { options: Partial<RiotHostOptions> }, callback?: (res: unknown) => void) => {
      const mapping = socketPlayerMap.get(socket.id);
      if (!mapping) return;

      const res = service.updateHostOptions(mapping.roomId, mapping.playerId, data.options);
      if (callback) callback(res);
      if (res.success) {
        const room = service.getRoom(mapping.roomId);
        if (room) persistRoom(room, true);
        broadcastRoomViews(riotNamespace, mapping.roomId, service);
      }
    });

    socket.on(
      "room:join",
      async (
        data: { roomId: string; character?: unknown },
        callback?: (res: unknown) => void,
      ) => {
        if (!(await checkGateForEvent(callback))) return;

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

        registerPlayerSocket(socket, userId, res.room.id);
        persistRoom(res.room, true);

        const view = service.getClientRoomView(res.room.id, userId);
        if (callback) callback({ success: true, room: view });

        // Notify all players in room with their personalized safe views
        broadcastRoomViews(riotNamespace, res.room.id, service);
      },
    );

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

    socket.on("game:start", async (_data: unknown, callback?: (res: unknown) => void) => {
      if (!(await checkGateForEvent(callback))) return;

      const mapping = socketPlayerMap.get(socket.id);
      if (!mapping) return;

      const res = service.startGame(mapping.roomId, mapping.playerId);
      if (!res.success) {
        if (callback) callback({ success: false, reason: res.reason });
        return;
      }

      const room = service.getRoom(mapping.roomId);
      if (room) persistRoom(room, true);

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
            const room = service.getRoom(mapping.roomId);
            if (room) persistRoom(room, true);
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
          const room = service.getRoom(mapping.roomId);
          if (room) persistRoom(room, true);
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

      const res = service.sendMeetingChat(
        mapping.roomId,
        mapping.playerId,
        data.text,
        Date.now(),
        ctxWithCensor?.censorText,
      );
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
            const room = service.getRoom(mapping.roomId);
            if (room) persistRoom(room, true);
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
    socket.on(
      "player:reconnect",
      async (data: { roomId: string }, callback?: (res: unknown) => void) => {
        if (!(await checkGateForEvent(callback))) return;

        const res = service.reconnectPlayer(data.roomId, userId);
        if (!res.success || !res.view) {
          if (callback) callback({ success: false });
          return;
        }

        const canonicalRoomId = res.view.roomId;
        registerPlayerSocket(socket, userId, canonicalRoomId);

        if (callback) callback({ success: true, room: res.view, view: res.view });
        broadcastRoomViews(riotNamespace, canonicalRoomId, service);
      },
    );

    const handleKick = (data: { targetId: string }, callback?: (res: unknown) => void) => {
      const mapping = socketPlayerMap.get(socket.id);
      if (!mapping) return;

      const res = service.kickPlayer(mapping.roomId, mapping.playerId, data.targetId);
      if (callback) callback(res);

      if (res.success) {
        deletePlayerFromDb(mapping.roomId, data.targetId);
        const room = service.getRoom(mapping.roomId);
        if (room) persistRoom(room, true);

        for (const [sockId, map] of [...socketPlayerMap.entries()]) {
          if (map.roomId === mapping.roomId && map.playerId === data.targetId) {
            const kickedSock = riotNamespace.sockets.get(sockId);
            kickedSock?.emit("room:kicked");
            kickedSock?.leave(mapping.roomId);
            socketPlayerMap.delete(sockId);
          }
        }
        broadcastRoomViews(riotNamespace, mapping.roomId, service);
      }
    };

    socket.on("room:kick", handleKick);
    socket.on("player:kick", handleKick);

    socket.on("room:rematch", (_data: unknown, callback?: (res: unknown) => void) => {
      const mapping = socketPlayerMap.get(socket.id);
      if (!mapping) return;

      const res = service.returnToLobby(mapping.roomId, mapping.playerId);
      if (callback) callback(res);
      if (res.success) {
        const room = service.getRoom(mapping.roomId);
        if (room) persistRoom(room, true);
        broadcastRoomViews(riotNamespace, mapping.roomId, service);
      }
    });

    socket.on("room:leave", (_data: unknown, callback?: (res: unknown) => void) => {
      const mapping = socketPlayerMap.get(socket.id);
      if (mapping) {
        socketPlayerMap.delete(socket.id);
        const room = service.getRoom(mapping.roomId);
        if (room && room.phase === "lobby") {
          const leaveRes = service.leaveRoom(mapping.roomId, mapping.playerId);
          deletePlayerFromDb(mapping.roomId, mapping.playerId);
          if (leaveRes.roomClosed) {
            deleteRoomFromDb(mapping.roomId);
          } else {
            const updatedRoom = service.getRoom(mapping.roomId);
            if (updatedRoom) persistRoom(updatedRoom, true);
            broadcastRoomViews(riotNamespace, mapping.roomId, service);
          }
        } else if (room) {
          service.handleDisconnect(mapping.roomId, mapping.playerId);
          persistRoom(room, true);
          broadcastRoomViews(riotNamespace, mapping.roomId, service);
        }
        socket.leave(mapping.roomId);
      }
      if (callback) callback({ success: true });
    });

    socket.on("disconnect", () => {
      const mapping = socketPlayerMap.get(socket.id);
      if (mapping) {
        socketPlayerMap.delete(socket.id);
        // Guard against multi-socket disconnect race: only disconnect player if no other socket is active
        if (hasAnotherActiveSocket(mapping.playerId, mapping.roomId, socket.id)) {
          return;
        }
        const room = service.getRoom(mapping.roomId);
        if (room && room.phase === "lobby") {
          const leaveRes = service.leaveRoom(mapping.roomId, mapping.playerId);
          deletePlayerFromDb(mapping.roomId, mapping.playerId);
          if (leaveRes.roomClosed) {
            deleteRoomFromDb(mapping.roomId);
          } else {
            const updatedRoom = service.getRoom(mapping.roomId);
            if (updatedRoom) persistRoom(updatedRoom, true);
          }
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
    const activeRoomIds = new Set<string>();
    for (const room of service.getAllRooms()) {
      activeRoomIds.add(room.id);
      if (room.phase === "finished") {
        recordMatch(room);
        continue;
      }
      persistRoom(room); // throttled 5 dtk per room; menjaga riot_rooms sinkron
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
        persistRoom(room, true);
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

    // Prune tracking state for rooms that were removed
    for (const trackedRoomId of [...lastPersistAt.keys()]) {
      if (!activeRoomIds.has(trackedRoomId)) {
        pruneRoomTracking(trackedRoomId);
      }
    }
  }, SERVER_TICK_MS);
  tickInterval.unref?.();

  const adminResetRoom = (roomId: string): boolean => {
    lastPersistAt.delete(roomId);
    const reset = service.adminResetRoom(roomId);
    if (reset) {
      broadcastRoomViews(riotNamespace, roomId, service);
    }
    return reset;
  };

  const adminKickPlayer = (roomId: string, userId: string): boolean => {
    lastPersistAt.delete(roomId);
    const res = service.adminKickPlayer(roomId, userId);
    for (const [sockId, map] of [...socketPlayerMap.entries()]) {
      if (map.roomId === roomId && map.playerId === userId) {
        const kickedSock = riotNamespace.sockets.get(sockId);
        kickedSock?.emit("room:kicked");
        kickedSock?.leave(roomId);
        socketPlayerMap.delete(sockId);
      }
    }
    if (res.roomClosed) {
      pruneRoomTracking(roomId);
    } else if (res.removed) {
      broadcastRoomViews(riotNamespace, roomId, service);
    }
    return res.removed;
  };

  const adminDeleteRoom = (roomId: string): boolean => {
    pruneRoomTracking(roomId);
    const deleted = service.adminDeleteRoom(roomId);
    for (const [sockId, map] of [...socketPlayerMap.entries()]) {
      if (map.roomId === roomId) {
        const sock = riotNamespace.sockets.get(sockId);
        sock?.emit("room:kicked");
        sock?.leave(roomId);
        socketPlayerMap.delete(sockId);
      }
    }
    return deleted;
  };

  return {
    service,
    stopTickLoop: () => clearInterval(tickInterval),
    adminResetRoom,
    adminKickPlayer,
    adminDeleteRoom,
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
