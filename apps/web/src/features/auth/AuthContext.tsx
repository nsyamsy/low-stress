import { useEffect, useState, type ReactNode } from "react";
import { changeLocale, readLocalePreference } from "../../i18n";
import { applyTheme, readThemePreference } from "../../theme";
import {
  fetchCsrfToken,
  fetchPublicConfig,
  getMeApi,
  loginApi,
  logoutApi,
  updateProfileApi,
} from "./api";
import { AuthContext } from "./context";
import type { Me, PublicConfig } from "./types";

/**
 * Pilihan eksplisit di akun menang. Bila akun masih bawaan ("system"/"auto"),
 * pilihan di browser dipertahankan lalu disimpan ke akun, sehingga login
 * tidak mengembalikan tema atau bahasa ke bawaan (D-02g).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function applyUserPreferences(
  userObj: Me,
  onUserUpdated?: (me: Me) => void,
  persistFn: typeof updateProfileApi = updateProfileApi,
): { theme: Me["theme"]; locale: Me["locale"]; patch: { theme?: Me["theme"]; locale?: Me["locale"] } } {
  const localTheme = readThemePreference();
  const localLocale = readLocalePreference();
  const theme = userObj.theme !== "system" ? userObj.theme : localTheme;
  const locale = userObj.locale !== "auto" ? userObj.locale : localLocale;

  applyTheme(theme);
  changeLocale(locale);

  const patch: { theme?: Me["theme"]; locale?: Me["locale"] } = {};
  if (userObj.theme === "system" && localTheme !== "system") patch.theme = localTheme;
  if (userObj.locale === "auto" && localLocale !== "auto") patch.locale = localLocale;
  if (patch.theme || patch.locale) {
    void persistFn(patch)
      .then((me) => {
        if (onUserUpdated) onUserUpdated(me);
      })
      .catch(() => undefined);
  }

  return { theme, locale, patch };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [publicConfig, setPublicConfig] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const me = await getMeApi();
      setUser(me);
      applyUserPreferences(me, setUser);
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        await fetchCsrfToken().catch(() => null);
        const config = await fetchPublicConfig().catch(() => null);
        if (mounted && config) {
          setPublicConfig(config);
        }

        const me = await getMeApi().catch(() => null);
        if (mounted && me) {
          setUser(me);
          applyUserPreferences(me, (updated) => {
            if (mounted) setUser(updated);
          });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void init();

    return () => {
      mounted = false;
    };
  }, []);

  const login = async (credentials: { username: string; password: string }) => {
    const res = await loginApi(credentials);
    setUser(res.user);
    applyUserPreferences(res.user, setUser);
    return res.user;
  };

  const logout = async () => {
    try {
      await logoutApi();
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        publicConfig,
        refreshUser,
        login,
        logout,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
