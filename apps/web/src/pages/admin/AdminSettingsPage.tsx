import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateErrorCode } from "@low-stress/i18n";
import { Button, Chip, Input, Modal, SegmentedControl, Toast } from "@low-stress/ui";
import {
  getAdminSettingsApi,
  sendAdminSmtpTestApi,
  updateAdminSettingsApi,
  type AdminSettings,
} from "../../features/admin";
import type { ApiError } from "../../lib/apiFetch";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export function AdminSettingsPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal uji SMTP
  const [smtpModalOpen, setSmtpModalOpen] = useState(false);
  const [smtpTargetEmail, setSmtpTargetEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  const loadSettings = useCallback(() => {
    setLoading(true);
    setError(null);
    getAdminSettingsApi()
      .then((res) => {
        setSettings(res);
      })
      .catch((err: unknown) => {
        const apiError = (err as { apiError?: ApiError })?.apiError;
        setError(
          apiError?.code
            ? translateErrorCode(apiError.code, apiError.params)
            : t("state.error"),
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [t]);

  useEffect(() => {
    let mounted = true;
    getAdminSettingsApi()
      .then((res) => {
        if (mounted) setSettings(res);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        const apiError = (err as { apiError?: ApiError })?.apiError;
        setError(
          apiError?.code
            ? translateErrorCode(apiError.code, apiError.params)
            : t("state.error"),
        );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [t]);

  const handleUpdate = async (patch: Partial<Omit<AdminSettings, "smtp">>) => {
    setSaving(true);
    try {
      const res = await updateAdminSettingsApi(patch);
      setSettings(res);
      setToastMessage(t("admin.settings.saveSuccess"));
    } catch (err: unknown) {
      const apiError = (err as { apiError?: ApiError })?.apiError;
      setToastMessage(
        apiError?.code
          ? translateErrorCode(apiError.code, apiError.params)
          : t("state.error"),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!smtpTargetEmail.trim()) return;
    setSendingTest(true);
    try {
      await sendAdminSmtpTestApi(smtpTargetEmail.trim());
      setSmtpModalOpen(false);
      setToastMessage(t("admin.settings.testEmailSuccess"));
    } catch {
      setToastMessage(t("admin.settings.testEmailFailed"));
    } finally {
      setSendingTest(false);
    }
  };

  if (loading) {
    return <p className="ls-text-secondary">{t("state.loading")}</p>;
  }

  if (error || !settings) {
    return (
      <div className="ls-admin-card" style={{ textAlign: "center", padding: "var(--space-6)" }}>
        <p className="ls-text-secondary" style={{ marginBottom: "var(--space-3)" }}>
          {error ?? t("state.error")}
        </p>
        <Button variant="secondary" onClick={loadSettings}>
          {t("action.tryAgain")}
        </Button>
      </div>
    );
  }

  const toggleDay = (day: number) => {
    const current = settings.globalSchedule.days;
    const nextDays = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort();
    void handleUpdate({
      globalSchedule: {
        ...settings.globalSchedule,
        days: nextDays,
      },
    });
  };

  return (
    <div>
      <h1 style={{ fontSize: "var(--font-h1)", marginBottom: "var(--space-6)" }}>
        {t("admin.settings.title")}
      </h1>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {/* 1. Mode Pendaftaran */}
        <div className="ls-admin-card">
          <h2 style={{ fontSize: "var(--font-h2)", marginTop: 0, marginBottom: "var(--space-2)" }}>
            {t("admin.settings.registration")}
          </h2>
          <SegmentedControl
            label={t("admin.settings.registration")}
            options={[
              { value: "approval", label: t("admin.settings.regApproval") },
              { value: "open", label: t("admin.settings.regOpen") },
              { value: "closed", label: t("admin.settings.regClosed") },
            ]}
            value={settings.registration}
            onChange={(val) => void handleUpdate({ registration: val as AdminSettings["registration"] })}
          />
        </div>

        {/* 2. Bahasa Bawaan */}
        <div className="ls-admin-card">
          <h2 style={{ fontSize: "var(--font-h2)", marginTop: 0, marginBottom: "var(--space-2)" }}>
            {t("admin.settings.defaultLocale")}
          </h2>
          <SegmentedControl
            label={t("admin.settings.defaultLocale")}
            options={[
              { value: "auto", label: t("admin.settings.localeAuto") },
              { value: "id", label: t("admin.settings.localeId") },
              { value: "en", label: t("admin.settings.localeEn") },
            ]}
            value={settings.defaultLocale}
            onChange={(val) => void handleUpdate({ defaultLocale: val as AdminSettings["defaultLocale"] })}
          />
        </div>

        {/* 3. Jadwal Global */}
        <div className="ls-admin-card">
          <h2 style={{ fontSize: "var(--font-h2)", marginTop: 0, marginBottom: "var(--space-2)" }}>
            {t("admin.settings.globalSchedule")}
          </h2>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={settings.globalSchedule.enabled}
              disabled={saving}
              onChange={(e) =>
                void handleUpdate({
                  globalSchedule: {
                    ...settings.globalSchedule,
                    enabled: e.target.checked,
                  },
                })
              }
            />
            <span style={{ fontSize: "var(--font-body)" }}>{t("admin.settings.scheduleActive")}</span>
          </label>

          {settings.globalSchedule.enabled && (
            <div className="ls-stack" style={{ gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
              <div className="ls-stack" style={{ gap: "var(--space-2)" }}>
                <span style={{ fontSize: "var(--font-caption)", color: "var(--text-secondary)" }}>
                  {t("admin.schedule.windows")}
                </span>
                {settings.globalSchedule.windows.map((win, idx) => (
                  <div key={idx} className="ls-row" style={{ gap: "var(--space-2)", alignItems: "flex-end" }}>
                    <div style={{ flex: 1 }}>
                      <Input
                        label={t("admin.schedule.start")}
                        type="time"
                        value={win.start}
                        onChange={(e) => {
                          const next = [...settings.globalSchedule.windows];
                          next[idx] = { ...win, start: e.target.value };
                          void handleUpdate({
                            globalSchedule: {
                              ...settings.globalSchedule,
                              windows: next,
                            },
                          });
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <Input
                        label={t("admin.schedule.end")}
                        type="time"
                        value={win.end}
                        onChange={(e) => {
                          const next = [...settings.globalSchedule.windows];
                          next[idx] = { ...win, end: e.target.value };
                          void handleUpdate({
                            globalSchedule: {
                              ...settings.globalSchedule,
                              windows: next,
                            },
                          });
                        }}
                      />
                    </div>
                    {settings.globalSchedule.windows.length > 1 && (
                      <Button
                        variant="secondary"
                        disabled={saving}
                        onClick={() =>
                          void handleUpdate({
                            globalSchedule: {
                              ...settings.globalSchedule,
                              windows: settings.globalSchedule.windows.filter((_, i) => i !== idx),
                            },
                          })
                        }
                      >
                        {t("admin.schedule.removeWindow")}
                      </Button>
                    )}
                  </div>
                ))}
                <div>
                  <Button
                    variant="secondary"
                    disabled={saving}
                    onClick={() =>
                      void handleUpdate({
                        globalSchedule: {
                          ...settings.globalSchedule,
                          windows: [
                            ...settings.globalSchedule.windows,
                            { start: "17:00", end: "22:00" },
                          ],
                        },
                      })
                    }
                  >
                    {t("admin.schedule.addWindow")}
                  </Button>
                </div>
              </div>

              <div className="ls-stack" style={{ gap: "var(--space-2)" }}>
                <span style={{ fontSize: "var(--font-caption)", color: "var(--text-secondary)" }}>
                  {t("admin.schedule.days")}
                </span>
                <div className="ls-row" style={{ flexWrap: "wrap", gap: "var(--space-2)" }}>
                  {ALL_DAYS.map((day) => {
                    const active = settings.globalSchedule.days.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        disabled={saving}
                        className={`ls-chip ${active ? "ls-chip--success" : "ls-chip--neutral"}`}
                        style={{ cursor: "pointer", border: "none" }}
                        onClick={() => toggleDay(day)}
                      >
                        {t(`days.${day}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 4. Chat Publik */}
        <div className="ls-admin-card">
          <h2 style={{ fontSize: "var(--font-h2)", marginTop: 0, marginBottom: "var(--space-2)" }}>
            {t("admin.settings.chat")}
          </h2>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={settings.chatEnabled}
              disabled={saving}
              onChange={(e) => void handleUpdate({ chatEnabled: e.target.checked })}
            />
            <span style={{ fontSize: "var(--font-body)" }}>{t("admin.settings.chatEnabled")}</span>
          </label>
        </div>

        {/* 5. Ludo */}
        <div className="ls-admin-card">
          <h2 style={{ fontSize: "var(--font-h2)", marginTop: 0, marginBottom: "var(--space-2)" }}>
            {t("admin.settings.ludo")}
          </h2>
          <div className="ls-admin-filter-control">
            <Input
              label={t("admin.settings.ludoMaxPlayers")}
              type="number"
              value={String(settings.ludoMaxPlayers)}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (val >= 2 && val <= 12) {
                  void handleUpdate({ ludoMaxPlayers: val });
                }
              }}
            />
          </div>
        </div>

        {/* 6. Email (SMTP) */}
        <div className="ls-admin-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
            <h2 style={{ fontSize: "var(--font-h2)", margin: 0 }}>
              {t("admin.settings.smtp")}
            </h2>
            <Chip tone={settings.smtp.configured ? "success" : "warning"}>
              {settings.smtp.configured
                ? t("admin.settings.smtpConfigured")
                : t("admin.settings.smtpNotConfigured")}
            </Chip>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-small)", margin: "var(--space-2) 0 var(--space-4)" }}>
            {t("admin.settings.smtpNotice")}
          </p>
          <Button
            variant="secondary"
            disabled={!settings.smtp.configured}
            onClick={() => setSmtpModalOpen(true)}
          >
            {t("admin.settings.testEmail")}
          </Button>
        </div>
      </div>

      {/* SMTP Test Email Modal */}
      <Modal
        open={smtpModalOpen}
        onClose={() => setSmtpModalOpen(false)}
        title={t("admin.settings.testEmail")}
        closeLabel={t("action.close")}
      >
        <p style={{ color: "var(--text-secondary)", margin: "var(--space-2) 0 var(--space-4)" }}>
          {t("admin.settings.testEmailPrompt")}
        </p>
        <Input
          label={t("admin.settings.testEmailLabel")}
          type="email"
          value={smtpTargetEmail}
          onChange={(e) => setSmtpTargetEmail(e.target.value)}
          placeholder={t("admin.settings.testEmailPlaceholder")}
          autoFocus
        />
        <div className="ls-row" style={{ justifyContent: "flex-end", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
          <Button variant="secondary" onClick={() => setSmtpModalOpen(false)}>
            {t("action.cancel")}
          </Button>
          <Button disabled={sendingTest || !smtpTargetEmail.trim()} onClick={() => void handleSendTestEmail()}>
            {sendingTest ? t("state.loading") : t("action.send")}
          </Button>
        </div>
      </Modal>

      {/* Toast Notification */}
      {toastMessage && (
        <Toast
          open={Boolean(toastMessage)}
          message={toastMessage}
          tone="success"
          closeLabel={t("action.close")}
          onDismiss={() => setToastMessage(null)}
        />
      )}
    </div>
  );
}
