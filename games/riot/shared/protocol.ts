import type { HologramMarker } from "./actions";
import type { CompactSnapshotPayload } from "./interest";
import type { RiotHostOptions } from "./lobby";
import type {
  MeetingChatMessage,
  MeetingTrigger,
  VotingResolutionResult,
} from "./meetings";
import type {
  GamePhase,
  PlayerRole,
  PlayerStatus,
  WinReason,
  WinWinner,
} from "./rules";
import type { PlayerScoreBreakdown } from "./scoring";
import type { SabotageKind } from "./sabotage";

/**
 * Tipe protokol wire antara server Riot dan klien (RT-42 dst.).
 * HANYA tipe — tanpa logika — agar klien tidak pernah mengimpor modul server.
 */

export interface RiotPublicPlayerView {
  id: string;
  displayName: string;
  status: PlayerStatus;
  connected: boolean;
  hasVoted: boolean;
  /** Kustomisasi karakter publik (RT-41/RT-42). */
  character?: unknown;
}

export interface RiotClientRoomView {
  roomId: string;
  /** ID pemain yang menerima view ini (identitas dari sesi, RT-41). */
  viewerId: string;
  phase: GamePhase;
  hostId: string;
  options: RiotHostOptions;
  myRole: PlayerRole;
  myStatus: PlayerStatus;
  players: RiotPublicPlayerView[];
  hologramMarkers: HologramMarker[];
  tasksTotal: number;
  tasksCompleted: number;
  /** ID tugas yang ditugaskan ke pemain ini (kosong untuk penyusup). */
  myTasks: string[];
  /** ID tugas yang sudah diselesaikan pemain ini. */
  myCompletedTasks: string[];
  activeSabotage: {
    kind: SabotageKind;
    targetRoom?: string;
    startedAt: number;
    durationMs: number;
  } | null;
  chatMessages: MeetingChatMessage[];
  meetingReason: MeetingTrigger | null;
  votingResult: VotingResolutionResult | null;
  winner?: WinWinner | null;
  winReason?: WinReason | null;
  /** Peran pemain yang dikeluarkan (hanya setelah eliminasi, RT-30). */
  ejectedRole?: PlayerRole | null;
  scores?: Record<string, PlayerScoreBreakdown>;
}

export type { CompactSnapshotPayload };
