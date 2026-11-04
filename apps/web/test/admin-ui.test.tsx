import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { commonEn, commonId } from "@low-stress/i18n";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { AdminLoginPage } from "../src/pages/admin/AdminLoginPage";
import { AdminLayout } from "../src/pages/admin/AdminLayout";
import { AdminContext } from "../src/features/admin/context";

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

const mockAdminContext = {
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
  refreshAdmin: async () => {},
};

describe("Admin UI (P3-09)", () => {
  describe("i18n & Lokalisasi Panel Admin", () => {
    it("memastikan semua kunci translasi admin tersedia lengkap dalam id dan en", () => {
      const idAdmin = commonId.admin as Record<string, unknown>;
      const enAdmin = commonEn.admin as Record<string, unknown>;

      expect(idAdmin).toBeDefined();
      expect(enAdmin).toBeDefined();

      const requiredSections = [
        "nav",
        "login",
        "dashboard",
        "approvals",
        "users",
        "settings",
        "audit",
        "modal",
        "header",
      ];

      for (const section of requiredSections) {
        expect(idAdmin[section], `Bagian ${section} harus ada di id.json`).toBeDefined();
        expect(enAdmin[section], `Bagian ${section} harus ada di en.json`).toBeDefined();
      }
    });

    it("dapat beralih bahasa seketika antara id dan en pada teks navigasi", async () => {
      await testI18n.changeLanguage("id");
      expect(testI18n.t("admin.nav.title")).toBe("Panel Admin");
      expect(testI18n.t("admin.nav.approvals")).toBe("Persetujuan");
      expect(testI18n.t("admin.nav.settings")).toBe("Pengaturan");

      await testI18n.changeLanguage("en");
      expect(testI18n.t("admin.nav.title")).toBe("Admin Panel");
      expect(testI18n.t("admin.nav.approvals")).toBe("Approvals");
      expect(testI18n.t("admin.nav.settings")).toBe("Settings");
    });
  });

  describe("Responsivitas CSS Admin (360px mobile vs 1280px desktop)", () => {
    const css = readFileSync(
      new URL("../../../packages/ui/src/styles.css", import.meta.url),
      "utf8",
    );

    it("memiliki aturan media query 767px untuk viewport 360px (mobile drawer)", () => {
      expect(css).toContain("@media (max-width: 767px)");
      expect(css).toContain(".ls-admin-sidebar.open");
      expect(css).toContain("transform: translateX(0)");
      expect(css).toContain(".ls-admin-sidebar-backdrop");
    });

    it("menyembunyikan tabel dan menampilkan kartu mobile pada viewport sempit (360px)", () => {
      const mobileBreakpointIdx = css.indexOf("@media (max-width: 767px)");
      expect(mobileBreakpointIdx).toBeGreaterThan(0);

      const mobileBlock = css.slice(mobileBreakpointIdx);
      expect(mobileBlock).toContain(".ls-admin-table-container");
      expect(mobileBlock).toContain("display: none");
      expect(mobileBlock).toContain(".ls-admin-card-list");
      expect(mobileBlock).toContain("display: flex");
    });

    it("menampilkan tabel dan menyembunyikan kartu mobile pada desktop (1280px)", () => {
      expect(css).toContain(".ls-admin-card-list {\n  display: none;\n}");
      expect(css).toContain(".ls-admin-layout");
      expect(css).toContain(".ls-admin-sidebar");
    });
  });

  describe("Komponen UI Panel Admin", () => {
    it("merender AdminLoginPage dengan form masuk dan peringatan pemisahan peran", async () => {
      await testI18n.changeLanguage("id");
      const htmlId = renderToString(
        <MemoryRouter>
          <AdminContext.Provider value={{ ...mockAdminContext, admin: null }}>
            <AdminLoginPage />
          </AdminContext.Provider>
        </MemoryRouter>,
      );

      expect(htmlId).toContain("Login Admin");
      expect(htmlId).toContain("Masuk ke panel pengelolaan Low Stress");
      expect(htmlId).toContain("ls-auth-card");

      // Periksa dalam bahasa Inggris
      await testI18n.changeLanguage("en");
      const htmlEn = renderToString(
        <MemoryRouter>
          <AdminContext.Provider value={{ ...mockAdminContext, admin: null }}>
            <AdminLoginPage />
          </AdminContext.Provider>
        </MemoryRouter>,
      );

      expect(htmlEn).toContain("Admin Login");
      expect(htmlEn).toContain("Sign in to Low Stress management panel");
    });

    it("merender AdminLayout dengan sidebar navigasi lengkap dan info admin", async () => {
      await testI18n.changeLanguage("id");

      const html = renderToString(
        <MemoryRouter initialEntries={["/admin"]}>
          <AdminContext.Provider value={mockAdminContext}>
            <AdminLayout />
          </AdminContext.Provider>
        </MemoryRouter>,
      );

      expect(html).toContain("Panel Admin");
      expect(html).toContain("superadmin");
      expect(html).toContain("Dashboard");
      expect(html).toContain("Persetujuan");
      expect(html).toContain("Pengguna");
      expect(html).toContain("Pengaturan");
      expect(html).toContain("Audit log");
      expect(html).toContain("Keluar");
    });
  });
});
