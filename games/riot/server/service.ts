import { censorProfanity, computeExpirationCutoff } from "@low-stress/sdk";
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
  DEFAULT_RIOT_HARD_CAP,
  DISCONNECT_GRACE_PERIOD_MS,
  MIN_PLAYERS_TO_START,
  type RiotHostOptions,
  sanitizeHostOptions,
} from "../shared/lobby";
import {
  type MeetingChatMessage,
  type MeetingTrigger,
  type VotingResolutionResult,
  filterMessagesForViewer,
  processChatMessage,
  resolveVotes,
} from "../shared/meetings";
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
  type ActiveSabotage,
  CRITICAL_ALARM_DURATION_MS,
  DOOR_LOCK_DURATION_MS,
  SABOTAGE_COOLDOWN_MS,
  type SabotageKind,
  getEffectiveVisionRadius,
  isCriticalAlarmExpired,
} from "../shared/sabotage";
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
import {
  type RiotClientRoomView,
  type RiotPublicPlayerView,
} from "../shared/protocol";
import { type PlayerInput } from "../shared/types";
import type { RiotCharacterCustomization } from "../shared/character";

export type { RiotClientRoomView, RiotPublicPlayerView } from "../shared/protocol";

export interface RiotPlayer {
  id: string;
  displayName: string;
  character?: RiotCharacterCustomization;
  role: PlayerRole;
  status: PlayerStatus;
  connected: boolean;
  disconnectedAt: number | null;
  lastActionAt: number;
  tasksCompleted: number;
  correctVotes: number;
  assignedTasks: string[];
  completedTasks: string[];
  emergencyMeetingsRemaining: number;
  lastChatSentAt: number;
  votedFor: string | "skip" | null;
  isAbandoned: boolean;
}

export interface RiotRoom {
  id: string;
  hostId: string;
  phase: GamePhase;
  options: RiotHostOptions;
  players: Map<string, RiotPlayer>;
  simulation: AuthoritativeSimulation;
  hologramMarkers: HologramMarker[];
  tasksTotal: number;
  tasksCompleted: number;
  activeSabotage: ActiveSabotage | null;
  lastSabotageAt: number;
  chatMessages: MeetingChatMessage[];
  meetingReason: MeetingTrigger | null;
  phaseStartedAt: number;
  votes: Map<string, string | "skip">;
  votingResult: VotingResolutionResult | null;
  winner: WinWinner | null;
  winReason: WinReason | null;
  scores: Map<string, PlayerScoreBreakdown> | null;
  createdAt: number;
  updatedAt: number;
  /** Waktu mulai ronde berjalan (ms epoch); 0 bila belum dimulai. Dipakai RT-50 untuk durasi run leaderboard. */
  roundStartedAt: number;
}

export class RiotGameService {
  private rooms = new Map<string, RiotRoom>();
  private censorFn: (text: string) => string = censorProfanity;

  constructor(options?: { censorText?: (text: string) => string }) {
    if (options?.censorText) {
      this.censorFn = options.censorText;
    }
  }

  setCensorFn(fn: (text: string) => string): void {
    this.censorFn = fn;
  }

  private resolveRoom(roomId: string): RiotRoom | undefined {
    const exact = this.rooms.get(roomId);
    if (exact) return exact;
    const trimmed = roomId.trim();
    const byTrimmed = this.rooms.get(trimmed);
    if (byTrimmed) return byTrimmed;
    if (trimmed.length >= 6) {
      const code = trimmed.slice(-6).toUpperCase();
      for (const room of this.rooms.values()) {
        if (room.id.slice(-6).toUpperCase() === code) {
          return room;
        }
      }
    }
    return undefined;
  }

  private transferHostIfNeeded(room: RiotRoom, departingId: string): boolean {
    if (room.hostId !== departingId) return false;
    const nextConnected = Array.from(room.players.values()).find(
      (p) => p.id !== departingId && p.connected && !p.isAbandoned,
    );
    const nextAny = Array.from(room.players.values()).find(
      (p) => p.id !== departingId,
    );
    const nextHost = nextConnected ?? nextAny;
    if (nextHost) {
      room.hostId = nextHost.id;
      return true;
    }
    return false;
  }

