import { eq } from "drizzle-orm";
import type { Database } from "@low-stress/db";
import { bannedWords } from "@low-stress/db";
import {
  BUILTIN_BANNED_WORDS_EN,
  BUILTIN_BANNED_WORDS_ID,
  censorProfanity,
  containsProfanity,
} from "@low-stress/sdk";

// Cache in-memory untuk kata terlarang yang aktif
let cachedActiveWords: string[] = [];
let isCacheLoaded = false;

/**
 * Ambil status apakah cache kata terlarang sudah pernah dimuat.
 */
export function isBannedWordsCacheLoaded(): boolean {
  return isCacheLoaded;
}

/**
 * Mengisi database banned_words dengan daftar bawaan jika belum ada,
 * dan mengisi cache in-memory dengan seluruh kata yang enabled.
 */
export async function initBannedWords(db: Database): Promise<void> {
  // Ambil semua kata yang ada di database
  const existing = await db.select().from(bannedWords);
  const existingWords = new Set(existing.map((row) => row.word.toLowerCase()));

  const toInsert: Array<{
    word: string;
    lang: "id" | "en" | "any";
    source: "builtin" | "admin";
    enabled: boolean;
  }> = [];

  for (const word of BUILTIN_BANNED_WORDS_ID) {
    if (!existingWords.has(word.toLowerCase())) {
      toInsert.push({
        word,
        lang: "id",
        source: "builtin",
        enabled: true,
      });
      existingWords.add(word.toLowerCase());
    }
  }

  for (const word of BUILTIN_BANNED_WORDS_EN) {
    if (!existingWords.has(word.toLowerCase())) {
      toInsert.push({
        word,
        lang: "en",
        source: "builtin",
        enabled: true,
      });
      existingWords.add(word.toLowerCase());
    }
  }

  if (toInsert.length > 0) {
    await db.insert(bannedWords).values(toInsert);
  }

  await reloadBannedWordsCache(db);
}

/**
 * Muat ulang cache kata terlarang dari database (hanya yang enabled).
 */
export async function reloadBannedWordsCache(db: Database): Promise<string[]> {
  const rows = await db
    .select({ word: bannedWords.word })
    .from(bannedWords)
    .where(eq(bannedWords.enabled, true));

  cachedActiveWords = rows.map((r) => r.word);
  isCacheLoaded = true;
  return cachedActiveWords;
}

/**
 * Ambil daftar kata terlarang aktif saat ini (dari cache jika ada).
 */
export function getActiveBannedWords(): string[] {
  return cachedActiveWords;
}

/**
 * Sensor teks menggunakan cache in-memory kata terlarang server.
 */
export function censorServerText(text: string): string {
  return censorProfanity(text, { extraWords: cachedActiveWords });
}

/**
 * Cek apakah teks mengandung kata terlarang berdasarkan cache server.
 */
export function containsServerProfanity(text: string): boolean {
  return containsProfanity(text, { extraWords: cachedActiveWords });
}
