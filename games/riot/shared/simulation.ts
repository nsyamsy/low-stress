import { getSpawnPoint, resolveMovement } from "./collision";
import {
  MAX_ALLOWED_SPEED,
  MAX_PLAYER_SPEED,
  PLAYER_RADIUS,
  type PlayerInput,
  type PlayerMovementState,
  type ServerTickSnapshot,
} from "./types";

export interface SimulationConfig {
  tickRate?: number;
  playerRadius?: number;
  maxSpeed?: number;
  maxAllowedSpeed?: number;
}

export class AuthoritativeSimulation {
  private players = new Map<string, PlayerMovementState>();
  private tickCount = 0;
  private readonly playerRadius: number;
  private readonly maxSpeed: number;
  private readonly maxAllowedSpeed: number;

  constructor(config: SimulationConfig = {}) {
    this.playerRadius = config.playerRadius ?? PLAYER_RADIUS;
    this.maxSpeed = config.maxSpeed ?? MAX_PLAYER_SPEED;
    this.maxAllowedSpeed = config.maxAllowedSpeed ?? MAX_ALLOWED_SPEED;
  }

  addPlayer(id: string, initialPos?: { x: number; y: number }): PlayerMovementState {
    const pos = initialPos ?? getSpawnPoint(this.players.size);
    const state: PlayerMovementState = {
      id,
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
      heading: 0,
      lastProcessedSeq: 0,
      updatedAt: Date.now(),
    };
    this.players.set(id, state);
    return state;
  }

  removePlayer(id: string): boolean {
    return this.players.delete(id);
  }

  getPlayer(id: string): PlayerMovementState | undefined {
    return this.players.get(id);
  }

  getAllPlayers(): PlayerMovementState[] {
    return Array.from(this.players.values());
  }

  getTick(): number {
    return this.tickCount;
  }

  processInput(
    playerId: string,
    input: PlayerInput,
    serverTime = Date.now(),
  ): { accepted: boolean; state?: PlayerMovementState; reason?: string } {
    const player = this.players.get(playerId);
    if (!player) {
      return { accepted: false, reason: "PLAYER_NOT_FOUND" };
    }

    // Sequence check (must be strictly newer than lastProcessedSeq)
    if (input.seq <= player.lastProcessedSeq) {
      return { accepted: false, state: player, reason: "OUTDATED_SEQUENCE" };
    }

    // Sanity check dt (must be between 1ms and 500ms)
    if (input.dt <= 0 || input.dt > 0.5) {
      return { accepted: false, state: player, reason: "INVALID_DELTA_TIME" };
    }

    // Input magnitude check (unit circle)
    const inputMagnitude = Math.hypot(input.dx, input.dy);
    if (inputMagnitude > 1.05) {
      return { accepted: false, state: player, reason: "INPUT_MAGNITUDE_EXCEEDED" };
    }

    // Calculate requested displacement
    const targetSpeed = Math.min(inputMagnitude * this.maxSpeed, this.maxSpeed);
    const displacement = targetSpeed * input.dt;
    const requestedSpeed = displacement / input.dt;

    if (requestedSpeed > this.maxAllowedSpeed) {
      return { accepted: false, state: player, reason: "SPEED_LIMIT_EXCEEDED" };
    }

    // Direction vector
    let dirX = 0;
    let dirY = 0;
    if (inputMagnitude > 0.001) {
      dirX = input.dx / inputMagnitude;
      dirY = input.dy / inputMagnitude;
    }

    const desiredX = player.x + dirX * displacement;
    const desiredY = player.y + dirY * displacement;

    // Authoritative collision resolution against 2D map walls with sliding
    const resolved = resolveMovement(
      { x: player.x, y: player.y },
      { x: desiredX, y: desiredY },
      this.playerRadius,
    );

    // Compute actual velocity
    const actualVx = (resolved.x - player.x) / input.dt;
    const actualVy = (resolved.y - player.y) / input.dt;

    // Update heading if moving
    let heading = player.heading;
    if (inputMagnitude > 0.01) {
      heading = Math.atan2(dirY, dirX);
    }

    player.x = resolved.x;
    player.y = resolved.y;
    player.vx = actualVx;
    player.vy = actualVy;
    player.heading = heading;
    player.lastProcessedSeq = input.seq;
    player.updatedAt = serverTime;

    return { accepted: true, state: player };
  }

  stepTick(serverTime = Date.now()): ServerTickSnapshot {
    this.tickCount++;

    for (const player of this.players.values()) {
      // If no input arrived in the last 150ms, dampen velocity to 0
      if (serverTime - player.updatedAt > 150) {
        player.vx = 0;
        player.vy = 0;
      }
    }

    const snapshots = Array.from(this.players.values()).map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      heading: p.heading,
      lastSeq: p.lastProcessedSeq,
    }));

    return {
      tick: this.tickCount,
      timestamp: serverTime,
      players: snapshots,
    };
  }
}
