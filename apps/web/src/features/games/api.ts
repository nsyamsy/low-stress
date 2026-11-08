import { apiFetch, parseResponse } from "../../lib/apiFetch";
import type { AdminGameItem, GameItem } from "./types";

export { parseResponse };

export async function fetchGamesApi(): Promise<{ items: GameItem[] }> {
  return apiFetch<{ items: GameItem[] }>("/api/games", {
    method: "GET",
  });
}

export async function fetchAdminGamesApi(): Promise<{ items: AdminGameItem[] }> {
  return apiFetch<{ items: AdminGameItem[] }>("/api/admin/games", {
    method: "GET",
  });
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
  return apiFetch<AdminGameItem>(`/api/admin/games/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