  createRoom(
    hostId: string,
    hostName: string,
    roomId = `riot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    options: Partial<RiotHostOptions> = {},
    character?: RiotCharacterCustomization,
  ): RiotRoom {
    const sanitizedOptions = sanitizeHostOptions(options);
    const sim = new AuthoritativeSimulation({
      speedMultiplier: sanitizedOptions.playerSpeed,
    });
    const players = new Map<string, RiotPlayer>();

    const hostPlayer: RiotPlayer = {
      id: hostId,
      displayName: hostName,
      character,
      role: "crew",
      status: "alive",
      connected: true,
      disconnectedAt: null,
      lastActionAt: 0,
      tasksCompleted: 0,
      correctVotes: 0,
      assignedTasks: [],
      completedTasks: [],
      emergencyMeetingsRemaining: sanitizedOptions.emergencyMeetingsPerPlayer,
      lastChatSentAt: 0,
      votedFor: null,
      isAbandoned: false,
    };
    players.set(hostId, hostPlayer);
    sim.addPlayer(hostId);

    const room: RiotRoom = {
      id: roomId,
      hostId,
      phase: "lobby",
      options: sanitizedOptions,
      players,
      simulation: sim,
      hologramMarkers: [],
      tasksTotal: 0,
      tasksCompleted: 0,
      activeSabotage: null,
      lastSabotageAt: 0,
      chatMessages: [],
      meetingReason: null,
      phaseStartedAt: Date.now(),
      votes: new Map(),
      votingResult: null,
      winner: null,
      winReason: null,
      scores: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      roundStartedAt: 0,
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

  updateHostOptions(roomId: string, hostId: string, options: Partial<RiotHostOptions>): { success: boolean; reason?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, reason: "ROOM_NOT_FOUND" };
    if (room.hostId !== hostId) return { success: false, reason: "NOT_ROOM_HOST" };
    if (room.phase !== "lobby") return { success: false, reason: "CANNOT_CHANGE_OPTIONS_IN_GAME" };

    room.options = sanitizeHostOptions({ ...room.options, ...options });
    room.simulation.setSpeedMultiplier(room.options.playerSpeed);
    room.updatedAt = Date.now();
    return { success: true };
  }

  /**
   * Memperbarui kustomisasi karakter pemain (RT-42). Hanya boleh saat fase
   * lobby; kustomisasi dibekukan saat permainan dimulai.
   */
  updateCharacter(
    roomId: string,
    playerId: string,
    character: RiotCharacterCustomization,
  ): { success: boolean; reason?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, reason: "ROOM_NOT_FOUND" };
    if (room.phase !== "lobby") return { success: false, reason: "CANNOT_CHANGE_CHARACTER_IN_GAME" };
    const player = room.players.get(playerId);
    if (!player) return { success: false, reason: "PLAYER_NOT_FOUND" };
    player.character = character;
    room.updatedAt = Date.now();
    return { success: true };
  }

  joinRoom(
    roomId: string,
    playerId: string,
    playerName: string,
    character?: RiotCharacterCustomization,
  ): { success: boolean; room?: RiotRoom; reason?: string } {
    const room = this.resolveRoom(roomId);
    if (!room) {
      return { success: false, reason: "ROOM_NOT_FOUND" };
    }
    if (room.phase !== "lobby") {
      return { success: false, reason: "GAME_ALREADY_IN_PROGRESS" };
    }

    // Check hard cap (process.env.RIOT_HARD_CAP or 32)
    const hardCap = Number(process.env.RIOT_HARD_CAP) || DEFAULT_RIOT_HARD_CAP;
    if (room.players.size >= hardCap && !room.players.has(playerId)) {
      return { success: false, reason: "ROOM_CAPACITY_REACHED" };
    }

    if (room.players.has(playerId)) {
      const existing = room.players.get(playerId)!;
      existing.connected = true;
      existing.disconnectedAt = null;
      if (character) existing.character = character;
      return { success: true, room };
    }

    const newPlayer: RiotPlayer = {
      id: playerId,
      displayName: playerName,
      character,
      role: "crew",
      status: "alive",
      connected: true,
      disconnectedAt: null,
      lastActionAt: 0,
      tasksCompleted: 0,
      correctVotes: 0,
      assignedTasks: [],
      completedTasks: [],
      emergencyMeetingsRemaining: room.options.emergencyMeetingsPerPlayer,
      lastChatSentAt: 0,
      votedFor: null,
      isAbandoned: false,
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

    if (room.players.size === 0) {
      this.rooms.delete(roomId);
      return { success: true, roomClosed: true };
    }

    if (room.hostId === playerId) {
      if (!this.transferHostIfNeeded(room, playerId)) {
        this.rooms.delete(roomId);
        return { success: true, roomClosed: true };
      }
    }

    return { success: true, roomClosed: false };
  }

  /**
   * Kembali ke fase lobby setelah ronde selesai (rematch, RT-42).
   * Hanya host; pemain & room dipertahankan, status permainan direset.
   */
  returnToLobby(roomId: string, callerId: string): { success: boolean; reason?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, reason: "ROOM_NOT_FOUND" };
    if (room.hostId !== callerId) return { success: false, reason: "NOT_ROOM_HOST" };
    if (room.phase !== "finished") return { success: false, reason: "NOT_FINISHED" };

    for (const player of room.players.values()) {
      player.role = "crew";
      player.status = "alive";
      player.tasksCompleted = 0;
      player.completedTasks = [];
      player.correctVotes = 0;
      player.assignedTasks = [];
      player.votedFor = null;
      player.isAbandoned = false;
      player.emergencyMeetingsRemaining = room.options.emergencyMeetingsPerPlayer;
      player.lastActionAt = 0;
    }

    room.phase = "lobby";
    room.simulation = new AuthoritativeSimulation({
      speedMultiplier: room.options.playerSpeed,
    });
    for (const id of room.players.keys()) room.simulation.addPlayer(id);
    room.hologramMarkers = [];
    room.tasksTotal = 0;
    room.tasksCompleted = 0;
    room.activeSabotage = null;
    room.lastSabotageAt = 0;
    room.chatMessages = [];
    room.meetingReason = null;
    room.phaseStartedAt = Date.now();
    room.votes.clear();
    room.votingResult = null;
    room.winner = null;
    room.winReason = null;
    room.scores = null;
    room.updatedAt = Date.now();
    room.roundStartedAt = 0;
    return { success: true };
  }

  startGame(roomId: string, callerId: string): {
    success: boolean;
    reason?: string;
    roles?: Map<string, PlayerRole>;
  } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, reason: "ROOM_NOT_FOUND" };
    if (room.hostId !== callerId) return { success: false, reason: "NOT_ROOM_HOST" };
    if (room.players.size < MIN_PLAYERS_TO_START) return { success: false, reason: "MIN_PLAYERS_NOT_MET" };
    if (!canTransitionPhase(room.phase, "playing")) return { success: false, reason: "INVALID_PHASE_TRANSITION" };

    const playerIds = Array.from(room.players.keys());
    const assignedRoles = assignRoles(playerIds, room.options.infiltratorCount);

    // Assign tasks: each crew member draws a shuffled subset of the
    // station task pool so players do not all share the same three tasks.
    const allTaskIds = STATION_TASKS.map((t) => t.id);
    let totalCrewTasks = 0;

    for (const [id, player] of room.players.entries()) {
      const role = assignedRoles.get(id) ?? "crew";
      player.role = role;
      player.status = "alive";
      player.connected = true;
      player.disconnectedAt = null;
      player.lastActionAt = Date.now();
      player.tasksCompleted = 0;
      player.completedTasks = [];
      player.correctVotes = 0;
      player.votedFor = null;
      player.isAbandoned = false;
      player.emergencyMeetingsRemaining = room.options.emergencyMeetingsPerPlayer;

      if (role === "crew") {
        const shuffled = [...allTaskIds].sort(() => Math.random() - 0.5);
        player.assignedTasks = shuffled.slice(0, room.options.tasksPerPlayer);
        totalCrewTasks += player.assignedTasks.length;
      } else {
        player.assignedTasks = [];
      }
    }

    room.simulation.setSpeedMultiplier(room.options.playerSpeed);
    room.simulation.setActiveSabotage(null);
    room.phase = "playing";
    room.roundStartedAt = Date.now();
    room.tasksTotal = totalCrewTasks;
    room.tasksCompleted = 0;
    room.hologramMarkers = [];
    room.activeSabotage = null;
    room.lastSabotageAt = 0;
    room.chatMessages = [];
    room.meetingReason = null;
    room.phaseStartedAt = Date.now();
    room.votes.clear();
    room.votingResult = null;
    room.winner = null;
    room.winReason = null;
    room.scores = null;
    room.updatedAt = Date.now();

    return { success: true, roles: assignedRoles };
  }

  processMovementInput(roomId: string, playerId: string, input: PlayerInput, serverTime = Date.now()) {
    const room = this.rooms.get(roomId);
    if (!room || room.phase !== "playing") return { accepted: false };
    const player = room.players.get(playerId);
    if (!player || !player.connected || player.isAbandoned) return { accepted: false };
    return room.simulation.processInput(playerId, input, serverTime, {
      speedMultiplier: room.options.playerSpeed,
      activeSabotage: room.activeSabotage,
    });
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
    if (!player.assignedTasks.includes(proof.taskId)) {
      return { success: false, reason: "TASK_NOT_ASSIGNED" };
    }
    if (player.completedTasks.includes(proof.taskId)) {
      return { success: false, reason: "TASK_ALREADY_DONE" };
    }

    const simPlayer = room.simulation.getPlayer(playerId);
    if (!simPlayer) return { success: false, reason: "SIM_PLAYER_NOT_FOUND" };

    const validation = validateTaskCompletion(task, { x: simPlayer.x, y: simPlayer.y }, proof);
    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }

    player.tasksCompleted++;
    player.completedTasks.push(proof.taskId);
    room.tasksCompleted++;
    room.updatedAt = Date.now();

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

    const cooldownMs = room.options.actionCooldownSeconds * 1000;
    const validation = validateInfiltratorAction(actionContext, targetContext, cooldownMs, serverTime);
    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }

    target.status = "ghost";
    caller.lastActionAt = serverTime;

    const marker = createHologramMarker(target.id, { x: targetSim.x, y: targetSim.y }, serverTime);
    room.hologramMarkers.push(marker);
    room.updatedAt = serverTime;

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
    this.startMeeting(room, "hologram_reported");
    return { success: true };
  }

  callEmergencyMeeting(roomId: string, callerId: string): { success: boolean; reason?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, reason: "ROOM_NOT_FOUND" };
    if (room.phase !== "playing") return { success: false, reason: "NOT_IN_PLAYING_PHASE" };

    const caller = room.players.get(callerId);
    if (!caller || caller.status !== "alive") return { success: false, reason: "GHOST_CANNOT_CALL_MEETING" };
    if (caller.emergencyMeetingsRemaining <= 0) return { success: false, reason: "NO_EMERGENCY_MEETINGS_REMAINING" };

    caller.emergencyMeetingsRemaining--;
    this.startMeeting(room, "emergency_button");
    return { success: true };
  }

  private startMeeting(room: RiotRoom, trigger: MeetingTrigger): void {
    room.phase = "meeting";
    room.meetingReason = trigger;
    room.phaseStartedAt = Date.now();
    room.votes.clear();
    room.votingResult = null;
    room.chatMessages = [];

    // Clear non-critical sabotage during meeting
    if (room.activeSabotage && room.activeSabotage.kind !== "critical_alarm") {
      room.activeSabotage = null;
      room.simulation.setActiveSabotage(null);
    }

    for (const player of room.players.values()) {
      player.votedFor = null;
    }

    room.updatedAt = Date.now();
  }

  // --- RT-30: Rapat Chat & Voting ---

  sendChatMessage(
    roomId: string,
    senderId: string,
    text: string,
    serverTime = Date.now(),
    censorFn?: (text: string) => string,
  ): {
    success: boolean;
    reason?: string;
    message?: MeetingChatMessage;
    audience?: "all" | "ghosts_only";
  } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, reason: "ROOM_NOT_FOUND" };
    if (room.phase !== "meeting" && room.phase !== "voting") {
      return { success: false, reason: "CHAT_ONLY_ALLOWED_IN_MEETING_OR_VOTING" };
    }

    const sender = room.players.get(senderId);
    if (!sender) return { success: false, reason: "PLAYER_NOT_FOUND" };

    const res = processChatMessage(
      sender.id,
      sender.displayName,
      sender.status,
      text,
      sender.lastChatSentAt,
      serverTime,
      censorFn ?? this.censorFn,
    );

    if (!res.valid || !res.message) {
      return { success: false, reason: res.reason };
    }

    sender.lastChatSentAt = serverTime;
    room.chatMessages.push(res.message);
    room.updatedAt = serverTime;

    return {
      success: true,
      message: res.message,
      audience: sender.status === "ghost" ? "ghosts_only" : "all",
    };
  }

  sendMeetingChat(
    roomId: string,
    senderId: string,
    text: string,
    serverTime = Date.now(),
    censorFn?: (text: string) => string,
  ) {
    return this.sendChatMessage(roomId, senderId, text, serverTime, censorFn);
  }

  advanceMeetingToVoting(roomId: string): { success: boolean; reason?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, reason: "ROOM_NOT_FOUND" };
    if (room.phase !== "meeting") return { success: false, reason: "NOT_IN_MEETING_PHASE" };

    room.phase = "voting";
    room.phaseStartedAt = Date.now();
    room.votes.clear();
    room.updatedAt = Date.now();
    return { success: true };
  }

  castVote(roomId: string, voterId: string, targetId: string | "skip"): {
    success: boolean;
    reason?: string;
    concluded?: boolean;
    votingResult?: VotingResolutionResult | null;
    winResult?: WinConditionResult | null;
  } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, reason: "ROOM_NOT_FOUND" };
    if (room.phase !== "voting") return { success: false, reason: "NOT_IN_VOTING_PHASE" };

    const voter = room.players.get(voterId);
    if (!voter) return { success: false, reason: "VOTER_NOT_FOUND" };
    if (voter.status !== "alive") return { success: false, reason: "GHOST_CANNOT_VOTE" };

    if (targetId !== "skip") {
      const target = room.players.get(targetId);
      if (!target || target.status !== "alive") {
        return { success: false, reason: "TARGET_NOT_ALIVE_PLAYER" };
      }
    }

    voter.votedFor = targetId;
    room.votes.set(voter.id, targetId);
    room.updatedAt = Date.now();

    // Check if all connected alive players have voted
    const activeVoters = Array.from(room.players.values()).filter(
      (p) => p.status === "alive" && p.connected && !p.isAbandoned,
    );

    if (room.votes.size >= activeVoters.length) {
      const conclusion = this.concludeVoting(roomId);
      return {
        success: true,
        concluded: true,
        votingResult: conclusion.votingResult,
        winResult: conclusion.winResult,
      };
    }

    return { success: true, concluded: false };
  }

  concludeVoting(roomId: string): {
    success: boolean;
    votingResult?: VotingResolutionResult | null;
    winResult?: WinConditionResult | null;
  } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false };

    const alivePlayerIds = Array.from(room.players.values())
      .filter((p) => p.status === "alive" && !p.isAbandoned)
      .map((p) => p.id);

    const resolution = resolveVotes(room.votes, alivePlayerIds);
    room.votingResult = resolution;

    if (resolution.ejectedId) {
      const ejected = room.players.get(resolution.ejectedId);
      if (ejected) {
        ejected.status = "ghost";
        // If ejected player was an infiltrator, reward all players who voted for them
        if (ejected.role === "infiltrator") {
          for (const [vId, target] of room.votes.entries()) {
            if (target === ejected.id) {
              const voter = room.players.get(vId);
              if (voter) voter.correctVotes++;
            }
          }
        }
      }
    }

    // Check win condition after ejection
    const winResult = this.checkAndApplyWinCondition(room);

    if (!winResult) {
      // Transition back to playing
      room.phase = "playing";
      room.phaseStartedAt = Date.now();
    }

    room.updatedAt = Date.now();
    return { success: true, votingResult: resolution, winResult };
  }

  // --- RT-31: Sabotase (Server-Authoritative) ---

  triggerSabotage(
    roomId: string,
    callerId: string,
    kind: SabotageKind,
    targetRoom?: string,
    serverTime = Date.now(),
  ): { success: boolean; reason?: string; sabotage?: ActiveSabotage } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, reason: "ROOM_NOT_FOUND" };
    if (room.phase !== "playing") return { success: false, reason: "NOT_IN_PLAYING_PHASE" };

    const caller = room.players.get(callerId);
    if (!caller) return { success: false, reason: "PLAYER_NOT_FOUND" };
    if (caller.role !== "infiltrator" || caller.status !== "alive") {
      return { success: false, reason: "ONLY_ALIVE_INFILTRATOR_CAN_SABOTAGE" };
    }

    // Check cooldown
    if (serverTime - room.lastSabotageAt < SABOTAGE_COOLDOWN_MS) {
      return { success: false, reason: "SABOTAGE_ON_COOLDOWN" };
    }

    // Check if another sabotage is active
    if (room.activeSabotage && !room.activeSabotage.resolved) {
      return { success: false, reason: "ANOTHER_SABOTAGE_ACTIVE" };
    }

    let durationMs = 0;
    if (kind === "doors") durationMs = DOOR_LOCK_DURATION_MS;
    if (kind === "critical_alarm") durationMs = CRITICAL_ALARM_DURATION_MS;

    const sabotage: ActiveSabotage = {
      kind,
      targetRoom,
      startedAt: serverTime,
      durationMs,
      resolved: false,
      activatedSwitches: new Set(),
    };

    room.activeSabotage = sabotage;
    room.simulation.setActiveSabotage(sabotage);
    room.lastSabotageAt = serverTime;
    room.updatedAt = serverTime;

    return { success: true, sabotage };
  }

  repairSabotage(
    roomId: string,
    callerId: string,
    stationId: string,
    serverTime = Date.now(),
  ): { success: boolean; reason?: string; resolved?: boolean } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, reason: "ROOM_NOT_FOUND" };
    if (room.phase !== "playing") return { success: false, reason: "NOT_IN_PLAYING_PHASE" };

    const caller = room.players.get(callerId);
    if (!caller || caller.status !== "alive") return { success: false, reason: "PLAYER_NOT_ALIVE" };

    const sabotage = room.activeSabotage;
    if (!sabotage || sabotage.resolved) {
      return { success: false, reason: "NO_ACTIVE_SABOTAGE" };
    }

    if (sabotage.kind === "blackout") {
      sabotage.resolved = true;
      room.simulation.setActiveSabotage(sabotage);
      room.updatedAt = serverTime;
      return { success: true, resolved: true };
    }

    if (sabotage.kind === "critical_alarm") {
      sabotage.activatedSwitches.add(stationId);
      // Both cooling and power stations must be activated
      if (sabotage.activatedSwitches.size >= 2) {
        sabotage.resolved = true;
        room.simulation.setActiveSabotage(sabotage);
        room.updatedAt = serverTime;
        return { success: true, resolved: true };
      }
      return { success: true, resolved: false };
    }

    return { success: false, reason: "CANNOT_REPAIR_THIS_SABOTAGE" };
  }

  // --- RT-32: Putus Koneksi & Resiliensi Jaringan ---

  handleDisconnect(roomId: string, playerId: string, serverTime = Date.now()): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.players.get(playerId);
    if (!player) return;

    player.connected = false;
    player.disconnectedAt = serverTime;
    room.updatedAt = serverTime;

    if (room.phase === "finished") {
      this.transferHostIfNeeded(room, playerId);
    }

    // If currently voting, check if all remaining connected players have voted
    if (room.phase === "voting") {
      const activeVoters = Array.from(room.players.values()).filter(
        (p) => p.status === "alive" && p.connected && !p.isAbandoned,
      );
      if (room.votes.size >= activeVoters.length) {
        this.concludeVoting(roomId);
      }
    }
  }

  reconnectPlayer(roomId: string, playerId: string): { success: boolean; view?: RiotClientRoomView | null } {
    const room = this.resolveRoom(roomId);
    if (!room) return { success: false };

    const player = room.players.get(playerId);
    if (!player) return { success: false };

    player.connected = true;
    player.disconnectedAt = null;
    player.isAbandoned = false;
    room.updatedAt = Date.now();

    const view = this.getClientRoomView(room.id, playerId);
    return { success: true, view };
  }

  kickPlayer(roomId: string, hostId: string, targetId: string): { success: boolean; reason?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, reason: "ROOM_NOT_FOUND" };
    if (room.hostId !== hostId) return { success: false, reason: "NOT_ROOM_HOST" };
    if (targetId === hostId) return { success: false, reason: "HOST_CANNOT_KICK_SELF" };

    const target = room.players.get(targetId);
    if (!target) return { success: false, reason: "TARGET_NOT_FOUND" };

    room.players.delete(targetId);
    room.simulation.removePlayer(targetId);
    room.votes.delete(targetId);

    // Re-evaluate win condition if in game
    if (room.phase === "playing" || room.phase === "voting" || room.phase === "meeting") {
      this.checkAndApplyWinCondition(room);
    }

    room.updatedAt = Date.now();
    return { success: true };
  }

  adminResetRoom(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    for (const player of room.players.values()) {
      player.role = "crew";
      player.status = "alive";
      player.tasksCompleted = 0;
      player.completedTasks = [];
      player.correctVotes = 0;
      player.assignedTasks = [];
      player.votedFor = null;
      player.isAbandoned = false;
      player.emergencyMeetingsRemaining = room.options.emergencyMeetingsPerPlayer;
      player.lastActionAt = 0;
    }

    room.phase = "lobby";
    room.simulation = new AuthoritativeSimulation({
      speedMultiplier: room.options.playerSpeed,
    });
    for (const id of room.players.keys()) room.simulation.addPlayer(id);
    room.hologramMarkers = [];
    room.tasksTotal = 0;
    room.tasksCompleted = 0;
    room.activeSabotage = null;
    room.lastSabotageAt = 0;
    room.chatMessages = [];
    room.meetingReason = null;
    room.phaseStartedAt = Date.now();
    room.votes.clear();
    room.votingResult = null;
    room.winner = null;
    room.winReason = null;
    room.scores = null;
    room.updatedAt = Date.now();
    room.roundStartedAt = 0;
    return true;
  }

  adminKickPlayer(roomId: string, userId: string): { removed: boolean; roomClosed: boolean } {
    const room = this.rooms.get(roomId);
    if (!room || !room.players.has(userId)) {
      return { removed: false, roomClosed: false };
    }

    room.players.delete(userId);
    room.simulation.removePlayer(userId);
    room.votes.delete(userId);

    if (room.players.size === 0) {
      this.rooms.delete(roomId);
      return { removed: true, roomClosed: true };
    }

    this.transferHostIfNeeded(room, userId);

    if (room.phase === "playing" || room.phase === "voting" || room.phase === "meeting") {
      this.checkAndApplyWinCondition(room);
    }

    room.updatedAt = Date.now();
    return { removed: true, roomClosed: false };
  }

  adminDeleteRoom(roomId: string): boolean {
    return this.rooms.delete(roomId);
  }

  /**
   * Periodic check called by server loop to handle timers, sabotages, and abandoned players.
   */
  processServerTick(roomId: string, serverTime = Date.now()): {
    winResult?: WinConditionResult | null;
    phaseAdvanced?: boolean;
  } {
    const room = this.rooms.get(roomId);
    if (!room) return {};

    // 1. Check critical alarm expiration
    if (room.phase === "playing" && isCriticalAlarmExpired(room.activeSabotage, serverTime)) {
      room.phase = "finished";
      room.winner = "infiltrator";
      room.winReason = "infiltrators_critical_sabotage";
      room.scores = calculateRoundScores(
        Array.from(room.players.values()).map((p) => ({
          id: p.id,
          role: p.role,
          tasksCompleted: p.tasksCompleted,
          correctVotes: p.correctVotes,
        })),
        "infiltrator",
      );
      room.updatedAt = serverTime;
      return { winResult: { winner: "infiltrator", reason: "infiltrators_critical_sabotage" } };
    }

    // 2. Check door sabotage expiration
    if (
      room.activeSabotage?.kind === "doors" &&
      !room.activeSabotage.resolved &&
      serverTime - room.activeSabotage.startedAt >= room.activeSabotage.durationMs
    ) {
      room.activeSabotage.resolved = true;
      room.simulation.setActiveSabotage(room.activeSabotage);
      room.updatedAt = serverTime;
    }

    // 3. Check meeting discussion timer
    if (
      room.phase === "meeting" &&
      serverTime - room.phaseStartedAt >= room.options.discussionDurationSeconds * 1000
    ) {
      this.advanceMeetingToVoting(roomId);
      return { phaseAdvanced: true };
    }

    // 4. Check voting duration timer
    if (
      room.phase === "voting" &&
      serverTime - room.phaseStartedAt >= room.options.votingDurationSeconds * 1000
    ) {
      const conclusion = this.concludeVoting(roomId);
      return { phaseAdvanced: true, winResult: conclusion.winResult };
    }

    // 5. Handle abandoned players (disconnected > 60s)
    let winResult: WinConditionResult | null | undefined;
    for (const player of room.players.values()) {
      if (!player.connected && !player.isAbandoned && player.disconnectedAt) {
        if (serverTime - player.disconnectedAt >= DISCONNECT_GRACE_PERIOD_MS) {
          player.isAbandoned = true;
          this.transferHostIfNeeded(room, player.id);
          if (room.phase === "playing" || room.phase === "voting" || room.phase === "meeting") {
            // Count abandoned player as eliminated so alive count doesn't stall game
            player.status = "ghost";
            const win = this.checkAndApplyWinCondition(room);
            if (win) winResult = win;
          }
        }
      }
    }

    return winResult ? { winResult } : {};
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

  getClientRoomView(roomId: string, viewerId: string): RiotClientRoomView | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const viewer = room.players.get(viewerId);
    if (!viewer) return null;

    const publicPlayers: RiotPublicPlayerView[] = Array.from(room.players.values()).map((p) => ({
      id: p.id,
      displayName: p.displayName,
      status: p.status,
      connected: p.connected,
      hasVoted: p.votedFor !== null,
      character: p.character,
    }));

    const scoresObj: Record<string, PlayerScoreBreakdown> = {};
    if (room.scores) {
      for (const [id, s] of room.scores.entries()) {
        scoresObj[id] = s;
      }
    }

    // Ghost chat isolation: alive players NEVER see ghost messages!
    const visibleMessages = filterMessagesForViewer(room.chatMessages, viewer.status);

    return {
      roomId: room.id,
      viewerId,
      phase: room.phase,
      hostId: room.hostId,
      options: room.options,
      myRole: viewer.role,
      myStatus: viewer.status,
      players: publicPlayers,
      hologramMarkers: room.hologramMarkers,
      tasksTotal: room.tasksTotal,
      tasksCompleted: room.tasksCompleted,
      myTasks: [...viewer.assignedTasks],
      myCompletedTasks: [...viewer.completedTasks],
      activeSabotage:
        room.activeSabotage && !room.activeSabotage.resolved
          ? {
              kind: room.activeSabotage.kind,
              targetRoom: room.activeSabotage.targetRoom,
              startedAt: room.activeSabotage.startedAt,
              durationMs: room.activeSabotage.durationMs,
            }
          : null,
      chatMessages: visibleMessages,
      meetingReason: room.meetingReason,
      votingResult: room.phase === "voting" || room.phase === "finished" ? room.votingResult : null,
      winner: room.winner,
      winReason: room.winReason,
      ejectedRole: room.votingResult?.ejectedId
        ? (room.players.get(room.votingResult.ejectedId)?.role ?? null)
        : null,
      scores: room.phase === "finished" ? scoresObj : undefined,
    };
  }

  getClientSnapshot(roomId: string, viewerId: string, serverTime = Date.now()): CompactSnapshotPayload | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const viewer = room.players.get(viewerId);
    if (!viewer) return null;

    const tick = room.simulation.getTick();
    const allStates = room.simulation.getAllPlayers();

    // Dynamically adjust vision radius based on active sabotage (e.g. blackout)
    const effectiveRadius = getEffectiveVisionRadius(
      viewer.role,
      room.activeSabotage,
      room.options.visionRadius,
    );

    return encodeInterestSnapshot(viewerId, tick, serverTime, allStates, effectiveRadius);
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
