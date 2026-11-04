import { getCsrfToken, type ApiError } from "../auth/api";
import type { AdminGameItem, GameItem } from "./types";

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

export async function fetchGamesApi(): Promise<{ items: GameItem[] }> {
  const res = await fetch("/api/games", {
    method: "GET",
  });
  return parseResponse<{ items: GameItem[] }>(res);
}

export async function fetchAdminGamesApi(): Promise<{ items: AdminGameItem[] }> {
  const res = await fetch("/api/admin/games", {
    method: "GET",
  });
  return parseResponse<{ items: AdminGameItem[] }>(res);
}

export async function updateAdminGameApi(
  id: string,
  payload: {
    status?: "active" | "maintenance" | "inactive";
    maintenanceMessage?: { id: string | null; en: string | null } | null;
    schedule?: {
      enabled: boolean;
      windows: Array<{ start: string; end: string }>;
      days: number[];
    } | null;
    sortOrder?: number;
    badge?: string | null;
  },
): Promise<AdminGameItem> {
  const csrf = await getCsrfToken();
  const res = await fetch(`/api/admin/games/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrf,
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<AdminGameItem>(res);
}
