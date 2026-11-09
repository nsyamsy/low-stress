import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n, { LOCALE_STORAGE_KEY } from "../src/i18n";
import { THEME_STORAGE_KEY } from "../src/theme";
import { AdminLoginPage } from "../src/pages/admin/AdminLoginPage";
import { AdminContext } from "../src/features/admin/context";
import {
  apiFetch,
  clearCsrfToken,
  getCsrfToken,
} from "../src/lib/apiFetch";
import { applyUserPreferences } from "../src/features/auth/AuthContext";
import { AuthContext } from "../src/features/auth/context";
import type { Me } from "../src/features/auth/types";
import {
  changePasswordApi,
  deleteAccountApi,
  logoutApi,
  updateProfileApi,
} from "../src/features/auth/api";
import {
  mapPasswordChangeError,
  ProfilePage,
} from "../src/pages/ProfilePage";
import { getGameThumbnail } from "../src/features/games/thumbnails";
import { formatNextOpenWib, HomePage } from "../src/pages/HomePage";
import { LeaderboardPage } from "../src/pages/LeaderboardPage";
import {
  GameLeaderboard,
  mapLeaderboardFetchError,
} from "../src/features/leaderboard/GameLeaderboard";
import { PwaStatusBanner } from "../src/features/pwa/PwaStatusBanner";
import {
  applySwUpdate,
  dismissSwUpdate,
  getSwState,
  notifySwNeedRefresh,
  resetSwStateForTest,
} from "../src/features/pwa/swState";

const storageMap = new Map<string, string>();
let cookieStore = "";

