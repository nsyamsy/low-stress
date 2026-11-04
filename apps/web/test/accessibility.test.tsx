import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import i18n from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import { commonEn, commonId } from "@low-stress/i18n";
import { Input, Modal } from "@low-stress/ui";
import { LoginPage } from "../src/pages/LoginPage";
import { RegisterPage } from "../src/pages/RegisterPage";
import { AdminLayout } from "../src/pages/admin/AdminLayout";
import { AdminContext } from "../src/features/admin/context";
import { AuthContext, type AuthContextValue } from "../src/features/auth/context";

// Setup mocks
if (typeof window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    innerWidth: 1280,
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  };
}

if (typeof navigator === "undefined") {
  (globalThis as unknown as { navigator: unknown }).navigator = {
    languages: ["id", "en"],
    language: "id",
  };
}

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

// Relative luminance & contrast formula (WCAG 2.1)
function sRGBtoLin(colorChannel: number): number {
  return colorChannel <= 0.03928
    ? colorChannel / 12.92
    : Math.pow((colorChannel + 0.055) / 1.055, 2.4);
}

function getRelativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * sRGBtoLin(r) + 0.7152 * sRGBtoLin(g) + 0.0722 * sRGBtoLin(b);
}

function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe("P9-01: Audit Aksesibilitas WCAG 2.1 AA", () => {
  it("memverifikasi rasio kontras warna desain memenuhi kriteria AA (>= 4.5:1 untuk teks normal)", () => {
    // Mode Terang
    const bgPageLight = "#f6f1e7";
    const bgSurfaceLight = "#fffdf8";
    const textPrimaryLight = "#2f5d55";
    const textOnPrimaryLight = "#f6f1e7";

    const ratioPage = getContrastRatio(textPrimaryLight, bgPageLight);
    const ratioSurface = getContrastRatio(textPrimaryLight, bgSurfaceLight);
    const ratioButton = getContrastRatio(textOnPrimaryLight, textPrimaryLight);

    expect(ratioPage).toBeGreaterThanOrEqual(4.5);
    expect(ratioSurface).toBeGreaterThanOrEqual(4.5);
    expect(ratioButton).toBeGreaterThanOrEqual(4.5);

    // Mode Gelap
    const bgPageDark = "#16211f";
    const bgSurfaceDark = "#1e2d2a";
    const textPrimaryDark = "#f6f1e7";
    const primaryDark = "#7fa88b";

    const ratioPageDark = getContrastRatio(textPrimaryDark, bgPageDark);
    const ratioSurfaceDark = getContrastRatio(textPrimaryDark, bgSurfaceDark);
    const ratioBtnDark = getContrastRatio(primaryDark, bgPageDark);

    expect(ratioPageDark).toBeGreaterThanOrEqual(7.0); // Memenuhi standar AAA
    expect(ratioSurfaceDark).toBeGreaterThanOrEqual(7.0);
    expect(ratioBtnDark).toBeGreaterThanOrEqual(4.5);
  });

  it("memverifikasi styles.css mendefinisikan fokus yang jelas dan dukungan reduced-motion", () => {
    const cssPath = resolve(__dirname, "../../../packages/ui/src/styles.css");
    const css = readFileSync(cssPath, "utf-8");

    // Fokus tampak
    expect(css).toContain(":focus-visible");
    expect(css).toContain("outline: 2px solid var(--focus-ring)");
    expect(css).toContain("outline-offset: 2px");

    // Skip link
    expect(css).toContain(".ls-skip-link");

    // Reduced motion
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation-duration: 0.01ms !important");
  });

  it("memverifikasi komponen Input memiliki relasi label, id, dan aria-describedby", () => {
    const htmlWithError = renderToString(
      <Input
        label="Nama Pengguna"
        helpText="Gunakan huruf kecil"
        error="Nama tidak valid"
      />,
    );

    expect(htmlWithError).toContain('<label class="ls-field__label" for=');
    expect(htmlWithError).toContain('aria-invalid="true"');
    expect(htmlWithError).toContain('aria-describedby=');
    expect(htmlWithError).toContain('class="ls-field__error"');
    expect(htmlWithError).toContain('class="ls-field__help"');
  });

  it("memverifikasi Modal memiliki peran dialog aksesibel dan aria-labelledby", () => {
    const htmlModal = renderToString(
      <Modal open={true} title="Konfirmasi Tindakan" closeLabel="Tutup" onClose={() => {}}>
        <p>Konten modal dialog</p>
      </Modal>,
    );

    expect(htmlModal).toContain('role="dialog"');
    expect(htmlModal).toContain('aria-modal="true"');
    expect(htmlModal).toContain('aria-labelledby="ls-modal-title"');
    expect(htmlModal).toContain('id="ls-modal-title"');
  });

  it("memverifikasi halaman Login dan Register memuat form semantik berlabel lengkap", () => {
    const mockAuthContext: AuthContextValue = {
      user: null,
      loading: false,
      login: async () => ({
        id: "usr-1",
        username: "testplayer",
        displayName: "Test Player",
        email: "player@example.test",
        status: "active",
        theme: "light",
        locale: "id",
        createdAt: new Date().toISOString(),
      }),
      logout: async () => {},
      refreshUser: async () => {},
      setUser: () => {},
      publicConfig: {
        registration: "open",
        deployMode: "lan",
        captcha: false,
        defaultLocale: "id",
      },
    };

    const loginHtml = renderToString(
      <I18nextProvider i18n={testI18n}>
        <AuthContext.Provider value={mockAuthContext}>
          <MemoryRouter>
            <LoginPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </I18nextProvider>,
    );
    expect(loginHtml).toContain('type="submit"');
    expect(loginHtml).toMatch(/autocomplete="username"/i);
    expect(loginHtml).toMatch(/autocomplete="current-password"/i);

    const regHtml = renderToString(
      <I18nextProvider i18n={testI18n}>
        <AuthContext.Provider value={mockAuthContext}>
          <MemoryRouter>
            <RegisterPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </I18nextProvider>,
    );
    expect(regHtml).toMatch(/autocomplete="username"/i);
    expect(regHtml).toMatch(/autocomplete="email"/i);
    expect(regHtml).toMatch(/autocomplete="new-password"/i);
  });

  it("memverifikasi AdminLayout menyediakan skip-link dan tombol menu aksesibel", () => {
    const mockContext = {
      admin: {
        id: "adm-1",
        username: "superadmin",
        email: "admin@example.test",
        createdAt: new Date().toISOString(),
        lastLoginAt: null,
      },
      loading: false,
      login: async () => {},
      logout: async () => {},
    };

    const adminHtml = renderToString(
      <I18nextProvider i18n={testI18n}>
        <MemoryRouter initialEntries={["/admin"]}>
          <AdminContext.Provider value={mockContext}>
            <AdminLayout />
          </AdminContext.Provider>
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(adminHtml).toContain('href="#admin-main-content"');
    expect(adminHtml).toContain('class="ls-skip-link"');
    expect(adminHtml).toContain('id="admin-main-content"');
    expect(adminHtml).toContain('aria-controls="admin-sidebar"');
  });
});
