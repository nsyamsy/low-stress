import { useCallback, useEffect, useState } from "react";
import {
  changeLocale,
  readLocalePreference,
  subscribeLocale,
  type LocalePreference,
} from "../../i18n";
import {
  applyTheme,
  readThemePreference,
  subscribeTheme,
  type ThemePreference,
} from "../../theme";
import { useSavePreferences } from "../auth/useSavePreferences";

export interface UsePreferencesOptions {
  /**
   * Simpan perubahan ke akun pemain bila sedang login.
   * Pada panel admin wajib `false` agar admin tidak memanggil API pemain (R-07).
   */
  persistToAccount?: boolean;
}

export interface UsePreferencesResult {
  theme: ThemePreference;
  locale: LocalePreference;
  setTheme: (value: ThemePreference) => void;
  setLocale: (value: LocalePreference) => void;
}

export function usePreferences(
  options: UsePreferencesOptions = {},
): UsePreferencesResult {
  const { persistToAccount = true } = options;
  const savePreferences = useSavePreferences();
  const [theme, setThemeState] = useState<ThemePreference>(readThemePreference);
  const [locale, setLocaleState] = useState<LocalePreference>(readLocalePreference);

  useEffect(() => {
    const unsubTheme = subscribeTheme((nextTheme) => {
      setThemeState(nextTheme);
    });
    const unsubLocale = subscribeLocale((nextLocale) => {
      setLocaleState(nextLocale);
    });
    return () => {
      unsubTheme();
      unsubLocale();
    };
  }, []);

  const setTheme = useCallback(
    (value: ThemePreference) => {
      setThemeState(value);
      applyTheme(value);
      if (persistToAccount) {
        void savePreferences({ theme: value });
      }
    },
    [persistToAccount, savePreferences],
  );

  const setLocale = useCallback(
    (value: LocalePreference) => {
      setLocaleState(value);
      changeLocale(value);
      if (persistToAccount) {
        void savePreferences({ locale: value });
      }
    },
    [persistToAccount, savePreferences],
  );

  return {
    theme,
    locale,
    setTheme,
    setLocale,
  };
}