beforeEach(() => {
  storageMap.clear();
  cookieStore = "";

  const mockWindow = {
    localStorage: {
      getItem: (key: string) => storageMap.get(key) ?? null,
      setItem: (key: string, val: string) => {
        storageMap.set(key, val);
      },
      removeItem: (key: string) => {
        storageMap.delete(key);
      },
    },
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  (globalThis as unknown as { window: unknown }).window = mockWindow;

  const docObj = {
    documentElement: {
      dataset: {} as Record<string, string>,
      lang: "id",
    },
    get cookie() {
      return cookieStore;
    },
    set cookie(val: string) {
      if (val.includes("Max-Age=0")) {
        cookieStore = "";
      } else {
        cookieStore = val.split(";")[0] ?? "";
      }
    },
  };
  (globalThis as unknown as { document: unknown }).document = docObj;
  clearCsrfToken();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const mockAdminContext = {
  admin: null,
  loading: false,
  login: async () => {},
  logout: async () => {},
  refreshAdmin: async () => {},
};

const sampleUser: Me = {
  id: "usr-1",
  username: "budi",
  displayName: "Budi Santoso",
  email: "budi@example.test",
  emailVerified: false,
  status: "active",
  locale: "id",
  theme: "system",
  createdAt: "2026-11-05T00:00:00.000Z",
};

const mockAuthValue = {
  user: sampleUser,
  loading: false,
  publicConfig: {
    registrationMode: "approval" as const,
    captchaEnabled: false,
    defaultLocale: "id" as const,
  },
  refreshUser: async () => {},
  login: async () => sampleUser,
  logout: async () => {},
  setUser: () => {},
};

describe("Regresi Web (D-02e..i, D-04, D-05, D-07, R-01)", () => {
  describe("D-02e: AdminLoginPage menampilkan pesan terkunci pada AUTH_LOCKED", () => {
    it("menampilkan pesan lockout dengan hitungan detik dalam Bahasa Indonesia dan Inggris", async () => {
      await i18n.changeLanguage("id");
      const htmlId = renderToString(
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <AdminContext.Provider value={mockAdminContext}>
              <AdminLoginPage
                initialErrorCode="AUTH_LOCKED"
                initialRetryAfterSec={120}
              />
            </AdminContext.Provider>
          </MemoryRouter>
        </I18nextProvider>,
      );

      expect(htmlId).toContain('role="alert"');
      expect(htmlId).toContain(
        i18n.t("auth.login.lockoutMessage", { seconds: 120 }),
      );

      await i18n.changeLanguage("en");
      const htmlEn = renderToString(
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <AdminContext.Provider value={mockAdminContext}>
              <AdminLoginPage
                initialErrorCode="AUTH_LOCKED"
                initialRetryAfterSec={90}
              />
            </AdminContext.Provider>
          </MemoryRouter>
        </I18nextProvider>,
      );

      expect(htmlEn).toContain('role="alert"');
      expect(htmlEn).toContain(
        i18n.t("auth.login.lockoutMessage", { seconds: 90 }),
      );
    });
  });

  describe("D-02f & R-01: getCsrfToken mendahulukan cookie ls_csrf & apiFetch retry CSRF_INVALID", () => {
    it("mengambil token langsung dari cookie ls_csrf tanpa memanggil /api/csrf", async () => {
      cookieStore = "ls_csrf=token-dari-cookie-123";
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const token = await getCsrfToken();
      expect(token).toBe("token-dari-cookie-123");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("mengulangi permintaan mutasi sekali dengan token baru bila server membalas 403 CSRF_INVALID", async () => {
      cookieStore = "ls_csrf=token-usang";
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ error: { code: "CSRF_INVALID" } }),
            { status: 403, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ token: "token-segar-456" }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ ok: true }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );

      const res = await apiFetch<{ ok: boolean }>("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ displayName: "Baru" }),
      });

      expect(res).toEqual({ ok: true });
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      const firstHeaders = (fetchSpy.mock.calls[0]?.[1]?.headers ?? {}) as Record<
        string,
        string
      >;
      const retryHeaders = (fetchSpy.mock.calls[2]?.[1]?.headers ?? {}) as Record<
        string,
        string
      >;
      expect(firstHeaders["x-csrf-token"]).toBe("token-usang");
      expect(retryHeaders["x-csrf-token"]).toBe("token-segar-456");
    });
  });

  describe("D-02g: applyUserPreferences menjaga preferensi lokal untuk akun system/auto", () => {
    it("mempertahankan tema/bahasa lokal bila akun masih system/auto dan mendorongnya ke akun", async () => {
      storageMap.set(THEME_STORAGE_KEY, "dark");
      storageMap.set(LOCALE_STORAGE_KEY, "en");

      const persistMock = vi.fn().mockResolvedValue({
        ...sampleUser,
        theme: "dark",
        locale: "en",
      });
      const updatedCallback = vi.fn();

      const result = applyUserPreferences(
        { ...sampleUser, theme: "system", locale: "auto" },
        updatedCallback,
        persistMock,
      );

      expect(result.theme).toBe("dark");
      expect(result.locale).toBe("en");
      expect(result.patch).toEqual({ theme: "dark", locale: "en" });
      expect(persistMock).toHaveBeenCalledWith({ theme: "dark", locale: "en" });
    });

    it("memenangkan pilihan eksplisit akun di atas pilihan lokal tanpa memanggil updateProfileApi", () => {
      storageMap.set(THEME_STORAGE_KEY, "light");
      storageMap.set(LOCALE_STORAGE_KEY, "id");

      const persistMock = vi.fn();
      const result = applyUserPreferences(
        { ...sampleUser, theme: "dark", locale: "en" },
        undefined,
        persistMock,
      );

      expect(result.theme).toBe("dark");
      expect(result.locale).toBe("en");
      expect(result.patch).toEqual({});
      expect(persistMock).not.toHaveBeenCalled();
    });
  });

  describe("D-02h: ProfilePage ubah nama, ganti password, hapus akun dengan konfirmasi, keluar", () => {
    it("merender seluruh seksi ProfilePage termasuk modal konfirmasi hapus akun dan tombol keluar", async () => {
      await i18n.changeLanguage("id");
      const html = renderToString(
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <AuthContext.Provider value={mockAuthValue}>
              <ProfilePage
                initialNameNotice={{
                  tone: "success",
                  text: i18n.t("profile.saved"),
                }}
                initialDeleteOpen={true}
                initialDeleteError={i18n.t("profile.danger.failed")}
              />
            </AuthContext.Provider>
          </MemoryRouter>
        </I18nextProvider>,
      );

      expect(html).toContain("Budi Santoso");
      expect(html).toContain("budi@example.test");
      expect(html).toContain(i18n.t("profile.saved"));
      expect(html).toContain(i18n.t("profile.password.title"));
      expect(html).toContain(i18n.t("nav.logout"));
      expect(html).toContain(i18n.t("profile.danger.confirmTitle"));
      expect(html).toContain(i18n.t("profile.danger.failed"));
    });

    it("memetakan galat password salah (AUTH_INVALID_CREDENTIALS) dan password lemah (PASSWORD_TOO_WEAK)", async () => {
      await i18n.changeLanguage("id");
      const t = i18n.t.bind(i18n);

      expect(
        mapPasswordChangeError(
          { apiError: { code: "AUTH_INVALID_CREDENTIALS" } },
          t,
        ),
      ).toBe(i18n.t("profile.password.wrongCurrent"));

      expect(
        mapPasswordChangeError(
          { apiError: { code: "PASSWORD_TOO_WEAK" } },
          t,
        ),
      ).toBe(i18n.t("profile.password.weak"));

      expect(
        mapPasswordChangeError(
          { apiError: { code: "VALIDATION_FAILED" } },
          t,
        ),
      ).toBe(i18n.t("profile.password.weak"));
    });

    it("memanggil endpoint API profil untuk ubah nama, ganti password, hapus akun, dan keluar", async () => {
      cookieStore = "ls_csrf=csrf-profil";
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ ...sampleUser, displayName: "Budi Baru" }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(new Response(null, { status: 204 }));

      const updated = await updateProfileApi({ displayName: "Budi Baru" });
      expect(updated.displayName).toBe("Budi Baru");

      await changePasswordApi({
        currentPassword: "lamaPassword123",
        newPassword: "baruPassword456",
      });

      await deleteAccountApi({ password: "baruPassword456" });
      await logoutApi();

      expect(fetchSpy).toHaveBeenCalledTimes(4);
      expect(fetchSpy.mock.calls[0]?.[0]).toBe("/api/me");
      expect(fetchSpy.mock.calls[1]?.[0]).toBe("/api/me/password");
      expect(fetchSpy.mock.calls[2]?.[0]).toBe("/api/me");
      expect(fetchSpy.mock.calls[2]?.[1]?.method).toBe("DELETE");
      expect(fetchSpy.mock.calls[3]?.[0]).toBe("/api/auth/logout");
    });
  });

  describe("D-02i: getGameThumbnail menemukan games/*/thumbnail.svg dan kartu jatuh ke inisial bila tidak ada", () => {
    it("menemukan thumbnail.svg untuk keempat game dan null untuk game tanpa berkas", () => {
      expect(getGameThumbnail("flappy-bird")).toBeTruthy();
      expect(getGameThumbnail("memory-match")).toBeTruthy();
      expect(getGameThumbnail("ludo")).toBeTruthy();
      expect(getGameThumbnail("riot")).toBeTruthy();
      expect(getGameThumbnail("game-tanpa-thumb")).toBeNull();
    });

    it("merender elemen img untuk game dengan thumbnail dan inisial 2 huruf bila tidak ada thumbnail", async () => {
      await i18n.changeLanguage("id");
      const html = renderToString(
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <AuthContext.Provider value={mockAuthValue}>
              <HomePage
                initialGames={[
                  {
                    id: "flappy-bird",
                    title: { id: "Flappy Bird", en: "Flappy Bird" },
                    description: { id: "Terbang", en: "Fly" },
                    mode: "solo",
                    status: "active",
                    open: true,
                    opensAt: null,
                    windows: [],
                    days: [0, 1, 2, 3, 4, 5, 6],
                    maintenanceMessage: null,
                    badge: null,
                    mobile: { supported: true },
                    mine: null,
                  },
                  {
                    id: "custom-quiz",
                    title: { id: "Kuis Santai", en: "Relax Quiz" },
                    description: { id: "Kuis", en: "Quiz" },
                    mode: "solo",
                    status: "active",
                    open: true,
                    opensAt: null,
                    windows: [],
                    days: [0, 1, 2, 3, 4, 5, 6],
                    maintenanceMessage: null,
                    badge: null,
                    mobile: { supported: true },
                    mine: null,
                  },
                ]}
              />
            </AuthContext.Provider>
          </MemoryRouter>
        </I18nextProvider>,
      );

      expect(html).toContain("ls-game-card__thumb");
      expect(html).toContain(">KU<");
    });
  });

  describe("D-04: formatNextOpenWib menghitung waktu dengan zona Asia/Jakarta di semua TZ", () => {
    it("menghasilkan hari dan jam WIB yang identik pada TZ=America/New_York, TZ=Asia/Tokyo, dan TZ=UTC", async () => {
      await i18n.changeLanguage("id");
      const prevTz = process.env.TZ;
      // 2026-11-09T05:00:00.000Z adalah Senin 12:00 WIB (Asia/Jakarta = UTC+7)
      // Di America/New_York (UTC-5) waktu ini adalah Senin 00:00, atau jika 2026-11-08T23:30:00.000Z:
      // Di WIB = Senin 06:30 WIB, sedangkan di New York = Minggu 18:30 EST!
      const isoCrossDay = "2026-11-08T23:30:00.000Z";

      try {
        process.env.TZ = "America/New_York";
        const outNy = formatNextOpenWib(isoCrossDay, i18n.t.bind(i18n));

        process.env.TZ = "Asia/Tokyo";
        const outTokyo = formatNextOpenWib(isoCrossDay, i18n.t.bind(i18n));

        process.env.TZ = "UTC";
        const outUtc = formatNextOpenWib(isoCrossDay, i18n.t.bind(i18n));

        expect(outNy).toBe("Senin 06:30 WIB");
        expect(outTokyo).toBe("Senin 06:30 WIB");
        expect(outUtc).toBe("Senin 06:30 WIB");
      } finally {
        if (prevTz === undefined) {
          delete process.env.TZ;
        } else {
          process.env.TZ = prevTz;
        }
      }
    });
  });

  describe("D-05 & D-07: Penanganan galat jaringan/403/500 & empty state di HomePage, LeaderboardPage, GameLeaderboard", () => {
    it("HomePage menampilkan pesan galat dan tombol Coba lagi yang berbeda dari keadaan kosong", async () => {
      await i18n.changeLanguage("id");

      const emptyHtml = renderToString(
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <AuthContext.Provider value={mockAuthValue}>
              <HomePage initialGames={[]} />
            </AuthContext.Provider>
          </MemoryRouter>
        </I18nextProvider>,
      );
      expect(emptyHtml).toContain(i18n.t("home.emptyGames"));
      expect(emptyHtml).not.toContain(i18n.t("action.tryAgain"));

      const forbiddenHtml = renderToString(
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <AuthContext.Provider value={mockAuthValue}>
              <HomePage initialError={i18n.t("state.forbidden")} />
            </AuthContext.Provider>
          </MemoryRouter>
        </I18nextProvider>,
      );
      expect(forbiddenHtml).toContain(i18n.t("state.forbidden"));
      expect(forbiddenHtml).toContain(i18n.t("action.tryAgain"));
      expect(forbiddenHtml).not.toContain(i18n.t("home.emptyGames"));

      const serverErrHtml = renderToString(
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <AuthContext.Provider value={mockAuthValue}>
              <HomePage initialError={i18n.t("state.error")} />
            </AuthContext.Provider>
          </MemoryRouter>
        </I18nextProvider>,
      );
      expect(serverErrHtml).toContain(i18n.t("state.error"));
      expect(serverErrHtml).toContain(i18n.t("action.tryAgain"));
    });

    it("LeaderboardPage (D-07 & D-05) tidak memaksa chip Memory Match saat kosong dan menampilkan galat dengan tombol Coba lagi", async () => {
      await i18n.changeLanguage("id");

      const emptyHtml = renderToString(
        <I18nextProvider i18n={i18n}>
          <LeaderboardPage initialGames={[]} />
        </I18nextProvider>,
      );
      expect(emptyHtml).toContain(i18n.t("home.emptyGames"));
      expect(emptyHtml).toContain(i18n.t("leaderboard.empty"));
      expect(emptyHtml).not.toContain("Memory Match");

      const firstGameHtml = renderToString(
        <I18nextProvider i18n={i18n}>
          <LeaderboardPage
            initialGames={[
              {
                id: "flappy-bird",
                title: { id: "Flappy Bird", en: "Flappy Bird" },
                description: { id: "Terbang", en: "Fly" },
                mode: "solo",
                status: "active",
                open: true,
                opensAt: null,
                windows: [],
                days: [0, 1, 2, 3, 4, 5, 6],
                maintenanceMessage: null,
                badge: null,
                mobile: { supported: true },
                mine: null,
              },
            ]}
          />
        </I18nextProvider>,
      );
      expect(firstGameHtml).toContain("Flappy Bird");
      expect(firstGameHtml).not.toContain("Memory Match");

      const errHtml = renderToString(
        <I18nextProvider i18n={i18n}>
          <LeaderboardPage initialError={i18n.t("state.error")} />
        </I18nextProvider>,
      );
      expect(errHtml).toContain(i18n.t("state.error"));
      expect(errHtml).toContain(i18n.t("action.tryAgain"));
    });

    it("GameLeaderboard membedakan respons 403, GAME_CLOSED, 500, dan jaringan putus dari keadaan kosong", async () => {
      await i18n.changeLanguage("id");
      const t = i18n.t.bind(i18n);

      expect(
        mapLeaderboardFetchError(
          { status: 403, apiError: { code: "ADMIN_CANNOT_PLAY" } },
          t,
        ),
      ).toBe(i18n.t("state.forbidden"));

      expect(
        mapLeaderboardFetchError(
          { status: 403, apiError: { code: "GAME_CLOSED" } },
          t,
        ),
      ).toBe(i18n.t("errors.GAME_CLOSED"));

      expect(
        mapLeaderboardFetchError(
          { status: 500, apiError: { code: "INTERNAL" } },
          t,
        ),
      ).toBe(i18n.t("errors.INTERNAL"));

      expect(mapLeaderboardFetchError(new TypeError("Failed to fetch"), t)).toBe(
        i18n.t("state.error"),
      );

      const errorCardHtml = renderToString(
        <I18nextProvider i18n={i18n}>
          <GameLeaderboard
            gameId="flappy-bird"
            initialError={i18n.t("state.forbidden")}
          />
        </I18nextProvider>,
      );
      expect(errorCardHtml).toContain(i18n.t("state.forbidden"));
      expect(errorCardHtml).toContain(i18n.t("action.tryAgain"));
      expect(errorCardHtml).not.toContain(i18n.t("leaderboard.empty"));
    });
  });

  describe("D-11: Service Worker update (onNeedRefresh) & banner offline", () => {
    beforeEach(() => {
      resetSwStateForTest();
    });

    it("menampilkan banner luring saat perangkat offline dan banner pembaruan saat onNeedRefresh dipicu", async () => {
      await i18n.changeLanguage("id");

      const offlineHtml = renderToString(
        <I18nextProvider i18n={i18n}>
          <PwaStatusBanner initialOffline={true} initialNeedRefresh={false} />
        </I18nextProvider>,
      );
      expect(offlineHtml).toContain(i18n.t("state.offline"));

      const updateMock = vi.fn().mockResolvedValue(undefined);
      notifySwNeedRefresh(updateMock);
      expect(getSwState().needRefresh).toBe(true);

      const refreshHtml = renderToString(
        <I18nextProvider i18n={i18n}>
          <PwaStatusBanner />
        </I18nextProvider>,
      );
      expect(refreshHtml).toContain(i18n.t("state.updateAvailable"));
      expect(refreshHtml).toContain(i18n.t("state.updateAction"));

      await applySwUpdate();
      expect(updateMock).toHaveBeenCalledWith(true);
      expect(getSwState().needRefresh).toBe(false);

      notifySwNeedRefresh(updateMock);
      dismissSwUpdate();
      expect(getSwState().needRefresh).toBe(false);
    });
  });
});
