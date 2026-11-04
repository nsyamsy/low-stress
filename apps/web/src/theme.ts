export const THEME_STORAGE_KEY = "low-stress.theme";

export type ThemePreference = "system" | "light" | "dark";

export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // localStorage bisa diblokir; pakai preferensi sistem.
  }
  return "system";
}

export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = preference;
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Abaikan; tema tetap berlaku untuk sesi ini.
  }
}
