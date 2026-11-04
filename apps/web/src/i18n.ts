import {
  DEFAULT_LOCALE,
  commonEn,
  commonId,
  detectLocale,
  type Locale,
} from "@low-stress/i18n";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

export const LOCALE_STORAGE_KEY = "low-stress.locale";

export type LocalePreference = "auto" | Locale;

export function readLocalePreference(): LocalePreference {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (stored === "auto" || stored === "id" || stored === "en") return stored;
    }
  } catch {
    // localStorage bisa diblokir; jatuh ke deteksi browser.
  }
  return "auto";
}

function initialLocale(): Locale {
  const browserLanguages =
    typeof navigator !== "undefined"
      ? (navigator.languages ?? [navigator.language])
      : ["id"];

  return detectLocale({
    storedPreference: readLocalePreference(),
    browserLanguages,
    defaultLocale: DEFAULT_LOCALE,
  });
}

const startLocale = initialLocale();

void i18n.use(initReactI18next).init({
  resources: {
    id: { translation: commonId },
    en: { translation: commonEn },
  },
  lng: startLocale,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: ["id", "en"],
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function changeLocale(preference: LocalePreference): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, preference);
    }
  } catch {
    // Abaikan; bahasa tetap berganti untuk sesi ini.
  }
  const next = preference === "auto" ? initialLocale() : preference;
  void i18n.changeLanguage(next);
  if (typeof document !== "undefined") {
    document.documentElement.lang = next;
  }
}

if (typeof document !== "undefined") {
  document.documentElement.lang = startLocale;
}

export default i18n;
