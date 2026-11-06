import { computeExpirationCutoff } from "@low-stress/sdk";
import {
  type HologramMarker,
  canReportHologram,
  createHologramMarker,
  validateInfiltratorAction,
} from "../shared/actions";
import {
  type CompactSnapshotPayload,
  encodeInterestSnapshot,
} from "../shared/interest";
import {
  type GamePhase,
  type PlayerRole,
  type PlayerStatus,
  type WinConditionResult,
  type WinReason,
  type WinWinner,
  assignRoles,
  canTransitionPhase,
  evaluateWinCondition,
} from "../shared/rules";
import {
  type PlayerScoreBreakdown,
  calculateRoundScores,
} from "../shared/scoring";
import { AuthoritativeSimulation } from "../shared/simulation";
import {
  STATION_TASKS,
  type TaskCompletionProof,
  getTaskById,
  validateTaskCompletion,
} from "../shared/tasks";
import { type PlayerInput, VISION_RADIUS } from "../shared/types";

export interface RiotPlayer {
  id: string;
  displayName: string;
  role: PlayerRole;
  status: PlayerStatus;
  lastActionAt: number;
  tasksCompleted: number;
  correctVotes: number;
  assignedTasks: string[];
}

export interface RiotPublicPlayerView {
  id: string;
  displayName: string;
  status: PlayerStatus;
  // Note: role is omitted in public view!
}

export interface RiotClientRoomView {
  roomId: string;
  phase: GamePhase;
  hostId: string;
  myRole: PlayerRole;
  myStatus: PlayerStatus;
  players: RiotPublicPlayerView[];
  hologramMarkers: HologramMarker[];
  tasksTotal: number;
  tasksCompleted: number;
  winner?: WinWinner | null;
  winReason?: WinReason | null;
  scores?: Record<string, PlayerScoreBreakdown>;
}

export interface RiotRoom {
  id: string;
  hostId: string;
  phase: GamePhase;
  players: Map<string, RiotPlayer>;
  simulation: AuthoritativeSimulation;
  hologramMarkers: HologramMarker[];
  tasksTotal: number;
  tasksCompleted: number;
  winner: WinWinner | null;
  winReason: WinReason | null;
  scores: Map<string, PlayerScoreBreakdown> | null;
  createdAt: number;
  updatedAt: number;
}

export class RiotGameService {
  private rooms = new Map<string, RiotRoom>();

  createRoom(hostId: string, hostName: string, roomId = `riot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`): RiotRoom {
    const sim = new AuthoritativeSimulation();
    const players = new Map<string, RiotPlayer>();

    const hostPlayer: RiotPlayer = {
      id: hostId,
      displayName: hostName,
      role: "crew",
      status: "alive",
      lastActionAt: 0,
      tasksCompleted: 0,
      correctVotes: 0,
      assignedTasks: [],
    };
    players.set(hostId, hostPlayer);
    sim.addPlayer(hostId);

    const room: RiotRoom = {
      id: roomId,
      hostId,
      phase: "lobby",
      players,
      simulation: sim,
      hologramMarkers: [],
      tasksTotal: 0,
      tasksCompleted: 0,
      winner: null,
      winReason: null,
      scores: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId: string): RiotRoom | undefined {
    return this.rooms.get(roomId);
  }

  getAllRooms(): RiotRoom[] {
    return Array.from(this.rooms.values());
  }

  joinRoom(roomId: string, playerId: string, playerName: string): { success: boolean; room?: RiotRoom; reason?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, reason: "ROOM_NOT_FOUND" };
    }
    if (room.phase !== "lobby") {
      return { success: false, reason: "GAME_ALREADY_IN_PROGRESS" };
    }
    if (room.players.has(playerId)) {
      return { success: true, room };
    }

    const newPlayer: RiotPlayer = {
      id: playerId,
      displayName: playerName,
      role: "crew",
      status: "alive",
      lastActionAt: 0,
      tasksCompleted: 0,
      correctVotes: 0,
      assignedTasks: [],
    };

    room.players.set(playerId, newPlayer);
    room.simulation.addPlayer(playerId);
    room.updatedAt = Date.now();

