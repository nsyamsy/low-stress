import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Logo, SegmentedControl } from "@low-stress/ui";
import { useAuth } from "./features/auth";
import { changeLocale, readLocalePreference, type LocalePreference } from "./i18n";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { PendingPage } from "./pages/PendingPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ShowcasePage } from "./pages/ShowcasePage";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { AdminLoginPage } from "./pages/admin/AdminLoginPage";
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { AdminApprovalsPage } from "./pages/admin/AdminApprovalsPage";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage";
import { AdminGamesPage } from "./pages/admin/AdminGamesPage";
import { AdminSettingsPage } from "./pages/admin/AdminSettingsPage";
import { AdminAuditPage } from "./pages/admin/AdminAuditPage";
import { GameStatusPage } from "./pages/GameStatusPage";
import { GamePage } from "./pages/GamePage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { applyTheme, readThemePreference, type ThemePreference } from "./theme";

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; key: string }> = [
  { value: "system", key: "theme.system" },
  { value: "light", key: "theme.light" },
  { value: "dark", key: "theme.dark" },
];

const LOCALE_OPTIONS: ReadonlyArray<{ value: LocalePreference; key: string }> = [
  { value: "id", key: "language.id" },
  { value: "en", key: "language.en" },
];

export function App() {
  const { t } = useTranslation();
  const location = useLocation();
  const { user, loading } = useAuth();
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const [locale, setLocale] = useState<LocalePreference>(readLocalePreference);

  useEffect(() => {
    applyTheme(readThemePreference());
  }, []);

  const onThemeChange = (value: ThemePreference) => {
    setTheme(value);
    applyTheme(value);
  };

  const onLocaleChange = (value: LocalePreference) => {
    setLocale(value);
    changeLocale(value);
  };

  // Rute panel admin mandiri
  if (location.pathname.startsWith("/admin")) {
    return (
      <Routes>
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="approvals" element={<AdminApprovalsPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="games" element={<AdminGamesPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
          <Route path="audit" element={<AdminAuditPage />} />
        </Route>
      </Routes>
    );
  }

  if (loading) {
    return (
      <div className="ls-auth-page">
        <p className="ls-text-secondary">{t("state.loading")}</p>
      </div>
    );
  }

  return (
    <>
      <header className="ls-app-header">
        <div className="ls-container ls-app-header__inner">
          <div className="ls-row">
            <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>
              <Logo variant="horizontal" height={36} />
            </Link>
            <nav className="ls-nav-links">
              <Link to="/" className="ls-nav-link">
                {t("nav.home")}
              </Link>
              <Link to="/leaderboard" className="ls-nav-link">
                {t("nav.leaderboard")}
              </Link>
            </nav>
          </div>
          <div className="ls-row">
            <SegmentedControl
              label={t("language.label")}
              options={LOCALE_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.key),
              }))}
              value={locale}
              onChange={onLocaleChange}
            />
            <SegmentedControl
              label={t("theme.label")}
              options={THEME_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.key),
              }))}
              value={theme}
              onChange={onThemeChange}
            />
          </div>
        </div>
      </header>

      <main className="ls-container ls-app-main">
        <Routes>
          <Route
            path="/login"
            element={
              user ? (
                user.status === "pending" ? (
                  <Navigate to="/pending" replace />
                ) : (
                  <Navigate to="/" replace />
                )
              ) : (
                <LoginPage />
              )
            }
          />
          <Route
            path="/register"
            element={
              user ? (
                user.status === "pending" ? (
                  <Navigate to="/pending" replace />
                ) : (
                  <Navigate to="/" replace />
                )
              ) : (
                <RegisterPage />
              )
            }
          />
          <Route
            path="/pending"
            element={
              !user ? (
                <Navigate to="/login" replace />
              ) : user.status === "active" ? (
                <Navigate to="/" replace />
              ) : (
                <PendingPage />
              )
            }
          />
          <Route
            path="/"
            element={
              !user ? (
                <Navigate to="/login" replace />
              ) : user.status === "pending" ? (
                <Navigate to="/pending" replace />
              ) : (
                <HomePage />
              )
            }
          />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route
            path="/games/:id/status"
            element={
              !user ? (
                <Navigate to="/login" replace />
              ) : user.status === "pending" ? (
                <Navigate to="/pending" replace />
              ) : (
                <GameStatusPage />
              )
            }
          />
          <Route
            path="/games/:id"
            element={
              !user ? (
                <Navigate to="/login" replace />
              ) : user.status === "pending" ? (
                <Navigate to="/pending" replace />
              ) : (
                <GamePage />
              )
            }
          />
          <Route path="/showcase" element={<ShowcasePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <footer className="ls-footer">{t("app.tagline")}</footer>
      </main>
    </>
  );
}
