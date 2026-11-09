import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database, bannedWords } from "@low-stress/db";
import { eq } from "drizzle-orm";
import { readEnv } from "../src/env";
import {
  censorServerText,
  containsServerProfanity,
  getActiveBannedWords,
  initBannedWords,
  reloadBannedWordsCache,
} from "../src/chat/profanity-service";

const env = readEnv();

describe("P8-01: profanity-service with banned_words table", () => {
  let dbHandle: ReturnType<typeof createDb>;
  let db: Database;
  const customWord = `testkata_${Date.now()}`;

  beforeAll(async () => {
    dbHandle = createDb(env.DATABASE_URL);
    db = dbHandle.db;
  });

  afterAll(async () => {
    // Bersihkan kata uji coba
    await db.delete(bannedWords).where(eq(bannedWords.word, customWord));
    await dbHandle.close();
  });

  it("menginisialisasi kata bawaan ke tabel banned_words jika belum ada", async () => {
    await initBannedWords(db);
    const active = getActiveBannedWords();
    expect(active.length).toBeGreaterThan(30);
    expect(active).toContain("bangsat");
    expect(active).toContain("fuck");
  });

  it("menyensor kata kasar bawaan dan leet", () => {
    expect(censorServerText("halo b@ng$at")).toBe("halo *******");
    expect(censorServerText("aanjiing")).toBe("********");
    expect(containsServerProfanity("halo shit")).toBe(true);
    expect(containsServerProfanity("halo dunia")).toBe(false);
  });

  it("mendukung penambahan kata baru secara dinamis dan reload cache", async () => {
    // Tambah kata kustom ke database
    await db.insert(bannedWords).values({
      word: customWord,
      lang: "id",
      source: "admin",
      enabled: true,
    });

    await reloadBannedWordsCache(db);
    expect(getActiveBannedWords()).toContain(customWord);
    expect(censorServerText(`ini ${customWord} lho`)).toBe(
      `ini ${"*".repeat(customWord.length)} lho`,
    );

    // Nonaktifkan kata tersebut
    await db
      .update(bannedWords)
      .set({ enabled: false })
      .where(eq(bannedWords.word, customWord));

    await reloadBannedWordsCache(db);
    expect(getActiveBannedWords()).not.toContain(customWord);
    expect(censorServerText(`ini ${customWord} lho`)).toBe(
      `ini ${customWord} lho`,
    );
  });
});
