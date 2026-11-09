import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import "./tailwind.css";
import "@low-stress/ui/styles.css";
import { App } from "./App";
import { AuthProvider } from "./features/auth/AuthContext";
import { AdminProvider } from "./features/admin/AdminContext";
import {
  notifySwNeedRefresh,
  notifySwOfflineReady,
} from "./features/pwa/swState";
import "./i18n";
import { applyTheme, readThemePreference } from "./theme";

// Terapkan tema tersimpan sebelum render pertama agar tidak berkedip.
applyTheme(readThemePreference());

// Service worker meng-cache aset statis dan memberi tahu pengguna bila ada versi baru (D-11).
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    notifySwNeedRefresh(updateSW);
  },
  onOfflineReady() {
    notifySwOfflineReady();
  },
});

const container = document.getElementById("root");

if (!container) {
  throw new Error("Elemen #root tidak ditemukan.");
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AdminProvider>
          <App />
        </AdminProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
