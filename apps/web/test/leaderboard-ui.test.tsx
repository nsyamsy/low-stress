import React from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import i18n from "../src/i18n";
import { LeaderboardPage } from "../src/pages/LeaderboardPage";
import {
  GameLeaderboard,
  LeaderboardRow,
} from "../src/features/leaderboard/GameLeaderboard";

describe("P5-04: Leaderboard UI (Screens §8)", () => {
  it("merender baris leaderboard dengan nomor podium dan avatar inisial (Indonesia)", async () => {
    await i18n.changeLanguage("id");
    const entry = {
      rank: 1,
      userId: "u1",
      name: "Budi Santoso",
      score: 4950,
      plays: 5,
      bestPlay: 3,
      at: new Date().toISOString(),
      isMe: false,
    };

    const html = renderToString(
      <I18nextProvider i18n={i18n}>
        <LeaderboardRow entry={entry} isMeLabel="(kamu)" />
      </I18nextProvider>,
    );

    expect(html).toContain("Budi Santoso");
    expect(html).toContain("4.950"); // Intl id-ID: pemisah ribuan titik
    expect(html).toContain("BS"); // Inisial
    expect(html).toContain("5× main");
    expect(html).toContain("play ke-3 dari 5");
  });

  it("menyorot baris pemain sendiri dengan label (kamu)", () => {
    const entry = {
      rank: 2,
      userId: "u2",
      name: "Siti Rahma",
      score: 4800,
      plays: 2,
      bestPlay: 1,
      at: new Date().toISOString(),
      isMe: true, // Pemain sendiri
    };

    const html = renderToString(
      <I18nextProvider i18n={i18n}>
        <LeaderboardRow entry={entry} isMeLabel="(kamu)" />
      </I18nextProvider>,
    );

    expect(html).toContain("Siti Rahma");
    expect(html).toContain("(kamu)");
  });

  it("merender kartu GameLeaderboard dengan tab periode", async () => {
    await i18n.changeLanguage("id");
    const html = renderToString(
      <I18nextProvider i18n={i18n}>
        <GameLeaderboard gameId="memory-match" />
      </I18nextProvider>,
    );

    expect(html).toContain("Leaderboard");
    expect(html).toContain("Sepanjang waktu");
    expect(html).toContain("Minggu ini");
    expect(html).toContain("Bulan ini");
  });

  it("merender halaman LeaderboardPage lengkap dengan pemilih game dan catatan WIB", async () => {
    await i18n.changeLanguage("id");
    const html = renderToString(
      <I18nextProvider i18n={i18n}>
        <LeaderboardPage />
      </I18nextProvider>,
    );

    expect(html).toContain("Leaderboard");
    expect(html).toContain("Pilih Game");
    expect(html).toContain("Waktu Indonesia Barat (WIB)");

    // Uji versi English
    await i18n.changeLanguage("en");
    const htmlEn = renderToString(
      <I18nextProvider i18n={i18n}>
        <LeaderboardPage />
      </I18nextProvider>,
    );

    expect(htmlEn).toContain("Select Game");
    expect(htmlEn).toContain("Western Indonesia Time (WIB)");
  });
});
