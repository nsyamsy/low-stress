import type { LastEvent, LudoState, PawnCharacter } from "../../shared/engine";

export interface PlayerView {
  userId: string;
  name: string;
  status: "invited" | "accepted" | "declined" | "observer";
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
  status: "lobby" | "playing" | "finished";
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
