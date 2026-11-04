import { getCsrfToken, type ApiError } from "../auth/api";
import type {
  AdminDashboardData,
  AdminMe,
  AdminSettings,
  AdminUserItem,
  AuditLogItem,
} from "./types";

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let error: ApiError = { code: "INTERNAL" };
    try {
      const body = (await res.json()) as { error?: ApiError };
      if (body.error) {
        error = body.error;
      }
    } catch {
      // bukan JSON
    }
    const err = new Error(error.code);
    (err as Error & { apiError: ApiError; status: number }).apiError = error;
    (err as Error & { apiError: ApiError; status: number }).status = res.status;
    throw err;
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  return res.json() as Promise<T>;
}

export async function adminLoginApi(
  username: string,
  password: string,
): Promise<{ admin: AdminMe }> {
  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return parseResponse<{ admin: AdminMe }>(res);
}

export async function adminLogoutApi(): Promise<void> {
  const csrf = await getCsrfToken();
  const res = await fetch("/api/admin/logout", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
  });
  return parseResponse<void>(res);
}

export async function getAdminMeApi(): Promise<{ admin: AdminMe }> {
  const res = await fetch("/api/admin/me");
  return parseResponse<{ admin: AdminMe }>(res);
}

export async function getAdminDashboardApi(): Promise<AdminDashboardData> {
  const res = await fetch("/api/admin/dashboard");
  return parseResponse<AdminDashboardData>(res);
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

  const res = await fetch(`/api/admin/users?${params.toString()}`);
  return parseResponse<{ items: AdminUserItem[]; page: number; pageSize: number; total: number }>(res);
}

export async function updateAdminUserStatusApi(
  userId: string,
  action: "approve" | "reject" | "suspend" | "ban" | "activate" | "reset-password",
): Promise<{ temporaryPassword?: string }> {
  const csrf = await getCsrfToken();
  const res = await fetch(`/api/admin/users/${userId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrf,
    },
    body: JSON.stringify({ action }),
  });
  return parseResponse<{ temporaryPassword?: string }>(res);
}

export async function bulkUpdateAdminUsersApi(
  ids: string[],
  action: "approve" | "reject",
): Promise<{ updatedCount: number }> {
  const csrf = await getCsrfToken();
  const res = await fetch("/api/admin/users/bulk", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrf,
    },
    body: JSON.stringify({ ids, action }),
  });
  return parseResponse<{ updatedCount: number }>(res);
}

export async function deleteAdminUserApi(userId: string): Promise<void> {
  const csrf = await getCsrfToken();
  const res = await fetch(`/api/admin/users/${userId}`, {
    method: "DELETE",
    headers: { "x-csrf-token": csrf },
  });
  return parseResponse<void>(res);
}

export async function getAdminSettingsApi(): Promise<AdminSettings> {
  const res = await fetch("/api/admin/settings");
  return parseResponse<AdminSettings>(res);
}

export async function updateAdminSettingsApi(
  patch: Partial<Omit<AdminSettings, "smtp">>,
): Promise<AdminSettings> {
  const csrf = await getCsrfToken();
  const res = await fetch("/api/admin/settings", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrf,
    },
    body: JSON.stringify(patch),
  });
  return parseResponse<AdminSettings>(res);
}

export async function sendAdminSmtpTestApi(to: string): Promise<void> {
  const csrf = await getCsrfToken();
  const res = await fetch("/api/admin/settings/smtp-test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrf,
    },
    body: JSON.stringify({ to }),
  });
  return parseResponse<void>(res);
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

  const res = await fetch(`/api/admin/audit?${params.toString()}`);
  return parseResponse<{ items: AuditLogItem[]; page: number; pageSize: number; total: number }>(res);
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
  const res = await fetch(`/api/admin/chat?page=${page}&limit=${limit}`);
  return parseResponse<{ items: AdminChatMessageItem[]; total: number; page: number; totalPages: number }>(res);
}

export async function deleteAdminChatMessageApi(id: string): Promise<void> {
  const csrf = await getCsrfToken();
  const res = await fetch(`/api/admin/chat/${id}`, {
    method: "DELETE",
    headers: { "x-csrf-token": csrf },
  });
  return parseResponse<void>(res);
}

export async function getAdminChatMutesApi(): Promise<AdminChatMuteItem[]> {
  const res = await fetch("/api/admin/chat/mutes");
  return parseResponse<AdminChatMuteItem[]>(res);
}

export async function muteUserApi(
  userId: string,
  minutes: number,
  reason?: string,
): Promise<{ ok: boolean; mutedUntil: string }> {
  const csrf = await getCsrfToken();
  const res = await fetch("/api/admin/chat/mute", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrf,
    },
    body: JSON.stringify({ userId, minutes, reason }),
  });
  return parseResponse<{ ok: boolean; mutedUntil: string }>(res);
}

export async function unmuteUserApi(userId: string): Promise<void> {
  const csrf = await getCsrfToken();
  const res = await fetch(`/api/admin/chat/mute/${userId}`, {
    method: "DELETE",
    headers: { "x-csrf-token": csrf },
  });
  return parseResponse<void>(res);
}

export async function getAdminBannedWordsApi(): Promise<AdminBannedWordItem[]> {
  const res = await fetch("/api/admin/banned-words");
  return parseResponse<AdminBannedWordItem[]>(res);
}

export async function createAdminBannedWordApi(
  word: string,
  lang: "id" | "en" | "any" = "any",
): Promise<AdminBannedWordItem> {
  const csrf = await getCsrfToken();
  const res = await fetch("/api/admin/banned-words", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrf,
    },
    body: JSON.stringify({ word, lang }),
  });
  return parseResponse<AdminBannedWordItem>(res);
}

export async function updateAdminBannedWordApi(
  id: string,
  enabled: boolean,
): Promise<AdminBannedWordItem> {
  const csrf = await getCsrfToken();
  const res = await fetch(`/api/admin/banned-words/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrf,
    },
    body: JSON.stringify({ enabled }),
  });
  return parseResponse<AdminBannedWordItem>(res);
}

export async function deleteAdminBannedWordApi(id: string): Promise<void> {
  const csrf = await getCsrfToken();
  const res = await fetch(`/api/admin/banned-words/${id}`, {
    method: "DELETE",
    headers: { "x-csrf-token": csrf },
  });
  return parseResponse<void>(res);
}

// Moderasi Skor & Leaderboard (P8-05)
export interface AdminGameRunItem {
  id: string;
  gameId: string;
  userId: string;
  username: string;
  displayName: string;
  score: number;
  durationMs: number;
  flagged: boolean;
  playedAt: string;
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

  const res = await fetch(`/api/admin/runs?${params.toString()}`);
  return parseResponse<{ items: AdminGameRunItem[]; total: number; page: number; pageSize: number }>(res);
}

export async function deleteAdminRunApi(id: string): Promise<void> {
  const csrf = await getCsrfToken();
  const res = await fetch(`/api/admin/runs/${id}`, {
    method: "DELETE",
    headers: { "x-csrf-token": csrf },
  });
  return parseResponse<void>(res);
}

export async function resetAdminLeaderboardApi(
  gameId: string,
  period: "week" | "month",
): Promise<{ ok: boolean; deletedCount: number }> {
  const csrf = await getCsrfToken();
  const res = await fetch(`/api/admin/leaderboard/${gameId}/reset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrf,
    },
    body: JSON.stringify({ period }),
  });
  return parseResponse<{ ok: boolean; deletedCount: number }>(res);
}

