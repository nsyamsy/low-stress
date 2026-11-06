import type { LastEvent, LudoState, PawnCharacter } from "../shared/engine";

export type RoomStatus = "lobby" | "playing" | "finished";
export type PlayerStatus = "invited" | "accepted" | "declined" | "observer";

export interface RoomSummary {
  id: string;
  name: string;
  status: RoomStatus;
  hostId: string;
  hostName: string;
  players: number;
  maxPlayers: number;
  myStatus: PlayerStatus | null;
  updatedAt: string;
}

export interface PlayerView {
  userId: string;
  name: string;
  status: PlayerStatus;
  isHost: boolean;
  isMe: boolean;
  seat: number | null;
  pawn: PawnCharacter;
  color: number | null;
  autopilot: boolean;
}

export interface ChatMessage {
  id: number;
  roomId: string;
  userId: string | null;
  name: string;
  text: string;
  at: string;
}

export interface RoomView {
  id: string;
  name: string;
  status: RoomStatus;
  hostId: string;
  maxPlayers: number;
  pawns: number;
  version: number;
  updatedAt: string;
  playSeconds: number | null;
  players: PlayerView[];
  messages: ChatMessage[];
  state: LudoState | null;
  isHost: boolean;
  isAdmin: boolean;
  mySeat: number | null;
  movable: number[];
  invitable: { id: string; username: string; displayName: string }[];
  event: LastEvent | null;
}

export type LudoAction =
  | { action: "invite"; userIds: string[] }
  | { action: "respond"; accept: boolean }
  | { action: "kick"; userId: string }
  | {
      action: "start";
      pawns?: number;
      exit?: "double" | "sixes" | "six";
      goal?: number;
    }
  | { action: "roll" }
  | { action: "move"; pawn: number }
  | { action: "skip" }
  | { action: "pawn"; pawn: string }
  | { action: "participate"; play: boolean }
  | { action: "chat"; text: string }
  | { action: "autopilot"; on: boolean; userId?: string }
  | { action: "reset" };

export interface LudoActor {
  userId: string;
  username: string;
  displayName: string;
  isAdmin?: boolean;
}
