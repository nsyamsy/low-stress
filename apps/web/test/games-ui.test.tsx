import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { commonEn, commonId } from "@low-stress/i18n";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { GameStatusPage } from "../src/pages/GameStatusPage";
import { HomePage } from "../src/pages/HomePage";
import { AuthContext } from "../src/features/auth/context";
import { AdminGamesPage } from "../src/pages/admin/AdminGamesPage";

// Setup global mock for environment without DOM
if (typeof window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
  };
}

if (typeof navigator === "undefined") {
  (globalThis as unknown as { navigator: unknown }).navigator = {
    languages: ["id", "en"],
    language: "id",
  };
}

// Inisialisasi i18n instance untuk pengujian
const testI18n = i18n.createInstance();
void testI18n.use(initReactI18next).init({
  resources: {
    id: { translation: commonId },
    en: { translation: commonEn },
  },
  lng: "id",
  fallbackLng: "id",
  interpolation: { escapeValue: false },
});

const mockAuthContext = {
  user: {
    id: "usr-1",
    username: "budi",
    displayName: "Budi Santoso",
    email: "budi@example.test",
    status: "active" as const,
    defaultLocale: "id" as const,
    theme: "system" as const,
    createdAt: new Date().toISOString(),
  },
  loading: false,
  login: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
};

