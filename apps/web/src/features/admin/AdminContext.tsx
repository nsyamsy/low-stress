import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { adminLoginApi, adminLogoutApi, getAdminMeApi } from "./api";
import { AdminContext } from "./context";
import type { AdminMe } from "./types";

export function AdminProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminMe | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshAdmin = useCallback(async () => {
    try {
      const res = await getAdminMeApi();
      setAdmin(res.admin);
    } catch {
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const res = await getAdminMeApi();
        if (mounted) {
          setAdmin(res.admin);
        }
      } catch {
        if (mounted) {
          setAdmin(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void init();

    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await adminLoginApi(username, password);
      setAdmin(res.admin);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await adminLogoutApi();
    } finally {
      setAdmin(null);
    }
  }, []);

  return (
    <AdminContext.Provider
      value={{
        admin,
        loading,
        login,
        logout,
        refreshAdmin,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}
