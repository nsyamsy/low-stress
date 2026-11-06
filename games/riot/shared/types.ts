export const SERVER_TICK_RATE = 15; // 15 Hz authoritative tick rate
export const SERVER_TICK_MS = 1000 / SERVER_TICK_RATE; // ~66.67ms
export const CLIENT_INPUT_RATE = 20; // 20 Hz client input sampling
export const CLIENT_INPUT_MS = 1000 / CLIENT_INPUT_RATE; // 50ms

export const PLAYER_RADIUS = 0.8; // player collision radius in meters
export const MAX_PLAYER_SPEED = 5.0; // max speed in meters/second
export const SPEED_TOLERANCE_FACTOR = 1.25; // 25% tolerance for network jitter
export const MAX_ALLOWED_SPEED = MAX_PLAYER_SPEED * SPEED_TOLERANCE_FACTOR; // 6.25 m/s

export const VISION_RADIUS = 12.0; // meters - interest management radius

export interface PlayerInput {
  seq: number;
  dx: number; // normalized horizontal direction (-1 to 1)
  dy: number; // normalized vertical direction (-1 to 1)
  dt: number; // delta time in seconds
}

export interface PlayerMovementState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number; // radians
  lastProcessedSeq: number;
  updatedAt: number;
}

export interface CompactPlayerSnapshot {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  lastSeq: number;
}

export interface ServerTickSnapshot {
  tick: number;
  timestamp: number;
  players: CompactPlayerSnapshot[];
}
