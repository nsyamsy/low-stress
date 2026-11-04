import { describe, expect, it } from "vitest";
import {
  buildResources,
  detectLocale,
  formatDateTime,
  formatNumber,
  loadNamespace,
  normalizeLocale,
  translate,
} from "../src/index";

describe("detectLocale", () => {
  it("mengutamakan preferensi akun", () => {
    expect(
      detectLocale({
        accountPreference: "en",
        storedPreference: "id",
        browserLanguages: ["id-ID"],
      }),
    ).toBe("en");
  });

  it("memakai localStorage bila akun auto", () => {
    expect(
      detectLocale({
        accountPreference: "auto",
        storedPreference: "en",
        browserLanguages: ["id-ID"],
      }),
    ).toBe("en");
  });

  it("memakai browser bila akun dan localStorage auto", () => {
    expect(
      detectLocale({
        accountPreference: "auto",
        storedPreference: "auto",
        browserLanguages: ["en-GB", "id-ID"],
      }),
    ).toBe("en");
  });

  it("jatuh ke bahasa bawaan", () => {
    expect(detectLocale({ browserLanguages: ["fr-FR"] })).toBe("id");
    expect(detectLocale({ browserLanguages: ["fr-FR"], defaultLocale: "en" })).toBe(
      "en",
    );
  });
});

describe("normalizeLocale", () => {
  it("mengambil kode bahasa dasar", () => {
    expect(normalizeLocale("id-ID")).toBe("id");
    expect(normalizeLocale("EN_us")).toBe("en");
    expect(normalizeLocale("fr")).toBeNull();
  });
});

describe("loadNamespace", () => {
  it("memuat namespace common secara lazy", async () => {
    const messages = await loadNamespace("id", "common");
    expect(translate("id", "app.name", {}, messages)).toBe("Low Stress");
  });

  it("menolak namespace yang tidak dikenal", async () => {
    await expect(loadNamespace("id", "missing")).rejects.toThrow();
  });
});

describe("translate", () => {
  it("mengembalikan kunci bila tidak ditemukan", () => {
    expect(translate("id", "does.not.exist")).toBe("does.not.exist");
  });

  it("menginterpolasi parameter", async () => {
    const messages = { greeting: "Halo {{name}}" };
    expect(translate("id", "greeting", { name: "Damar" }, messages)).toBe(
      "Halo Damar",
    );
  });
});

describe("format", () => {
  it("memformat angka sesuai locale", () => {
    expect(formatNumber("id", 12345)).toMatch(/12\.345/);
    expect(formatNumber("en", 12345)).toBe("12,345");
  });

  it("memformat waktu di zona Asia/Jakarta", () => {
    expect(formatDateTime("id", "2026-11-04T00:00:00.000Z")).toContain("2026");
  });
});

describe("buildResources", () => {
  it("menggabungkan namespace per locale", () => {
    const resources = buildResources({
      common: { id: { a: "A" }, en: { a: "A" } },
      auth: { id: { b: "B" }, en: { b: "B" } },
    });
    expect(resources.id.translation.common).toEqual({ a: "A" });
    expect(resources.en.translation.auth).toEqual({ b: "B" });
  });
});
