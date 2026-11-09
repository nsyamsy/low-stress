import { eq } from "drizzle-orm";
import type { Database } from "@low-stress/db";
import { bannedWords, settings } from "@low-stress/db";
import type { AdminSettings as AdminSettingsData } from "@low-stress/sdk";
import { AppError } from "../../errors";
import type { Env } from "../../env";
import { smtpConfigured } from "../../env";
import { recordAuditLog } from "./audit";

export type { AdminSettingsData };

export async function getAdminSettings(
  db: Database,
  env: Env,
): Promise<AdminSettingsData> {
  const rows = await db.select().from(settings);
  const map = new Map<string, unknown>();
  for (const r of rows) {
    map.set(r.key, r.value);
  }

  const registration =
    (map.get("registration") as "approval" | "open" | "closed") ?? "approval";
  const defaultLocale =
    (map.get("defaultLocale") as "auto" | "id" | "en") ?? "auto";
  const globalSchedule = (map.get("globalSchedule") as AdminSettingsData["globalSchedule"]) ?? {
    enabled: false,
    windows: [{ start: "12:00", end: "13:00" }],
    days: [1, 2, 3, 4, 5],
  };
  const chatEnabled =
    typeof map.get("chatEnabled") === "boolean"
      ? (map.get("chatEnabled") as boolean)
      : true;
  const ludoMaxPlayers =
    typeof map.get("ludoMaxPlayers") === "number"
      ? (map.get("ludoMaxPlayers") as number)
      : 12;

  const isSmtp = smtpConfigured(env);

  return {
    registration,
    defaultLocale,
    globalSchedule,
    chatEnabled,
    ludoMaxPlayers,
    smtp: {
      configured: isSmtp,
      enabled: isSmtp,
    },
  };
}

export async function updateAdminSettings(
  db: Database,
  adminId: string,
  env: Env,
  patch: Partial<Omit<AdminSettingsData, "smtp">>,
): Promise<AdminSettingsData> {
  const now = new Date();

  for (const [key, val] of Object.entries(patch)) {
    if (val === undefined) continue;

    await db
      .insert(settings)
      .values({
        key,
        value: val as Record<string, unknown>,
        updatedAt: now,
        updatedBy: adminId,
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: val as Record<string, unknown>,
          updatedAt: now,
          updatedBy: adminId,
        },
      });

    if (key === "registration") {
      await db
        .insert(settings)
        .values({
          key: "registration_mode",
          value: val as Record<string, unknown>,
          updatedAt: now,
          updatedBy: adminId,
        })
        .onConflictDoUpdate({
          target: settings.key,
          set: {
            value: val as Record<string, unknown>,
            updatedAt: now,
            updatedBy: adminId,
          },
        });
    }

    await recordAuditLog(db, {
      adminId,
      action: "settings.update",
      targetType: "setting",
      targetId: key,
      detail: { key, value: val },
    });
  }

  return getAdminSettings(db, env);
}

export async function listBannedWords(db: Database) {
  return db
    .select()
    .from(bannedWords)
    .orderBy(bannedWords.word);
}

export async function createBannedWord(
  db: Database,
  adminId: string,
  word: string,
  lang: "id" | "en" | "any" = "any",
) {
  const [row] = await db
    .insert(bannedWords)
    .values({
      word: word.toLowerCase().trim(),
      lang,
      source: "admin",
      enabled: true,
    })
    .returning();

  await recordAuditLog(db, {
    adminId,
    action: "banned_word_add",
    targetType: "banned_word",
    targetId: row!.id,
    detail: { word: row!.word, lang: row!.lang },
  });

  return row!;
}

export async function updateBannedWord(
  db: Database,
  adminId: string,
  id: string,
  enabled: boolean,
) {
  const [row] = await db
    .update(bannedWords)
    .set({ enabled })
    .where(eq(bannedWords.id, id))
    .returning();

  if (!row) {
    throw new AppError("NOT_FOUND", 404, { id });
  }

  await recordAuditLog(db, {
    adminId,
    action: "banned_word_update",
    targetType: "banned_word",
    targetId: id,
    detail: { word: row.word, enabled },
  });

  return row;
}

export async function deleteBannedWord(
  db: Database,
  adminId: string,
  id: string,
) {
  const [row] = await db
    .delete(bannedWords)
    .where(eq(bannedWords.id, id))
    .returning();

  if (!row) {
    throw new AppError("NOT_FOUND", 404, { id });
  }

  await recordAuditLog(db, {
    adminId,
    action: "banned_word_delete",
    targetType: "banned_word",
    targetId: id,
    detail: { word: row.word },
  });

  return { ok: true };
}
