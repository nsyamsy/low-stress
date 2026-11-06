import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Button, Logo, SegmentedControl } from "@low-stress/ui";
import { useAuth, useSavePreferences } from "./features/auth";
import { ProfilePage } from "./pages/ProfilePage";
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
import { AdminChatPage } from "./pages/admin/AdminChatPage";
import { AdminLeaderboardPage } from "./pages/admin/AdminLeaderboardPage";
import { GameStatusPage } from "./pages/GameStatusPage";
import { GamePage } from "./pages/GamePage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { PublicChatPanel } from "./features/chat/PublicChatPanel";
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
  const navigate = useNavigate();
  const { user, loading, logout } = useAuth();
  const savePreferences = useSavePreferences();
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const [locale, setLocale] = useState<LocalePreference>(readLocalePreference);

  useEffect(() => {
    applyTheme(readThemePreference());
  }, []);

  const onThemeChange = (value: ThemePreference) => {
    setTheme(value);
    applyTheme(value);
    void savePreferences({ theme: value });
  };

  const onLocaleChange = (value: LocalePreference) => {
    setLocale(value);
    changeLocale(value);
    void savePreferences({ locale: value });
  };

  const onLogout = async () => {
    await logout();
    navigate("/login");
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
          <Route path="leaderboard" element={<AdminLeaderboardPage />} />
          <Route path="chat" element={<AdminChatPage />} />
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
      <a href="#main-content" className="ls-skip-link">
        {t("nav.skipToContent")}
      </a>
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
              {user?.status === "active" && (
                <Link to="/profile" className="ls-nav-link">
                  {t("nav.profile")}
                </Link>
              )}
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
            {user && (
              <Button variant="secondary" onClick={onLogout}>
                {t("nav.logout")}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main id="main-content" className="ls-container ls-app-main">
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
            path="/profile"
            element={
              !user ? (
                <Navigate to="/login" replace />
              ) : user.status === "pending" ? (
                <Navigate to="/pending" replace />
              ) : (
                <ProfilePage />
              )
            }
          />
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
          <Route
            path="/games/:id/:roomId"
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
        <PublicChatPanel />
        <footer className="ls-footer">{t("app.tagline")}</footer>
      </main>
    </>
  );
}