    return { success: true, room };
  }

  leaveRoom(roomId: string, playerId: string): { success: boolean; roomClosed?: boolean } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false };

    room.players.delete(playerId);
    room.simulation.removePlayer(playerId);
    room.updatedAt = Date.now();

    if (room.players.size === 0 || room.hostId === playerId) {
      this.rooms.delete(roomId);
      return { success: true, roomClosed: true };
    }

    return { success: true, roomClosed: false };
  }

  startGame(roomId: string, callerId: string, customInfiltrators?: number): {
    success: boolean;
    reason?: string;
    roles?: Map<string, PlayerRole>;
  } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, reason: "ROOM_NOT_FOUND" };
    if (room.hostId !== callerId) return { success: false, reason: "NOT_ROOM_HOST" };
    if (room.players.size < 4) return { success: false, reason: "MIN_PLAYERS_NOT_MET" };
    if (!canTransitionPhase(room.phase, "playing")) return { success: false, reason: "INVALID_PHASE_TRANSITION" };

    const playerIds = Array.from(room.players.keys());
    const assignedRoles = assignRoles(playerIds, customInfiltrators);

    // Assign tasks: Each crew member gets the 3 initial tasks
    const allTaskIds = STATION_TASKS.map((t) => t.id);
    let totalCrewTasks = 0;

    for (const [id, player] of room.players.entries()) {
      const role = assignedRoles.get(id) ?? "crew";
      player.role = role;
      player.status = "alive";
      player.lastActionAt = Date.now();
      player.tasksCompleted = 0;

      if (role === "crew") {
        player.assignedTasks = [...allTaskIds];
        totalCrewTasks += allTaskIds.length;
      } else {
        player.assignedTasks = []; // Infiltrators don't do real tasks
      }
    }

    room.phase = "playing";
    room.tasksTotal = totalCrewTasks;
    room.tasksCompleted = 0;
    room.hologramMarkers = [];
    room.winner = null;
    room.winReason = null;
    room.scores = null;
    room.updatedAt = Date.now();

    return { success: true, roles: assignedRoles };
  }

  processMovementInput(roomId: string, playerId: string, input: PlayerInput, serverTime = Date.now()) {
    const room = this.rooms.get(roomId);
    if (!room || room.phase !== "playing") return { accepted: false };
    return room.simulation.processInput(playerId, input, serverTime);
  }

  completeTask(roomId: string, playerId: string, proof: TaskCompletionProof): {
    success: boolean;
    reason?: string;
    winResult?: WinConditionResult | null;
  } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, reason: "ROOM_NOT_FOUND" };
    if (room.phase !== "playing") return { success: false, reason: "NOT_IN_PLAYING_PHASE" };

    const player = room.players.get(playerId);
    if (!player) return { success: false, reason: "PLAYER_NOT_FOUND" };
    if (player.status !== "alive") return { success: false, reason: "PLAYER_NOT_ALIVE" };
    if (player.role !== "crew") return { success: false, reason: "INFILTRATOR_CANNOT_DO_CREW_TASK" };

    const task = getTaskById(proof.taskId);
    if (!task) return { success: false, reason: "INVALID_TASK_ID" };

    const simPlayer = room.simulation.getPlayer(playerId);
    if (!simPlayer) return { success: false, reason: "SIM_PLAYER_NOT_FOUND" };

    // Validate task physical rules
    const validation = validateTaskCompletion(task, { x: simPlayer.x, y: simPlayer.y }, proof);
    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }

    player.tasksCompleted++;
    room.tasksCompleted++;
    room.updatedAt = Date.now();

    // Evaluate Win Condition
    const winResult = this.checkAndApplyWinCondition(room);
    return { success: true, winResult };
  }

  performInfiltratorAction(roomId: string, callerId: string, targetId: string, serverTime = Date.now()): {
    success: boolean;
    reason?: string;
    marker?: HologramMarker;
    winResult?: WinConditionResult | null;
  } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, reason: "ROOM_NOT_FOUND" };
    if (room.phase !== "playing") return { success: false, reason: "NOT_IN_PLAYING_PHASE" };

    const caller = room.players.get(callerId);
    const target = room.players.get(targetId);
    if (!caller || !target) return { success: false, reason: "PLAYER_NOT_FOUND" };

    const callerSim = room.simulation.getPlayer(callerId);
    const targetSim = room.simulation.getPlayer(targetId);
    if (!callerSim || !targetSim) return { success: false, reason: "SIM_PLAYER_NOT_FOUND" };

    const actionContext = {
      id: caller.id,
      role: caller.role,
      status: caller.status,
      pos: { x: callerSim.x, y: callerSim.y },
      lastActionAt: caller.lastActionAt,
    };

    const targetContext = {
      id: target.id,
      role: target.role,
      status: target.status,
      pos: { x: targetSim.x, y: targetSim.y },
    };

    const validation = validateInfiltratorAction(actionContext, targetContext, undefined, serverTime);
    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }

    // Elimination applied: target becomes ghost, leaves neutral hologram marker
    target.status = "ghost";
    caller.lastActionAt = serverTime;

    const marker = createHologramMarker(target.id, { x: targetSim.x, y: targetSim.y }, serverTime);
    room.hologramMarkers.push(marker);
    room.updatedAt = serverTime;

    // Check Win Condition (e.g. Parity achieved)
    const winResult = this.checkAndApplyWinCondition(room);
    return { success: true, marker, winResult };
  }

  reportHologramMarker(roomId: string, callerId: string, markerId: string): { success: boolean; reason?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, reason: "ROOM_NOT_FOUND" };
    if (room.phase !== "playing") return { success: false, reason: "NOT_IN_PLAYING_PHASE" };

    const marker = room.hologramMarkers.find((m) => m.id === markerId);
    if (!marker) return { success: false, reason: "MARKER_NOT_FOUND" };

    const callerSim = room.simulation.getPlayer(callerId);
    if (!callerSim) return { success: false, reason: "SIM_PLAYER_NOT_FOUND" };

    if (!canReportHologram({ x: callerSim.x, y: callerSim.y }, marker)) {
      return { success: false, reason: "MARKER_CANNOT_BE_REPORTED" };
    }

    marker.reported = true;
    room.phase = "meeting";
    room.updatedAt = Date.now();

    return { success: true };
  }

  callEmergencyMeeting(roomId: string, callerId: string): { success: boolean; reason?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, reason: "ROOM_NOT_FOUND" };
    if (room.phase !== "playing") return { success: false, reason: "NOT_IN_PLAYING_PHASE" };

    const caller = room.players.get(callerId);
    if (!caller || caller.status !== "alive") return { success: false, reason: "GHOST_CANNOT_CALL_MEETING" };

    room.phase = "meeting";
    room.updatedAt = Date.now();
    return { success: true };
  }

  private checkAndApplyWinCondition(room: RiotRoom): WinConditionResult | null {
    const rulePlayers = new Map<string, { id: string; role: PlayerRole; status: PlayerStatus }>();
    for (const [id, p] of room.players.entries()) {
      rulePlayers.set(id, { id, role: p.role, status: p.status });
    }

    const winResult = evaluateWinCondition({
      phase: room.phase,
      players: rulePlayers,
      tasksTotal: room.tasksTotal,
      tasksCompleted: room.tasksCompleted,
    });

    if (winResult) {
      room.phase = "finished";
      room.winner = winResult.winner;
      room.winReason = winResult.reason;

      // Compute final scores strictly following R8 rules
      const roundPlayerData = Array.from(room.players.values()).map((p) => ({
        id: p.id,
        role: p.role,
        tasksCompleted: p.tasksCompleted,
        correctVotes: p.correctVotes,
      }));
      room.scores = calculateRoundScores(roundPlayerData, winResult.winner);
      room.updatedAt = Date.now();
    }

    return winResult;
  }

  /**
   * Generates a safe client view. CRITICAL: Other players' roles are strictly omitted!
   */
  getClientRoomView(roomId: string, viewerId: string): RiotClientRoomView | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const viewer = room.players.get(viewerId);
    if (!viewer) return null;

    const publicPlayers: RiotPublicPlayerView[] = Array.from(room.players.values()).map((p) => ({
      id: p.id,
      displayName: p.displayName,
      status: p.status,
    }));

    const scoresObj: Record<string, PlayerScoreBreakdown> = {};
    if (room.scores) {
      for (const [id, s] of room.scores.entries()) {
        scoresObj[id] = s;
      }
    }

    return {
      roomId: room.id,
      phase: room.phase,
      hostId: room.hostId,
      myRole: viewer.role,
      myStatus: viewer.status,
      players: publicPlayers,
      hologramMarkers: room.hologramMarkers,
      tasksTotal: room.tasksTotal,
      tasksCompleted: room.tasksCompleted,
      winner: room.winner,
      winReason: room.winReason,
      scores: room.phase === "finished" ? scoresObj : undefined,
    };
  }

  /**
   * Generates interest-filtered compact snapshot for a specific viewer.
   */
  getClientSnapshot(roomId: string, viewerId: string, serverTime = Date.now()): CompactSnapshotPayload | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const tick = room.simulation.getTick();
    const allStates = room.simulation.getAllPlayers();

    return encodeInterestSnapshot(viewerId, tick, serverTime, allStates, VISION_RADIUS);
  }

  cleanupExpiredRooms(days = 1): number {
    const cutoff = computeExpirationCutoff(days).getTime();
    let removedCount = 0;

    for (const [id, room] of this.rooms.entries()) {
      if (room.updatedAt < cutoff) {
        this.rooms.delete(id);
        removedCount++;
      }
    }

    return removedCount;
  }
}
