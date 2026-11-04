import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { Button, SegmentedControl } from "@low-stress/ui";
import { useAdmin } from "../../features/admin";
import { fetchPublicConfig } from "../../features/auth/api";
import { changeLocale, readLocalePreference, type LocalePreference } from "../../i18n";
import { applyTheme, readThemePreference, type ThemePreference } from "../../theme";
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
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const [locale, setLocale] = useState<LocalePreference>(readLocalePreference);
  const [deployMode, setDeployMode] = useState<string>("lan");
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const onThemeChange = (value: ThemePreference) => {
    setTheme(value);
    applyTheme(value);
  };

  const onLocaleChange = (value: LocalePreference) => {
    setLocale(value);
    changeLocale(value);
  };

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
      <aside className={`ls-admin-sidebar ${mobileMenuOpen ? "open" : ""}`}>
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
              className="ls-link"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "var(--space-1) var(--space-2)",
              }}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              ☰ {t("admin.nav.menu")}
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
              onChange={onLocaleChange}
            />
            <SegmentedControl
              label={t("theme.label")}
              options={THEME_OPTIONS.map((opt) => ({
                value: opt.value,
                label: t(opt.key),
              }))}
              value={theme}
              onChange={onThemeChange}
            />
            <Button
              variant="secondary"
              onClick={() => {
                logout();
              }}
            >
              {t("admin.nav.logout")}
            </Button>
          </div>
        </header>

        <main className="ls-admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
