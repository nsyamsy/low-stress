import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { Button, SegmentedControl } from "@low-stress/ui";
import { useAdmin } from "../../features/admin";
import { fetchPublicConfig } from "../../features/auth/api";
import { usePreferences } from "../../features/preferences/usePreferences";
import type { LocalePreference } from "../../i18n";
import type { ThemePreference } from "../../theme";
import { getAdminDashboardApi } from "../../features/admin/api";

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; key: string }> = [
  { value: "system", key: "theme.system" },
  { value: "light", key: "theme.light" },
  { value: "dark", key: "theme.dark" },
];

const LOCALE_OPTIONS: ReadonlyArray<{ value: LocalePreference; key: string }> = [
  { value: "id", key: "language.id" },
  { value: "en", key: "language.en" },
];

export function AdminLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const { admin, loading, logout } = useAdmin();
  const { theme, locale, setTheme, setLocale } = usePreferences({
    persistToAccount: false,
  });
  const [deployMode, setDeployMode] = useState<string>("lan");
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Laci menu (layar sempit): tutup dengan Esc.
  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileMenuOpen]);

  useEffect(() => {
    fetchPublicConfig()
      .then((cfg) => setDeployMode(cfg.deployMode))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (admin) {
      getAdminDashboardApi()
        .then((dash) => setPendingCount(dash.pending))
        .catch(() => undefined);
    }
  }, [admin, location.pathname]);

  if (loading) {
    return (
      <div className="ls-auth-page">
        <p className="ls-text-secondary">{t("state.loading")}</p>
      </div>
    );
  }

  if (!admin) {
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <div className="ls-admin-layout">
      <a href="#admin-main-content" className="ls-skip-link">
        {t("nav.skipToContent")}
      </a>
      {/* Sidebar Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          role="button"
          tabIndex={0}
          aria-label={t("admin.nav.menu")}
          className="ls-admin-sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Enter") setMobileMenuOpen(false);
          }}
        />
      )}

      {/* Sidebar */}
      <aside
        id="admin-sidebar"
        className={`ls-admin-sidebar ${mobileMenuOpen ? "open" : ""}`}
      >
        <div className="ls-admin-sidebar-header">
          <h2 className="ls-admin-sidebar-title">{t("admin.nav.title")}</h2>
          <span style={{ fontSize: "var(--font-caption)", opacity: 0.8 }}>
            @{admin.username}
          </span>
        </div>

        <nav className="ls-admin-nav">
          <NavLink
            to="/admin"
            end
            className={({ isActive }) =>
              `ls-admin-nav-item ${isActive ? "active" : ""}`
            }
            onClick={() => setMobileMenuOpen(false)}
          >
            <span>{t("admin.nav.dashboard")}</span>
          </NavLink>

          <NavLink
            to="/admin/approvals"
            className={({ isActive }) =>
              `ls-admin-nav-item ${isActive ? "active" : ""}`
            }
            onClick={() => setMobileMenuOpen(false)}
          >
            <span>{t("admin.nav.approvals")}</span>
            {pendingCount > 0 && (
              <span className="ls-admin-badge">{pendingCount}</span>
            )}
          </NavLink>

          <NavLink
            to="/admin/users"
            className={({ isActive }) =>
              `ls-admin-nav-item ${isActive ? "active" : ""}`
            }
            onClick={() => setMobileMenuOpen(false)}
          >
            <span>{t("admin.nav.users")}</span>
          </NavLink>

          <NavLink
            to="/admin/games"
            className={({ isActive }) =>
              `ls-admin-nav-item ${isActive ? "active" : ""}`
            }
            onClick={() => setMobileMenuOpen(false)}
          >
            <span>{t("admin.nav.games")}</span>
          </NavLink>

          <NavLink
            to="/admin/leaderboard"
            className={({ isActive }) =>
              `ls-admin-nav-item ${isActive ? "active" : ""}`
            }
            onClick={() => setMobileMenuOpen(false)}
          >
            <span>{t("admin.nav.leaderboard")}</span>
          </NavLink>

          <NavLink
            to="/admin/chat"
            className={({ isActive }) =>
              `ls-admin-nav-item ${isActive ? "active" : ""}`
            }
            onClick={() => setMobileMenuOpen(false)}
          >
            <span>{t("admin.nav.chat")}</span>
          </NavLink>

          <NavLink
            to="/admin/ludo"
            className={({ isActive }) =>
              `ls-admin-nav-item ${isActive ? "active" : ""}`
            }
            onClick={() => setMobileMenuOpen(false)}
          >
            <span>{t("admin.nav.ludo")}</span>
          </NavLink>

          <NavLink
            to="/admin/riot"
            className={({ isActive }) =>
              `ls-admin-nav-item ${isActive ? "active" : ""}`
            }
            onClick={() => setMobileMenuOpen(false)}
          >
            <span>{t("admin.nav.riot")}</span>
          </NavLink>

          <NavLink
            to="/admin/settings"
            className={({ isActive }) =>
              `ls-admin-nav-item ${isActive ? "active" : ""}`
            }
            onClick={() => setMobileMenuOpen(false)}
          >
            <span>{t("admin.nav.settings")}</span>
          </NavLink>

          <NavLink
            to="/admin/audit"
            className={({ isActive }) =>
              `ls-admin-nav-item ${isActive ? "active" : ""}`
            }
            onClick={() => setMobileMenuOpen(false)}
          >
            <span>{t("admin.nav.audit")}</span>
          </NavLink>

          <div style={{ marginTop: "auto", paddingTop: "var(--space-4)" }}>
            <Link
              to="/"
              className="ls-admin-nav-item"
              style={{ opacity: 0.8 }}
              onClick={() => setMobileMenuOpen(false)}
            >
              ← {t("admin.nav.backToSite")}
            </Link>
          </div>
        </nav>
      </aside>

      {/* Main Area */}
      <div className="ls-admin-main">
        <header className="ls-admin-header">
          <div className="ls-row" style={{ gap: "var(--space-3)" }}>
            <button
              type="button"
              className="ls-link ls-admin-menu-toggle"
              aria-expanded={mobileMenuOpen}
              aria-controls="admin-sidebar"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
              <span>{t("admin.nav.menu")}</span>
            </button>
            <span className="ls-admin-badge--deploy">
              {t("admin.header.deployMode", { mode: deployMode.toUpperCase() })}
            </span>
          </div>

          <div className="ls-row" style={{ gap: "var(--space-3)" }}>
            <SegmentedControl
              label={t("language.label")}
              options={LOCALE_OPTIONS.map((opt) => ({
                value: opt.value,
                label: t(opt.key),
              }))}
              value={locale}
              onChange={setLocale}
            />
            <SegmentedControl
              label={t("theme.label")}
              options={THEME_OPTIONS.map((opt) => ({
                value: opt.value,
                label: t(opt.key),
              }))}
              value={theme}
              onChange={setTheme}
            />
            <Button
              variant="secondary"
              onClick={() => {
                void logout();
              }}
            >
              {t("admin.nav.logout")}
            </Button>
          </div>
        </header>

        <main id="admin-main-content" className="ls-admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
