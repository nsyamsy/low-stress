import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { Logo, SegmentedControl } from "@low-stress/ui";
import { useAuth } from "./features/auth";
import { changeLocale, readLocalePreference, type LocalePreference } from "./i18n";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { PendingPage } from "./pages/PendingPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ShowcasePage } from "./pages/ShowcasePage";
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
          <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>
            <Logo variant="horizontal" height={36} />
          </Link>
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
          <Route path="/showcase" element={<ShowcasePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <footer className="ls-footer">{t("app.tagline")}</footer>
      </main>
    </>
  );
}
