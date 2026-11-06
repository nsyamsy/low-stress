import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button, Chip, Input, Modal, SegmentedControl } from "@low-stress/ui";
import {
  changePasswordApi,
  deleteAccountApi,
  updateProfileApi,
  useAuth,
  useSavePreferences,
  type ApiError,
} from "../features/auth";
import { changeLocale, readLocalePreference, type LocalePreference } from "../i18n";
import { applyTheme, readThemePreference, type ThemePreference } from "../theme";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; key: string }> = [
  { value: "system", key: "theme.system" },
  { value: "light", key: "theme.light" },
  { value: "dark", key: "theme.dark" },
];

const LOCALE_OPTIONS: ReadonlyArray<{ value: LocalePreference; key: string }> = [
  { value: "auto", key: "language.auto" },
  { value: "id", key: "language.id" },
  { value: "en", key: "language.en" },
];

const apiCode = (err: unknown): string | undefined =>
  (err as { apiError?: ApiError })?.apiError?.code;

type Notice = { tone: "success" | "danger"; text: string } | null;

export function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, setUser, logout } = useAuth();
  const savePreferences = useSavePreferences();

  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const [locale, setLocale] = useState<LocalePreference>(readLocalePreference);

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameNotice, setNameNotice] = useState<Notice>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);

  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!user) return null;

  const initial = (user.displayName.trim()[0] ?? user.username[0] ?? "?").toUpperCase();

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

  const onSaveName = async (e: FormEvent) => {
    e.preventDefault();
    const next = displayName.trim();
    if (!next || next === user.displayName) return;
    setSavingName(true);
    setNameNotice(null);
    try {
      setUser(await updateProfileApi({ displayName: next }));
      setNameNotice({ tone: "success", text: t("profile.saved") });
    } catch {
      setNameNotice({ tone: "danger", text: t("profile.saveFailed") });
    } finally {
      setSavingName(false);
    }
  };

  const onChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    setSavingPassword(true);
    setPasswordNotice(null);
    try {
      await changePasswordApi({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setPasswordNotice({ tone: "success", text: t("profile.password.success") });
    } catch (err) {
      const code = apiCode(err);
      setPasswordNotice({
        tone: "danger",
        text:
          code === "AUTH_INVALID_CREDENTIALS"
            ? t("profile.password.wrongCurrent")
            : code === "PASSWORD_TOO_WEAK" || code === "VALIDATION_FAILED"
              ? t("profile.password.weak")
              : t("profile.saveFailed"),
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const onLogout = async () => {
    await logout();
    navigate("/login");
  };

  const onInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
  };

  const closeDelete = () => {
    setDeleteOpen(false);
    setDeletePassword("");
    setDeleteError(null);
  };

  const onDelete = async () => {
    if (!deletePassword) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccountApi({ password: deletePassword });
      setUser(null);
      navigate("/login");
    } catch {
      setDeleteError(t("profile.danger.failed"));
    } finally {
      setDeleting(false);
    }
  };

  const noticeStyle = (tone: "success" | "danger") => ({
    background: tone === "success" ? "var(--success-bg)" : "var(--danger-bg)",
    color: tone === "success" ? "var(--success-text)" : "var(--danger-text)",
    padding: "var(--space-2) var(--space-3)",
    borderRadius: "var(--radius-control)",
    fontSize: "var(--font-small)",
  });

  return (
    <div className="ls-stack mx-auto w-full max-w-2xl" style={{ gap: "var(--space-6)" }}>
      <div className="ls-row" style={{ gap: "var(--space-4)" }}>
        <div
          aria-hidden="true"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--text-on-primary)]"
          style={{ fontSize: "var(--font-h1)", fontWeight: "var(--weight-medium)" }}
        >
          {initial}
        </div>
        <div className="ls-stack" style={{ gap: "var(--space-1)" }}>
          <h1 className="ls-heading-1">{user.displayName}</h1>
          <p className="ls-text-secondary">@{user.username}</p>
        </div>
      </div>

      <section className="ls-card ls-stack" aria-labelledby="profile-account">
        <h2 id="profile-account" className="ls-heading-2">
          {t("profile.account")}
        </h2>

        <form className="ls-stack" onSubmit={onSaveName}>
          <Input
            label={t("profile.displayName")}
            helpText={t("profile.displayNameHelp")}
            value={displayName}
            maxLength={24}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setNameNotice(null);
            }}
          />
          {nameNotice && (
            <p role="status" style={noticeStyle(nameNotice.tone)}>
              {nameNotice.text}
            </p>
          )}
          <div>
            <Button
              type="submit"
              variant="secondary"
              loading={savingName}
              disabled={!displayName.trim() || displayName.trim() === user.displayName}
            >
              {t("action.save")}
            </Button>
          </div>
        </form>

        <div className="ls-row" style={{ justifyContent: "space-between", gap: "var(--space-3)" }}>
          <div className="ls-stack" style={{ gap: "var(--space-1)" }}>
            <span className="ls-caption ls-text-secondary">{t("profile.email")}</span>
            <span>{user.email}</span>
          </div>
          <Chip tone={user.emailVerified ? "success" : "neutral"}>
            {user.emailVerified ? t("profile.emailVerified") : t("profile.emailUnverified")}
          </Chip>
        </div>
      </section>

      <section className="ls-card ls-stack" aria-labelledby="profile-preferences">
        <div className="ls-stack" style={{ gap: "var(--space-1)" }}>
          <h2 id="profile-preferences" className="ls-heading-2">
            {t("profile.preferences")}
          </h2>
          <p className="ls-text-secondary ls-caption">{t("profile.preferencesHint")}</p>
        </div>
        <div className="ls-stack" style={{ gap: "var(--space-2)" }}>
          <span className="ls-caption ls-text-secondary">{t("language.label")}</span>
          <div>
            <SegmentedControl
              label={t("language.label")}
              options={LOCALE_OPTIONS.map((o) => ({ value: o.value, label: t(o.key) }))}
              value={locale}
              onChange={onLocaleChange}
            />
          </div>
        </div>
        <div className="ls-stack" style={{ gap: "var(--space-2)" }}>
          <span className="ls-caption ls-text-secondary">{t("theme.label")}</span>
          <div>
            <SegmentedControl
              label={t("theme.label")}
              options={THEME_OPTIONS.map((o) => ({ value: o.value, label: t(o.key) }))}
              value={theme}
              onChange={onThemeChange}
            />
          </div>
        </div>
      </section>

      <section className="ls-card ls-stack" aria-labelledby="profile-password">
        <h2 id="profile-password" className="ls-heading-2">
          {t("profile.password.title")}
        </h2>
        <form className="ls-stack" onSubmit={onChangePassword}>
          <Input
            label={t("profile.password.current")}
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
              setPasswordNotice(null);
            }}
          />
          <Input
            label={t("profile.password.new")}
            type="password"
            autoComplete="new-password"
            helpText={t("auth.register.passwordHelp")}
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setPasswordNotice(null);
            }}
          />
          {passwordNotice && (
            <p role="status" style={noticeStyle(passwordNotice.tone)}>
              {passwordNotice.text}
            </p>
          )}
          <div>
            <Button
              type="submit"
              variant="secondary"
              loading={savingPassword}
              disabled={!currentPassword || !newPassword}
            >
              {t("profile.password.submit")}
            </Button>
          </div>
        </form>
      </section>

      {installPrompt && (
        <section className="ls-card ls-stack" aria-labelledby="profile-install">
          <div className="ls-stack" style={{ gap: "var(--space-1)" }}>
            <h2 id="profile-install" className="ls-heading-2">
              {t("profile.install.title")}
            </h2>
            <p className="ls-text-secondary">{t("profile.install.description")}</p>
          </div>
          <div>
            <Button variant="secondary" onClick={onInstall}>
              {t("profile.install.action")}
            </Button>
          </div>
        </section>
      )}

      <section className="ls-card ls-stack" aria-labelledby="profile-session">
        <h2 id="profile-session" className="ls-heading-2">
          {t("profile.session")}
        </h2>
        <div>
          <Button variant="secondary" onClick={onLogout}>
            {t("nav.logout")}
          </Button>
        </div>
      </section>

      <section className="ls-card ls-stack" aria-labelledby="profile-danger">
        <div className="ls-stack" style={{ gap: "var(--space-1)" }}>
          <h2 id="profile-danger" className="ls-heading-2" style={{ color: "var(--danger-text)" }}>
            {t("profile.danger.title")}
          </h2>
          <p className="ls-text-secondary">{t("profile.danger.warning")}</p>
        </div>
        <div>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            {t("profile.danger.action")}
          </Button>
        </div>
      </section>

      <Modal
        open={deleteOpen}
        title={t("profile.danger.confirmTitle")}
        closeLabel={t("action.close")}
        onClose={closeDelete}
        footer={
          <>
            <Button variant="secondary" onClick={closeDelete}>
              {t("action.cancel")}
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              disabled={!deletePassword}
              onClick={onDelete}
            >
              {t("profile.danger.confirm")}
            </Button>
          </>
        }
      >
        <div className="ls-stack">
          <p>{t("profile.danger.confirmBody")}</p>
          <Input
            label={t("profile.danger.password")}
            type="password"
            autoComplete="current-password"
            value={deletePassword}
            error={deleteError ?? undefined}
            onChange={(e) => {
              setDeletePassword(e.target.value);
              setDeleteError(null);
            }}
          />
        </div>
      </Modal>
    </div>
  );
}
