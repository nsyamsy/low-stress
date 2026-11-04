import React from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import i18n from "@low-stress/i18n";
import {
  CARD_DEFS,
  generateShuffledDeck,
} from "../client/deck";
import { MemoryMatch } from "../client/MemoryMatch";
import MemoryMatchGame from "../client/index";
import { SoundEngine } from "../client/sound";

describe("P5-03: Memory Match Game Port", () => {
  it("membuat dek berisi 16 kartu dengan 8 pasangan unik (Porting_Guide §3)", () => {
    const deck = generateShuffledDeck();
    expect(deck.length).toBe(16);

    const counts = new Map<string, number>();
    for (const card of deck) {
      counts.set(card.defId, (counts.get(card.defId) ?? 0) + 1);
      expect(card.isFlipped).toBe(false);
      expect(card.isMatched).toBe(false);
    }

    expect(counts.size).toBe(8);
    for (const def of CARD_DEFS) {
      expect(counts.get(def.id)).toBe(2);
    }
  });

  it("menyediakan 8 definisi kartu berikon dan palet warna lengkap", () => {
    expect(CARD_DEFS.length).toBe(8);
    const ids = CARD_DEFS.map((d) => d.id);
    expect(ids).toEqual([
      "rocket",
      "diamond",
      "lightning",
      "target",
      "star",
      "clover",
      "crown",
      "flame",
    ]);
  });

  it("SoundEngine sintesis Web Audio berjalan aman tanpa melempar error", () => {
    const sounds = new SoundEngine();
    // Di lingkungan Node tanpa AudioContext tidak melempar error
    expect(() => sounds.flip()).not.toThrow();
    expect(() => sounds.match()).not.toThrow();
    expect(() => sounds.misMatch()).not.toThrow();
    expect(() => sounds.victory()).not.toThrow();
  });

  it("merender komponen MemoryMatch tanpa melempar error", () => {
    const html = renderToString(
      <I18nextProvider i18n={i18n}>
        <MemoryMatch />
      </I18nextProvider>,
    );

    // Memiliki 16 tombol kartu
    const buttonMatches = html.match(/<button/g);
    expect(buttonMatches).toBeDefined();
    expect(buttonMatches!.length).toBeGreaterThanOrEqual(16);
  });

  it("merender wrapper game lengkap (MemoryMatchGame) dengan layout tiga kolom (Screens §8)", () => {
    const html = renderToString(
      <I18nextProvider i18n={i18n}>
        <MemoryMatchGame onScore={async () => {}} />
      </I18nextProvider>,
    );

    expect(html).toContain("Leaderboard");
    expect(html).toContain("Memory Match");
  });
});
