import { apiFetch, parseResponse } from "../../lib/apiFetch";
import type {
  AdminDashboardData,
  AdminMe,
  AdminSettings,
  AdminUserItem,
  AuditLogItem,
} from "./types";

export { parseResponse };

export async function adminLoginApi(
  username: string,
  password: string,
): Promise<{ admin: AdminMe }> {
  return apiFetch<{ admin: AdminMe }>("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function adminLogoutApi(): Promise<void> {
  return apiFetch<void>("/api/admin/logout", {
    method: "POST",
  });
}

export async function getAdminMeApi(): Promise<{ admin: AdminMe }> {
  return apiFetch<{ admin: AdminMe }>("/api/admin/me");
}

export async function getAdminDashboardApi(): Promise<AdminDashboardData> {
  return apiFetch<AdminDashboardData>("/api/admin/dashboard");
}

export async function getAdminUsersApi(query: {
  status?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: AdminUserItem[]; page: number; pageSize: number; total: number }> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.q) params.set("q", query.q);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));

  return apiFetch<{ items: AdminUserItem[]; page: number; pageSize: number; total: number }>(
    `/api/admin/users?${params.toString()}`,
  );
}

export async function updateAdminUserStatusApi(
  userId: string,
  action: "approve" | "reject" | "suspend" | "ban" | "activate" | "reset-password",
): Promise<{ temporaryPassword?: string }> {
  return apiFetch<{ temporaryPassword?: string }>(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ action }),
  });
}

export async function bulkUpdateAdminUsersApi(
  ids: string[],
  action: "approve" | "reject",
): Promise<{ updatedCount: number }> {
  return apiFetch<{ updatedCount: number }>("/api/admin/users/bulk", {
    method: "POST",
    body: JSON.stringify({ ids, action }),
  });
}

export async function deleteAdminUserApi(userId: string): Promise<void> {
  return apiFetch<void>(`/api/admin/users/${userId}`, {
    method: "DELETE",
  });
}

export async function getAdminSettingsApi(): Promise<AdminSettings> {
  return apiFetch<AdminSettings>("/api/admin/settings");
}

