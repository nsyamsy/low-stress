import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "@low-stress/db";
import { games, gameScores, settings } from "@low-stress/db";
import { recordAuditLog } from "../admin/service";
import { AppError } from "../errors";
import type { LoadedGame } from "../registry/games";
import {
  DEFAULT_SCHEDULE,
  getNextOpeningTime,
  isScheduleOpen,
  parseSchedule,
  type GamesSchedule,
} from "./schedule";
import type { UpdateGameInput } from "./validation";

export interface PlayerGameItem {
  id: string;
  title: { id: string; en: string };
  description: { id: string; en: string };
  mode: "solo" | "multiplayer";
  status: "active" | "maintenance";
  open: boolean;
  opensAt: string | null;
  windows: Array<{ start: string; end: string }>;
  days: number[];
  maintenanceMessage: { id: string | null; en: string | null } | null;
  badge: string | null;
  mobile: {
    supported: boolean;
    orientation?: "portrait" | "landscape" | "any";
  };
  mine: { best: number; plays: number } | null;
}

export interface AdminGameItem {
  id: string;
  status: "active" | "maintenance" | "inactive";
  maintenanceMessage: { id: string; en: string } | null;
  schedule: GamesSchedule | null;
  sortOrder: number;
  badge: string | null;
  updatedAt: Date;
  manifest: {
    title: { id: string; en: string };
    description: { id: string; en: string };
    mode: "solo" | "multiplayer";
    mobile: {
      supported: boolean;
      orientation?: "portrait" | "landscape" | "any";
    };
    version: string;
  } | null;
}

export async function getGlobalSchedule(db: Database): Promise<GamesSchedule> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "globalSchedule"))
    .limit(1);

  if (!row?.value) {
    return DEFAULT_SCHEDULE;
  }

  return parseSchedule(row.value) ?? DEFAULT_SCHEDULE;
}

export function getEffectiveSchedule(
  gameSchedule: unknown,
  globalSchedule: GamesSchedule,
): GamesSchedule {
  if (gameSchedule !== null && gameSchedule !== undefined) {
    const parsed = parseSchedule(gameSchedule);
    if (parsed) return parsed;
  }
  return globalSchedule;
}

/**
 * Mengambil semua game untuk panel admin (termasuk inactive).
 */
export async function listAdminGames(
  db: Database,
  loadedGames: readonly LoadedGame[] = [],
): Promise<{ items: AdminGameItem[] }> {
  const manifestMap = new Map<string, LoadedGame["manifest"]>();
  for (const g of loadedGames) {
    manifestMap.set(g.manifest.id, g.manifest);
  }

  const rows = await db
    .select()
    .from(games)
    .orderBy(asc(games.sortOrder), asc(games.id));

  const items: AdminGameItem[] = rows.map((r) => {
    const m = manifestMap.get(r.id);
    return {
      id: r.id,
      status: r.status,
      maintenanceMessage: (r.maintenanceMessage as { id: string; en: string } | null) ?? null,
      schedule: parseSchedule(r.schedule),
      sortOrder: r.sortOrder,
      badge: r.badge,
      updatedAt: r.updatedAt,
      manifest: m
        ? {
            title: m.title,
            description: m.description,
            mode: m.mode,
            mobile: m.mobile,
            version: m.version,
          }
        : null,
    };
  });

  return { items };
}

/**
 * Update pengaturan game oleh admin.
 */
export async function updateAdminGame(
  db: Database,
  adminId: string,
  gameId: string,
  input: UpdateGameInput,
): Promise<AdminGameItem> {
  const [existing] = await db
    .select()
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);

  if (!existing) {
    throw new AppError("NOT_FOUND", 404, { gameId });
  }

  const updateData: Partial<typeof games.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.status !== undefined) {
    updateData.status = input.status;
  }
  if (input.maintenanceMessage !== undefined) {
    updateData.maintenanceMessage = input.maintenanceMessage as { id: string; en: string } | null;
  }
  if (input.schedule !== undefined) {
    updateData.schedule = input.schedule ? parseSchedule(input.schedule) : null;
  }
  if (input.sortOrder !== undefined) {
    updateData.sortOrder = input.sortOrder;
  }
  if (input.badge !== undefined) {
    updateData.badge = input.badge;
  }

  const [updated] = await db
    .update(games)
    .set(updateData)
    .where(eq(games.id, gameId))
    .returning();

  if (!updated) {
    throw new AppError("NOT_FOUND", 404, { gameId });
  }

  await recordAuditLog(db, {
    adminId,
    action: "game.update",
    targetType: "game",
    targetId: gameId,
    detail: input as Record<string, unknown>,
  });

  return {
    id: updated.id,
    status: updated.status,
    maintenanceMessage: (updated.maintenanceMessage as { id: string; en: string } | null) ?? null,
    schedule: parseSchedule(updated.schedule),
    sortOrder: updated.sortOrder,
    badge: updated.badge,
    updatedAt: updated.updatedAt,
    manifest: null,
  };
}

