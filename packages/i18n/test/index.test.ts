import { describe, expect, it } from "vitest";
import i18n, {
  buildResources,
  commonEn,
  commonId,
  detectLocale,
  formatDateTime,
  formatNumber,
  loadNamespace,
  normalizeLocale,
  translate,
  translateErrorCode,
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

describe("translateErrorCode", () => {
  const SERVER_ERROR_CODES = [
    "VALIDATION_FAILED",
    "BAD_REQUEST",
    "UNAUTHENTICATED",
    "FORBIDDEN",
    "ADMIN_CANNOT_PLAY",
    "NOT_FOUND",
    "CONFLICT",
    "CSRF_INVALID",
    "INTERNAL",
    "INTERNAL_ERROR",
    "REGISTRATION_CLOSED",
    "USERNAME_TAKEN",
    "EMAIL_TAKEN",
    "PASSWORD_TOO_WEAK",
    "CAPTCHA_FAILED",
    "AUTH_INVALID_CREDENTIALS",
    "ACCOUNT_PENDING",
    "ACCOUNT_REJECTED",
    "ACCOUNT_SUSPENDED",
    "ACCOUNT_BANNED",
    "AUTH_LOCKED",
    "SCORE_INVALID",
    "SCORE_RATE_LIMITED",
    "SCORE_SERVER_AUTHORITATIVE",
    "GAME_CLOSED",
    "GAME_MAINTENANCE",
    "CHAT_DISABLED",
    "CHAT_MUTED",
    "CHAT_TOO_LONG",
    "CHAT_EMPTY",
    "RATE_LIMITED",
    "LUDO_ROOM_NOT_FOUND",
    "LUDO_NOT_MEMBER",
    "LUDO_FORBIDDEN",
    "LUDO_ROOM_FULL",
    "LUDO_BAD_STATE",
    "LUDO_NEED_TWO_PLAYERS",
    "LUDO_NOT_YOUR_TURN",
    "LUDO_ILLEGAL_MOVE",
    "INVALID_TRANSITION",
    "SMTP_NOT_CONFIGURED",
    "SCHEDULE_INVALID",
  ] as const;

  it("memiliki terjemahan id dan en untuk seluruh kode galat server", () => {
    for (const code of SERVER_ERROR_CODES) {
      expect(commonId.errors[code]).toBeTruthy();
      expect(commonEn.errors[code]).toBeTruthy();
    }
  });

  it("menerjemahkan kode galat yang dikenal dan jatuh ke state.error bila tidak dikenal", async () => {
    await i18n.changeLanguage("id");
    expect(translateErrorCode("AUTH_INVALID_CREDENTIALS")).toBe(
      commonId.errors.AUTH_INVALID_CREDENTIALS,
    );
    expect(translateErrorCode("UNKNOWN_SERVER_CODE")).toBe(commonId.state.error);

    await i18n.changeLanguage("en");
    expect(translateErrorCode("AUTH_INVALID_CREDENTIALS")).toBe(
      commonEn.errors.AUTH_INVALID_CREDENTIALS,
    );
    expect(translateErrorCode("UNKNOWN_SERVER_CODE")).toBe(commonEn.state.error);
    await i18n.changeLanguage("id");
  });
});