export async function updateAdminSettingsApi(
  patch: Partial<Omit<AdminSettings, "smtp">>,
): Promise<AdminSettings> {
  return apiFetch<AdminSettings>("/api/admin/settings", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function sendAdminSmtpTestApi(to: string): Promise<void> {
  return apiFetch<void>("/api/admin/settings/smtp-test", {
    method: "POST",
    body: JSON.stringify({ to }),
  });
}

export async function getAdminAuditLogsApi(query: {
  action?: string;
  adminId?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: AuditLogItem[]; page: number; pageSize: number; total: number }> {
  const params = new URLSearchParams();
  if (query.action) params.set("action", query.action);
  if (query.adminId) params.set("adminId", query.adminId);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));

  return apiFetch<{ items: AuditLogItem[]; page: number; pageSize: number; total: number }>(
    `/api/admin/audit?${params.toString()}`,
  );
}

// Moderasi Chat & Kata Terlarang (P8-04)
export interface AdminChatMessageItem {
  id: string;
  userId: string | null;
  username: string;
  name: string;
  body: string;
  createdAt: string;
}

export interface AdminChatMuteItem {
  userId: string;
  mutedUntil: string;
  reason: string | null;
  username: string;
  displayName: string;
}

export interface AdminBannedWordItem {
  id: string;
  word: string;
  lang: "id" | "en" | "any";
  source: "builtin" | "admin";
  enabled: boolean;
}

export async function getAdminChatMessagesApi(
  page = 1,
  limit = 50,
): Promise<{ items: AdminChatMessageItem[]; total: number; page: number; totalPages: number }> {
  return apiFetch<{ items: AdminChatMessageItem[]; total: number; page: number; totalPages: number }>(
    `/api/admin/chat?page=${page}&limit=${limit}`,
  );
}

export async function deleteAdminChatMessageApi(id: string): Promise<void> {
  return apiFetch<void>(`/api/admin/chat/${id}`, {
    method: "DELETE",
  });
}

export async function getAdminChatMutesApi(): Promise<AdminChatMuteItem[]> {
  return apiFetch<AdminChatMuteItem[]>("/api/admin/chat/mutes");
}

export async function muteUserApi(
  userId: string,
  minutes: number,
  reason?: string,
): Promise<{ ok: boolean; mutedUntil: string }> {
  return apiFetch<{ ok: boolean; mutedUntil: string }>("/api/admin/chat/mute", {
    method: "POST",
    body: JSON.stringify({ userId, minutes, reason }),
  });
}

export async function unmuteUserApi(userId: string): Promise<void> {
  return apiFetch<void>(`/api/admin/chat/mute/${userId}`, {
    method: "DELETE",
  });
}

export async function getAdminBannedWordsApi(): Promise<AdminBannedWordItem[]> {
  return apiFetch<AdminBannedWordItem[]>("/api/admin/banned-words");
}

export async function createAdminBannedWordApi(
  word: string,
  lang: "id" | "en" | "any" = "any",
): Promise<AdminBannedWordItem> {
  return apiFetch<AdminBannedWordItem>("/api/admin/banned-words", {
    method: "POST",
    body: JSON.stringify({ word, lang }),
  });
}

export async function updateAdminBannedWordApi(
  id: string,
  enabled: boolean,
): Promise<AdminBannedWordItem> {
  return apiFetch<AdminBannedWordItem>(`/api/admin/banned-words/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export async function deleteAdminBannedWordApi(id: string): Promise<void> {
  return apiFetch<void>(`/api/admin/banned-words/${id}`, {
    method: "DELETE",
  });
}

// Moderasi Skor & Leaderboard (P8-05)
export interface AdminGameRunItem {
  id: string;
  gameId: string;
  userId: string;
  username?: string;
  displayName?: string;
  user?: {
    id?: string;
    username?: string;
    displayName?: string;
  };
  score: number;
  durationMs: number;
  flagged: boolean;
  playedAt?: string;
  createdAt?: string;
}

export async function getAdminRunsApi(query: {
  gameId?: string;
  flagged?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<{ items: AdminGameRunItem[]; total: number; page: number; pageSize: number }> {
  const params = new URLSearchParams();
  if (query.gameId) params.set("gameId", query.gameId);
  if (query.flagged !== undefined) params.set("flagged", String(query.flagged));
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));

  return apiFetch<{ items: AdminGameRunItem[]; total: number; page: number; pageSize: number }>(
    `/api/admin/runs?${params.toString()}`,
  );
}

export async function deleteAdminRunApi(id: string): Promise<void> {
  return apiFetch<void>(`/api/admin/runs/${id}`, {
    method: "DELETE",
  });
}

export async function resetAdminLeaderboardApi(
  gameId: string,
  period: "week" | "month",
): Promise<{ ok: boolean; deletedCount: number }> {
  return apiFetch<{ ok: boolean; deletedCount: number }>(
    `/api/admin/leaderboard/${gameId}/reset`,
    {
      method: "POST",
      body: JSON.stringify({ period }),
    },
  );
}

// Moderasi Room Ludo (API_Spec §10)
export interface AdminLudoRoomItem {
  id: string;
  name: string;
  status: string;
  hostId: string;
  hostName: string;
  maxPlayers: number;
  pawns: unknown;
  playersCount: number;
  lastActivityAt: string;
  createdAt: string;
}

export interface AdminLudoRoomDetail {
  room: {
    id: string;
    name: string;
    status: string;
    hostId: string;
    hostName: string;
    maxPlayers: number;
    pawns: unknown;
    state: unknown;
    version: number;
    startedAt: string | null;
    finishedAt: string | null;
    lastActivityAt: string;
    createdAt: string;
  };
  players: Array<{
    userId: string;
    username: string;
    displayName: string;
    status: string;
    pawn: string | null;
    autopilot: boolean;
    joinedAt: string | null;
  }>;
  messages: Array<{
    id: number | string;
    userId: string | null;
    userName: string;
    body: string;
    createdAt: string;
  }>;
}

export async function getAdminLudoRoomsApi(
  status?: string,
): Promise<{ items: AdminLudoRoomItem[] }> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const qs = params.toString();
  return apiFetch<{ items: AdminLudoRoomItem[] }>(
    `/api/admin/ludo/rooms${qs ? `?${qs}` : ""}`,
  );
}

export async function getAdminLudoRoomDetailApi(
  roomId: string,
): Promise<AdminLudoRoomDetail> {
  return apiFetch<AdminLudoRoomDetail>(`/api/admin/ludo/rooms/${encodeURIComponent(roomId)}`);
}

export async function resetAdminLudoRoomApi(
  roomId: string,
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(
    `/api/admin/ludo/rooms/${encodeURIComponent(roomId)}/reset`,
    { method: "POST" },
  );
}

export async function kickAdminLudoPlayerApi(
  roomId: string,
  userId: string,
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(
    `/api/admin/ludo/rooms/${encodeURIComponent(roomId)}/kick`,
    {
      method: "POST",
      body: JSON.stringify({ userId }),
    },
  );
}

export async function deleteAdminLudoRoomApi(roomId: string): Promise<void> {
  return apiFetch<void>(`/api/admin/ludo/rooms/${encodeURIComponent(roomId)}`, {
    method: "DELETE",
  });
}

// Moderasi Room Riot (RT-51)
export interface AdminRiotRoomItem {
  id: string;
  name: string;
  status: string;
  hostId: string;
  hostName: string;
  options: unknown;
  playersCount: number;
  lastActivityAt: string;
  createdAt: string;
}

export interface AdminRiotRoomDetail {
  room: {
    id: string;
    name: string;
    status: string;
    hostId: string;
    hostName: string;
    options: unknown;
    lastActivityAt: string;
    createdAt: string;
  };
  players: Array<{
    userId: string;
    username: string;
    displayName: string;
    status: string;
    character: string | null;
    joinedAt: string | null;
  }>;
  matches: Array<{
    id: string;
    winner: string | null;
    startedAt: string | null;
    endedAt: string | null;
    players: unknown;
  }>;
}

export async function getAdminRiotRoomsApi(
  status?: string,
): Promise<{ items: AdminRiotRoomItem[] }> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const qs = params.toString();
  return apiFetch<{ items: AdminRiotRoomItem[] }>(
    `/api/admin/riot/rooms${qs ? `?${qs}` : ""}`,
  );
}

export async function getAdminRiotRoomDetailApi(
  roomId: string,
): Promise<AdminRiotRoomDetail> {
  return apiFetch<AdminRiotRoomDetail>(`/api/admin/riot/rooms/${encodeURIComponent(roomId)}`);
}

export async function resetAdminRiotRoomApi(
  roomId: string,
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(
    `/api/admin/riot/rooms/${encodeURIComponent(roomId)}/reset`,
    { method: "POST" },
  );
}

export async function kickAdminRiotPlayerApi(
  roomId: string,
  userId: string,
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(
    `/api/admin/riot/rooms/${encodeURIComponent(roomId)}/kick`,
    {
      method: "POST",
      body: JSON.stringify({ userId }),
    },
  );
}

export async function deleteAdminRiotRoomApi(roomId: string): Promise<void> {
  return apiFetch<void>(`/api/admin/riot/rooms/${encodeURIComponent(roomId)}`, {
    method: "DELETE",
  });
}