describe("Games & Gateway UI (Phase 4: P4-03)", () => {
  describe("i18n & Lokalisasi Game & Beranda", () => {
    it("memastikan semua kunci translasi game dan home tersedia dalam id dan en", () => {
      const idHome = commonId.home as Record<string, unknown>;
      const enHome = commonEn.home as Record<string, unknown>;
      const idGame = commonId.game as Record<string, unknown>;
      const enGame = commonEn.game as Record<string, unknown>;

      expect(idHome.greeting).toBeDefined();
      expect(enHome.greeting).toBeDefined();
      expect(idHome.scheduleOpen).toBeDefined();
      expect(enHome.scheduleOpen).toBeDefined();

      expect(idGame.status).toBeDefined();
      expect(enGame.status).toBeDefined();
      expect(idGame.closed).toBeDefined();
      expect(enGame.closed).toBeDefined();
      expect(idGame.maintenance).toBeDefined();
      expect(enGame.maintenance).toBeDefined();
    });

    it("dapat beralih bahasa seketika antara id dan en pada teks beranda dan status game", async () => {
      await testI18n.changeLanguage("id");
      expect(testI18n.t("home.scheduleAllDay")).toBe("Buka sepanjang hari");
      expect(testI18n.t("game.closed.title")).toBe("Game sedang ditutup");
      expect(testI18n.t("game.action.play")).toBe("Main");
      expect(testI18n.t("game.action.locked")).toBe("Terkunci");

      await testI18n.changeLanguage("en");
      expect(testI18n.t("home.scheduleAllDay")).toBe("Open all day");
      expect(testI18n.t("game.closed.title")).toBe("Game is currently closed");
      expect(testI18n.t("game.action.play")).toBe("Play");
      expect(testI18n.t("game.action.locked")).toBe("Locked");
    });
  });

  describe("Responsivitas CSS Game Grid & Status Screen (Screens §5, §6)", () => {
    const css = readFileSync(
      new URL("../../../packages/ui/src/styles.css", import.meta.url),
      "utf8",
    );

    it("memiliki grid kartu 1 kolom di mobile, 2 kolom di tablet (768px), 3 kolom di desktop (1024px)", () => {
      expect(css).toContain(".ls-game-grid");
      expect(css).toContain("grid-template-columns: 1fr;");
      expect(css).toContain("@media (min-width: 768px)");
      expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
      expect(css).toContain("@media (min-width: 1024px)");
      expect(css).toContain("grid-template-columns: repeat(3, minmax(0, 1fr));");
    });

    it("memiliki gaya kartu game dan status screen dengan token desain", () => {
      expect(css).toContain(".ls-game-card");
      expect(css).toContain("border-radius: var(--radius-card);");
      expect(css).toContain(".ls-status-screen");
      expect(css).toContain(".ls-status-screen__card");
      expect(css).toContain(".ls-status-screen__icon");
    });
  });

  describe("Komponen UI Beranda & Status Game", () => {
    it("merender HomePage dengan sapaan nama pengguna dan kartu game", async () => {
      await testI18n.changeLanguage("id");

      const mockGame = {
        id: "flappy-bird",
        title: { id: "Flappy Bird", en: "Flappy Bird" },
        description: { id: "Terbang santai", en: "Fly relaxed" },
        mode: "solo" as const,
        status: "active" as const,
        open: true,
        opensAt: null,
        windows: [{ start: "12:00", end: "13:00" }],
        days: [1, 2, 3, 4, 5],
        maintenanceMessage: null,
        badge: "new",
        mobile: { supported: true },
        mine: { best: 14, plays: 31 },
      };

      const html = renderToString(
        <MemoryRouter>
          <AuthContext.Provider value={mockAuthContext}>
            <HomePage initialGames={[mockGame]} />
          </AuthContext.Provider>
        </MemoryRouter>,
      );

      expect(html).toContain("Halo, Budi Santoso");
      expect(html).toContain("Flappy Bird");
      expect(html).toContain("Aktif");
      expect(html).toContain("Rekor: 14 (31x main)");
      expect(html).toContain("Main");
    });

    it("merender GameStatusPage tertutup dengan ikon jam dan tombol kembali", async () => {
      await testI18n.changeLanguage("id");

      const mockClosedGame = {
        id: "flappy-bird",
        title: { id: "Flappy Bird", en: "Flappy Bird" },
        description: { id: "Terbang santai", en: "Fly relaxed" },
        mode: "solo" as const,
        status: "active" as const,
        open: false,
        opensAt: "2026-11-05T05:00:00.000Z",
        windows: [{ start: "12:00", end: "13:00" }],
        days: [1, 2, 3, 4, 5],
        maintenanceMessage: null,
        badge: null,
        mobile: { supported: true },
        mine: null,
      };

      const html = renderToString(
        <MemoryRouter initialEntries={["/games/flappy-bird/status"]}>
          <GameStatusPage initialGame={mockClosedGame} />
        </MemoryRouter>,
      );

      expect(html).toContain("ls-status-screen");
      expect(html).toContain("ls-status-screen__icon");
      expect(html).toContain("Game sedang ditutup");
      expect(html).toContain("Kembali ke beranda");
    });

    it("merender GameStatusPage maintenance dengan pesan pemeliharaan", async () => {
      await testI18n.changeLanguage("id");

      const mockMaintGame = {
        id: "flappy-bird",
        title: { id: "Flappy Bird", en: "Flappy Bird" },
        description: { id: "Terbang santai", en: "Fly relaxed" },
        mode: "solo" as const,
        status: "maintenance" as const,
        open: false,
        opensAt: null,
        windows: [],
        days: [],
        maintenanceMessage: {
          id: "Server sedang ditingkatkan ke v2.",
          en: "Server being upgraded to v2.",
        },
        badge: null,
        mobile: { supported: true },
        mine: null,
      };

      const html = renderToString(
        <MemoryRouter initialEntries={["/games/flappy-bird/status"]}>
          <GameStatusPage initialGame={mockMaintGame} />
        </MemoryRouter>,
      );

      expect(html).toContain("Sedang diperbarui");
      expect(html).toContain("Server sedang ditingkatkan ke v2.");
      expect(html).toContain("Kembali ke beranda");
    });

    it("merender AdminGamesPage dengan tabel pengelola game", async () => {
      await testI18n.changeLanguage("id");

      const html = renderToString(
        <MemoryRouter>
          <AdminGamesPage />
        </MemoryRouter>,
      );

      expect(html).toContain("Pengelolaan Game");
    });
  });
});