/**
 * Mengambil daftar game untuk pemain.
 * HANYA game dengan status 'active' dan 'maintenance' yang dikembalikan.
 * Game 'inactive' disembunyikan sama sekali dari pemain.
 */
export async function listPlayerGames(
  db: Database,
  loadedGames: readonly LoadedGame[] = [],
  userId?: string,
  now: Date = new Date(),
): Promise<{ items: PlayerGameItem[] }> {
  const globalSchedule = await getGlobalSchedule(db);

  const manifestMap = new Map<string, LoadedGame["manifest"]>();
  for (const g of loadedGames) {
    manifestMap.set(g.manifest.id, g.manifest);
  }

  const rows = await db
    .select()
    .from(games)
    .where(inArray(games.status, ["active", "maintenance"]))
    .orderBy(asc(games.sortOrder), asc(games.id));

  // Ambil rekor skor pengguna bila terautentikasi
  const mineMap = new Map<string, { best: number; plays: number }>();
  if (userId && rows.length > 0) {
    const scoreRows = await db
      .select()
      .from(gameScores)
      .where(
        and(
          eq(gameScores.userId, userId),
          inArray(
            gameScores.gameId,
            rows.map((r) => r.id),
          ),
        ),
      );
    for (const s of scoreRows) {
      mineMap.set(s.gameId, { best: s.bestScore, plays: s.plays });
    }
  }

  const items: PlayerGameItem[] = rows.map((r) => {
    const manifest = manifestMap.get(r.id);
    const effectiveSchedule = getEffectiveSchedule(r.schedule, globalSchedule);
    const scheduleIsOpen = isScheduleOpen(effectiveSchedule, now);
    const isOpen = r.status === "active" && scheduleIsOpen;
    const opensAt = isOpen
      ? null
      : r.status === "active"
        ? getNextOpeningTime(effectiveSchedule, now)?.toISOString() ?? null
        : null;

    return {
      id: r.id,
      title: manifest?.title ?? { id: r.id, en: r.id },
      description: manifest?.description ?? { id: "", en: "" },
      mode: manifest?.mode ?? "solo",
      status: r.status as "active" | "maintenance",
      open: isOpen,
      opensAt,
      windows: effectiveSchedule.windows,
      days: effectiveSchedule.days,
      maintenanceMessage: (r.maintenanceMessage as { id: string; en: string } | null) ?? null,
      badge: r.badge,
      mobile: manifest?.mobile ?? { supported: true },
      mine: mineMap.get(r.id) ?? null,
    };
  });

  return { items };
}

/**
 * Validasi gerbang game untuk pemanggilan API game `/api/games/:id/*`.
 */
export async function checkGameGate(
  db: Database,
  gameId: string,
  now: Date = new Date(),
) {
  const [game] = await db
    .select()
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);

  if (!game || game.status === "inactive") {
    throw new AppError("NOT_FOUND", 404, { gameId });
  }

  if (game.status === "maintenance") {
    throw new AppError("GAME_MAINTENANCE", 403, {
      gameId,
      message: game.maintenanceMessage ?? null,
    });
  }

  const globalSchedule = await getGlobalSchedule(db);
  const effectiveSchedule = getEffectiveSchedule(game.schedule, globalSchedule);

  if (!isScheduleOpen(effectiveSchedule, now)) {
    const opensAt = getNextOpeningTime(effectiveSchedule, now)?.toISOString() ?? null;
    throw new AppError("GAME_CLOSED", 403, {
      gameId,
      windows: effectiveSchedule.windows,
      days: effectiveSchedule.days,
      opensAt,
    });
  }

  return {
    game,
    schedule: effectiveSchedule,
  };
}
