import { useCallback } from "react";
import { updateProfileApi } from "./api";
import { useAuth } from "./useAuth";

export interface PreferencePatch {
  theme?: "system" | "light" | "dark";
  locale?: "auto" | "id" | "en";
}

/**
 * Simpan preferensi tema/bahasa ke akun (bila sudah login) supaya pilihan
 * ikut ke perangkat lain dan tidak tertimpa saat login berikutnya.
 * Pilihan lokal (localStorage) tetap berlaku walau penyimpanan gagal.
 */
export function useSavePreferences(): (patch: PreferencePatch) => Promise<void> {
  const { user, setUser } = useAuth();
  return useCallback(
    async (patch: PreferencePatch) => {
      if (!user) return;
      try {
        setUser(await updateProfileApi(patch));
      } catch {
        // Diabaikan: pilihan sudah tersimpan di browser.
      }
    },
    [user, setUser],
  );
}
