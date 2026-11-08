export const THEME_STORAGE_KEY = "low-stress.theme";

export type ThemePreference = "system" | "light" | "dark";

const themeListeners = new Set<(theme: ThemePreference) => void>();

export function subscribeTheme(
  listener: (theme: ThemePreference) => void,
): () => void {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

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
  if (typeof document !== "undefined" && document.documentElement) {
    const root = document.documentElement;
    if (preference === "system") {
      if (root.dataset) {
        delete root.dataset.theme;
      } else if (typeof root.removeAttribute === "function") {
        root.removeAttribute("data-theme");
      }
    } else if (root.dataset) {
      root.dataset.theme = preference;
    } else if (typeof root.setAttribute === "function") {
      root.setAttribute("data-theme", preference);
    }
  }
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // Abaikan; tema tetap berlaku untuk sesi ini.
  }
  for (const listener of themeListeners) {
    listener(preference);
  }
}
