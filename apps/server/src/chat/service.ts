import { and, desc, eq, gt, lt, sql } from "drizzle-orm";
import type { Database } from "@low-stress/db";
import { chatMessages, chatMutes, settings, users } from "@low-stress/db";
import { censorServerText } from "./profanity-service";

export interface ChatMessageDto {
  id: string;
  userId: string | null;
  name: string;
  body: string;
  createdAt: string;
}

export interface ChatMuteInfo {
  isMuted: boolean;
  until?: Date;
  reason?: string | null;
}

/**
 * Cek apakah fitur chat publik sedang aktif di pengaturan global.
 */
export async function isChatEnabled(db: Database): Promise<boolean> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "chatEnabled"));

  if (row && typeof row.value === "boolean") {
    return row.value;
  }
  return true;
}

/**
 * Cek apakah pemain tertentu sedang dibisukan (chat_mutes).
 */
export async function getUserMute(
  db: Database,
  userId: string,
): Promise<ChatMuteInfo> {
  const now = new Date();
  const [mute] = await db
    .select()
    .from(chatMutes)
    .where(and(eq(chatMutes.userId, userId), gt(chatMutes.mutedUntil, now)));

  if (!mute) {
    return { isMuted: false };
  }

  return {
    isMuted: true,
    until: mute.mutedUntil,
    reason: mute.reason,
  };
}

/**
 * Ambil riwayat chat publik (50 pesan terakhir secara default, diurutkan naik waktu).
 */
export async function getChatHistory(
  db: Database,
  limit = 50,
): Promise<ChatMessageDto[]> {
  const rows = await db
    .select({
      id: chatMessages.id,
      userId: chatMessages.userId,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
      displayName: users.displayName,
    })
    .from(chatMessages)
    .leftJoin(users, eq(chatMessages.userId, users.id))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);

  // Balikkan urutan agar kronologis naik waktu (oldest to newest)
  rows.reverse();

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    name: r.userId && r.displayName ? censorServerText(r.displayName) : "Pengguna dihapus",
    body: censorServerText(r.body),
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Simpan pesan chat baru setelah menyensor body di server.
 */
export async function saveChatMessage(
  db: Database,
  userId: string,
  rawBody: string,
): Promise<ChatMessageDto> {
  const trimmed = rawBody.trim();
  const censoredBody = censorServerText(trimmed);

  const [message] = await db
    .insert(chatMessages)
    .values({
      userId,
      body: censoredBody,
    })
    .returning();

  const [user] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId));

  return {
    id: message!.id,
    userId: message!.userId,
    name: user ? censorServerText(user.displayName) : "Pemain",
    body: message!.body,
    createdAt: message!.createdAt.toISOString(),
  };
}

/**
 * Hapus pesan-pesan chat yang lebih lama dari maxAgeDays (bawaan 7 hari).
 */
export async function purgeOldChatMessages(
  db: Database,
  maxAgeDays = 7,
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(chatMessages)
    .where(lt(chatMessages.createdAt, cutoff))
    .returning({ id: chatMessages.id });

  return result.length;
}

/**
 * Hapus pesan chat tunggal oleh admin.
 */
export async function deleteChatMessage(
  db: Database,
  messageId: string,
): Promise<boolean> {
  const result = await db
    .delete(chatMessages)
    .where(eq(chatMessages.id, messageId))
    .returning({ id: chatMessages.id });

  return result.length > 0;
}

/**
 * Bisukan (mute) pengguna selama durasi tertentu (menit).
 */
export async function muteUser(
  db: Database,
  userId: string,
  minutes: number,
  reason?: string,
  adminId?: string,
): Promise<Date> {
  const mutedUntil = new Date(Date.now() + minutes * 60 * 1000);

  await db
    .insert(chatMutes)
    .values({
      userId,
      mutedUntil,
      reason: reason ?? null,
      adminId: adminId ?? null,
    })
    .onConflictDoUpdate({
      target: chatMutes.userId,
      set: {
        mutedUntil,
        reason: reason ?? null,
        adminId: adminId ?? null,
      },
    });

  return mutedUntil;
}

/**
 * Cabut status bisu pengguna.
 */
export async function unmuteUser(
  db: Database,
  userId: string,
): Promise<boolean> {
  const result = await db
    .delete(chatMutes)
    .where(eq(chatMutes.userId, userId))
    .returning({ userId: chatMutes.userId });

  return result.length > 0;
}

/**
 * Ambil daftar bisu aktif untuk admin.
 */
export async function getActiveMutes(db: Database) {
  const now = new Date();
  return db
    .select({
      userId: chatMutes.userId,
      mutedUntil: chatMutes.mutedUntil,
      reason: chatMutes.reason,
      username: users.username,
      displayName: users.displayName,
    })
    .from(chatMutes)
    .innerJoin(users, eq(chatMutes.userId, users.id))
    .where(gt(chatMutes.mutedUntil, now))
    .orderBy(desc(chatMutes.mutedUntil));
}

/**
 * Ambil aliran pesan chat untuk admin panel (dengan pagination).
 */
export async function getAdminChatMessages(
  db: Database,
  page = 1,
  limit = 50,
) {
  const offset = (page - 1) * limit;

  const rows = await db
    .select({
      id: chatMessages.id,
      userId: chatMessages.userId,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
      username: users.username,
      displayName: users.displayName,
    })
    .from(chatMessages)
    .leftJoin(users, eq(chatMessages.userId, users.id))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chatMessages);
  const count = countResult?.count ?? 0;

  return {
    items: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      username: r.username ?? "deleted",
      name: r.displayName ? censorServerText(r.displayName) : "Pengguna dihapus",
      body: r.body,
      createdAt: r.createdAt.toISOString(),
    })),
    total: count,
    page,
    totalPages: Math.ceil(count / limit),
  };
}
