import i18next from "i18next";
import commonEn from "./locales/common/en.json";
import commonId from "./locales/common/id.json";

export const SUPPORTED_LOCALES = ["id", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "id";

/** Urutan penentuan bahasa: akun → localStorage → browser → bawaan. */
export type LocalePreference = "auto" | Locale;

export interface LocaleSources {
  /** Preferensi tersimpan di akun (bila pemain sudah login). */
  accountPreference?: LocalePreference | null;
  /** Pilihan tersimpan di localStorage perangkat. */
  storedPreference?: LocalePreference | null;
  /** Nilai `navigator.languages` atau header `Accept-Language`. */
  browserLanguages?: readonly string[] | null;
  defaultLocale?: Locale;
}

export type Messages = Record<string, unknown>;

const COMMON: Record<Locale, Messages> = {
  id: commonId,
  en: commonEn,
};

const LOADERS: Record<Locale, Record<string, () => Promise<Messages>>> = {
  id: { common: async () => COMMON.id },
  en: { common: async () => COMMON.en },
};

export class UnsupportedLocaleError extends Error {
  constructor(locale: string) {
    super(`Locale tidak didukung: ${locale}`);
    this.name = "UnsupportedLocaleError";
  }
}

export function isLocale(value: unknown): value is Locale {
  return value === "id" || value === "en";
}

export function normalizeLocale(value: unknown): Locale | null {
  if (typeof value !== "string") return null;
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : null;
}

function fromBrowser(languages: readonly string[] | null | undefined): Locale | null {
  for (const language of languages ?? []) {
    const match = normalizeLocale(language);
    if (match) return match;
  }
  return null;
}

/** Tentukan bahasa aktif menurut urutan akun → localStorage → browser → bawaan. */
export function detectLocale(sources: LocaleSources = {}): Locale {
  const { accountPreference, storedPreference, browserLanguages } = sources;
  if (accountPreference && accountPreference !== "auto") {
    return normalizeLocale(accountPreference) ?? sources.defaultLocale ?? DEFAULT_LOCALE;
  }
  if (storedPreference && storedPreference !== "auto") {
    return normalizeLocale(storedPreference) ?? sources.defaultLocale ?? DEFAULT_LOCALE;
  }
  return (
    fromBrowser(browserLanguages) ?? sources.defaultLocale ?? DEFAULT_LOCALE
  );
}

/** Muat namespace bahasa secara lazy. Namespace inti: `common`. */
export async function loadNamespace(
  locale: Locale,
  namespace = "common",
): Promise<Messages> {
  const loader = LOADERS[locale]?.[namespace];
  if (!loader) {
    throw new UnsupportedLocaleError(`${locale}/${namespace}`);
  }
  return loader();
}

export interface TranslateParams {
  [key: string]: string | number | undefined;
}

function lookup(messages: Messages, key: string): unknown {
  return key.split(".").reduce<unknown>((current, part) => {
    if (typeof current !== "object" || current === null) return undefined;
    return (current as Record<string, unknown>)[part];
  }, messages);
}

/**
 * Terjemahan sederhana untuk server dan tes. Aplikasi web memakai i18next,
 * tetapi kontrak kunci dan interpolasi tetap sama.
 */
export function translate(
  locale: Locale,
  key: string,
  params: TranslateParams = {},
  messages: Messages = COMMON[locale],
): string {
  const value = lookup(messages, key);
  if (typeof value !== "string") return key;
  return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) => {
    const replacement = params[name];
    return replacement === undefined ? `{{${name}}}` : String(replacement);
  });
}

export function formatNumber(locale: Locale, value: number): string {
  return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US").format(value);
}

export function formatDateTime(locale: Locale, value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

/** Gabungkan resource dari beberapa namespace untuk i18next. */
export function buildResources(
  namespaces: Record<string, Record<Locale, Messages>>,
): Record<Locale, { translation: Record<string, Messages> }> {
  const result: Record<Locale, { translation: Record<string, Messages> }> = {
    id: { translation: {} },
    en: { translation: {} },
  };
  for (const [namespace, byLocale] of Object.entries(namespaces)) {
    for (const locale of SUPPORTED_LOCALES) {
      result[locale].translation[namespace] = byLocale[locale];
    }
  }
  return result;
}

if (!i18next.isInitialized) {
  void i18next.init({
    resources: {
      id: { translation: commonId },
      en: { translation: commonEn },
    },
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: ["id", "en"],
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

/**
 * Terjemahkan kode error server (`errors.${code}`) via `i18next.t`,
 * dan jatuh ke `state.error` bila kode tidak dikenal.
 */
export function translateErrorCode(
  code: string,
  params?: Record<string, unknown>,
): string {
  const key = `errors.${code}`;
  if (code && i18next.exists(key)) {
    return String(i18next.t(key, params));
  }
  return String(i18next.t("state.error", params));
}

export { commonEn, commonId };
export default i18next;
