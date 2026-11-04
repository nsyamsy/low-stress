export const THEME_STORAGE_KEY = "low-stress.theme";

export type ThemePreference = "system" | "light" | "dark";

export function readThemePreference(): ThemePreference {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "light" || stored === "dark" || stored === "system") {
        return stored;
      }
    }
  } catch {
    // localStorage bisa diblokir; pakai preferensi sistem.
  }
  return "system";
}

export function applyTheme(preference: ThemePreference): void {
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    if (preference === "system") {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = preference;
    }
  }
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // Abaikan; tema tetap berlaku untuk sesi ini.
  }
}
