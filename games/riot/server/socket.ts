import type { Server as SocketIOServer, Socket } from "socket.io";
import { RiotGameService } from "./service";
import { SERVER_TICK_MS } from "../shared/types";

export interface SetupRiotSocketResult {
  service: RiotGameService;
  stopTickLoop: () => void;
}

export function setupRiotSocket(io: SocketIOServer, service = new RiotGameService()): SetupRiotSocketResult {
  const riotNamespace = io.of("/riot");

  // Track socket to player & room mapping
  const socketPlayerMap = new Map<string, { playerId: string; roomId: string }>();

  riotNamespace.on("connection", (socket: Socket) => {
    // Authenticate player from cookie session or handshake auth
    const authData = (socket.handshake.auth as { userId?: string; displayName?: string }) || {};
    const userId = authData.userId || socket.id;
    const displayName = authData.displayName || `Player_${userId.slice(0, 4)}`;

    socket.on("room:create", (_data: unknown, callback?: (res: unknown) => void) => {
      const room = service.createRoom(userId, displayName);
      socket.join(room.id);
      socketPlayerMap.set(socket.id, { playerId: userId, roomId: room.id });

      const view = service.getClientRoomView(room.id, userId);
      if (callback) callback({ success: true, room: view });
      socket.emit("room:view", view);
    });

    socket.on("room:join", (data: { roomId: string }, callback?: (res: unknown) => void) => {
      const res = service.joinRoom(data.roomId, userId, displayName);
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

    socket.on("task:complete", (data: { taskId: string; startedAt: number; completedAt: number; durationMs: number }, callback?: (res: unknown) => void) => {
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
    });

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

    socket.on("disconnect", () => {
      const mapping = socketPlayerMap.get(socket.id);
      if (mapping) {
        socketPlayerMap.delete(socket.id);
        service.leaveRoom(mapping.roomId, mapping.playerId);
        broadcastRoomViews(riotNamespace, mapping.roomId, service);
      }
    });
  });

  // 15 Hz Authoritative Tick Loop broadcasting interest-managed snapshots
  const tickInterval = setInterval(() => {
    const now = Date.now();
    for (const room of service.getAllRooms()) {
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
    const pId = (socket.handshake.auth as { userId?: string })?.userId || socket.id;
    if (room.players.has(pId)) {
      const view = service.getClientRoomView(roomId, pId);
      if (view) {
        socket.emit("room:view", view);
      }
    }
  }
}
