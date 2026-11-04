import { useEffect, useState, type ReactNode } from "react";
import { changeLocale } from "../../i18n";
import { applyTheme } from "../../theme";
import {
  fetchCsrfToken,
  fetchPublicConfig,
  getMeApi,
  loginApi,
  logoutApi,
} from "./api";
import { AuthContext } from "./context";
import type { Me, PublicConfig } from "./types";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [publicConfig, setPublicConfig] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const applyUserPreferences = (userObj: Me) => {
    if (userObj.locale === "id" || userObj.locale === "en") {
      changeLocale(userObj.locale);
    }
    if (
      userObj.theme === "light" ||
      userObj.theme === "dark" ||
      userObj.theme === "system"
    ) {
      applyTheme(userObj.theme);
    }
  };

  const refreshUser = async () => {
    try {
      const me = await getMeApi();
      setUser(me);
      applyUserPreferences(me);
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
          applyUserPreferences(me);
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
    applyUserPreferences(res.user);
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
