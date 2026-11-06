import { resolveMovement } from "../shared/collision";
import {
  MAX_PLAYER_SPEED,
  PLAYER_RADIUS,
  type CompactPlayerSnapshot,
  type PlayerInput,
} from "../shared/types";

export interface PendingInput {
  input: PlayerInput;
  predictedX: number;
  predictedY: number;
}

export class ClientPredictionManager {
  private currentX: number;
  private currentY: number;
  private heading: number;
  private nextSeq = 1;
  private pendingInputs: PendingInput[] = [];

  constructor(initialX = 0, initialY = 0) {
    this.currentX = initialX;
    this.currentY = initialY;
    this.heading = 0;
  }

  getPosition(): { x: number; y: number; heading: number } {
    return { x: this.currentX, y: this.currentY, heading: this.heading };
  }

  getPendingQueueLength(): number {
    return this.pendingInputs.length;
  }

  /**
   * Generates input, applies immediate local prediction with wall collision,
   * and enqueues input for server transmission.
   */
  applyInput(dx: number, dy: number, dt: number): PlayerInput {
    const seq = this.nextSeq++;
    const input: PlayerInput = { seq, dx, dy, dt };

    const magnitude = Math.hypot(dx, dy);
    if (magnitude > 0.001) {
      const dirX = dx / magnitude;
      const dirY = dy / magnitude;
      const speed = Math.min(magnitude * MAX_PLAYER_SPEED, MAX_PLAYER_SPEED);
      const disp = speed * dt;

      const desiredX = this.currentX + dirX * disp;
      const desiredY = this.currentY + dirY * disp;

      const resolved = resolveMovement(
        { x: this.currentX, y: this.currentY },
        { x: desiredX, y: desiredY },
        PLAYER_RADIUS,
      );

      this.currentX = resolved.x;
      this.currentY = resolved.y;
      this.heading = Math.atan2(dirY, dirX);
    }

    this.pendingInputs.push({
      input,
      predictedX: this.currentX,
      predictedY: this.currentY,
    });

    return input;
  }

  /**
   * Reconciles authoritative server state, discarding acked inputs and replaying pending inputs.
   */
  reconcile(serverSnapshot: CompactPlayerSnapshot): void {
    // Drop all acknowledged inputs
    this.pendingInputs = this.pendingInputs.filter(
      (item) => item.input.seq > serverSnapshot.lastSeq,
    );

    // Reset base position to authoritative server state
    let reconX = serverSnapshot.x;
    let reconY = serverSnapshot.y;
    let reconHeading = serverSnapshot.heading;

    // Replay remaining unacknowledged inputs
    for (const pending of this.pendingInputs) {
      const { input } = pending;
      const magnitude = Math.hypot(input.dx, input.dy);
      if (magnitude > 0.001) {
        const dirX = input.dx / magnitude;
        const dirY = input.dy / magnitude;
        const speed = Math.min(magnitude * MAX_PLAYER_SPEED, MAX_PLAYER_SPEED);
        const disp = speed * input.dt;

        const desiredX = reconX + dirX * disp;
        const desiredY = reconY + dirY * disp;

        const resolved = resolveMovement(
          { x: reconX, y: reconY },
          { x: desiredX, y: desiredY },
          PLAYER_RADIUS,
        );

        reconX = resolved.x;
        reconY = resolved.y;
        reconHeading = Math.atan2(dirY, dirX);
      }
    }

    this.currentX = reconX;
    this.currentY = reconY;
    this.heading = reconHeading;
  }
}

export interface SnapshotRecord {
  x: number;
  y: number;
  heading: number;
  timestamp: number;
}

export class RemoteInterpolationManager {
  private playerBuffers = new Map<string, SnapshotRecord[]>();
  private readonly maxBufferSize = 10;

  addSnapshot(playerId: string, snapshot: CompactPlayerSnapshot, timestamp: number): void {
    let buffer = this.playerBuffers.get(playerId);
    if (!buffer) {
      buffer = [];
      this.playerBuffers.set(playerId, buffer);
    }

    buffer.push({
      x: snapshot.x,
      y: snapshot.y,
      heading: snapshot.heading,
      timestamp,
    });

    if (buffer.length > this.maxBufferSize) {
      buffer.shift();
    }
  }

  removePlayer(playerId: string): void {
    this.playerBuffers.delete(playerId);
  }

  /**
   * Interpolate remote player position at a given render timestamp (typically now - interpolationDelay).
   */
  getInterpolatedPosition(
    playerId: string,
    renderTime: number,
  ): { x: number; y: number; heading: number } | null {
    const buffer = this.playerBuffers.get(playerId);
    if (!buffer || buffer.length === 0) {
      return null;
    }

    // Only 1 record, return it
    if (buffer.length === 1) {
      const single = buffer[0]!;
      return { x: single.x, y: single.y, heading: single.heading };
    }

    // If renderTime is older than first record, clamp to first
    const first = buffer[0]!;
    if (renderTime <= first.timestamp) {
      return { x: first.x, y: first.y, heading: first.heading };
    }

    // If renderTime is newer than latest record, clamp to latest
    const latest = buffer[buffer.length - 1]!;
    if (renderTime >= latest.timestamp) {
      return { x: latest.x, y: latest.y, heading: latest.heading };
    }

    // Find bounding pair
    for (let i = 0; i < buffer.length - 1; i++) {
      const p0 = buffer[i]!;
      const p1 = buffer[i + 1]!;
      if (renderTime >= p0.timestamp && renderTime <= p1.timestamp) {
        const timeDiff = p1.timestamp - p0.timestamp;
        const t = timeDiff > 0 ? (renderTime - p0.timestamp) / timeDiff : 0;

        const lerpX = p0.x + (p1.x - p0.x) * t;
        const lerpY = p0.y + (p1.y - p0.y) * t;

        // Angle lerp with wrap around
        let diffHeading = p1.heading - p0.heading;
        while (diffHeading > Math.PI) diffHeading -= 2 * Math.PI;
        while (diffHeading < -Math.PI) diffHeading += 2 * Math.PI;
        const lerpHeading = p0.heading + diffHeading * t;

        return { x: lerpX, y: lerpY, heading: lerpHeading };
      }
    }

    return { x: latest.x, y: latest.y, heading: latest.heading };
  }
}
