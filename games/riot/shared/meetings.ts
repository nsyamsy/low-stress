import { censorProfanity } from "@low-stress/sdk";
import type { PlayerStatus } from "./rules";

export const MAX_CHAT_LENGTH = 300;
export const CHAT_RATE_LIMIT_MS = 1000;

export type MeetingTrigger = "emergency_button" | "hologram_reported";

export interface MeetingChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderStatus: PlayerStatus;
  body: string;
  createdAt: number;
}

export interface VotingResolutionResult {
  voteCounts: Record<string, number>;
  skipCount: number;
  ejectedId: string | null;
  isTie: boolean;
  skipped: boolean;
  totalVotes: number;
  abstainCount: number;
}

/**
 * Validates, truncates, censors, and rate-limits a meeting chat message on the server.
 */
export function processChatMessage(
  senderId: string,
  senderName: string,
  senderStatus: PlayerStatus,
  rawBody: string,
  lastSentAt: number,
  serverTime = Date.now(),
): { valid: boolean; message?: MeetingChatMessage; reason?: string } {
  // 1. Rate limit check
  if (serverTime - lastSentAt < CHAT_RATE_LIMIT_MS) {
    return { valid: false, reason: "RATE_LIMITED" };
  }

  // 2. Body sanitization & length check
  const trimmed = rawBody.trim();
  if (trimmed.length === 0) {
    return { valid: false, reason: "EMPTY_MESSAGE" };
  }
  if (trimmed.length > MAX_CHAT_LENGTH) {
    return { valid: false, reason: "MESSAGE_TOO_LONG" };
  }

  // 3. Server-authoritative profanity censoring via sdk.profanity
  const censored = censorProfanity(trimmed);

  const message: MeetingChatMessage = {
    id: `msg_${serverTime}_${Math.random().toString(36).slice(2, 6)}`,
    senderId,
    senderName,
    senderStatus,
    body: censored,
    createdAt: serverTime,
  };

  return { valid: true, message };
}

/**
 * Resolves votes cast during the voting phase.
 * Guarantees:
 * - Tied highest votes -> no one ejected (isTie: true, skipped: false).
 * - Highest vote is 'skip' -> no one ejected (isTie: false, skipped: true).
 * - Single player has strictly more votes than all others and more than skip -> ejected!
 */
export function resolveVotes(
  votes: ReadonlyMap<string, string | "skip">,
  alivePlayerIds: readonly string[],
): VotingResolutionResult {
  const voteCounts: Record<string, number> = {};
  let skipCount = 0;

  for (const target of votes.values()) {
    if (target === "skip") {
      skipCount++;
    } else {
      voteCounts[target] = (voteCounts[target] ?? 0) + 1;
    }
  }

  const totalVotes = votes.size;
  const abstainCount = Math.max(0, alivePlayerIds.length - totalVotes);

  // Determine candidate with highest votes
  let highestCount = 0;
  let topCandidates: string[] = [];

  for (const [targetId, count] of Object.entries(voteCounts)) {
    if (count > highestCount) {
      highestCount = count;
      topCandidates = [targetId];
    } else if (count === highestCount && count > 0) {
      topCandidates.push(targetId);
    }
  }

  // Check tie among players
  if (topCandidates.length > 1) {
    return {
      voteCounts,
      skipCount,
      ejectedId: null,
      isTie: true,
      skipped: false,
      totalVotes,
      abstainCount,
    };
  }

  // If top candidate has fewer or equal votes than skip -> no ejection
  if (highestCount <= skipCount) {
    return {
      voteCounts,
      skipCount,
      ejectedId: null,
      isTie: false,
      skipped: skipCount > 0,
      totalVotes,
      abstainCount,
    };
  }

  const singleWinner = topCandidates[0] ?? null;

  return {
    voteCounts,
    skipCount,
    ejectedId: singleWinner,
    isTie: false,
    skipped: false,
    totalVotes,
    abstainCount,
  };
}

/**
 * Filters chat messages according to player status.
 * CRITICAL RULE: Ghosts NEVER speak to alive players!
 */
export function filterMessagesForViewer(
  messages: readonly MeetingChatMessage[],
  viewerStatus: PlayerStatus,
): MeetingChatMessage[] {
  if (viewerStatus === "alive") {
    // Alive players only receive messages from alive players
    return messages.filter((m) => m.senderStatus === "alive");
  }
  // Ghost players receive all messages
  return [...messages];
}
