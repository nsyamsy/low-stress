import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Chip, Input, Modal, SegmentedControl, Toast } from "@low-stress/ui";
import {
  getAdminSettingsApi,
  sendAdminSmtpTestApi,
  updateAdminSettingsApi,
  type AdminSettings,
} from "../../features/admin";

export function AdminSettingsPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal uji SMTP
  const [smtpModalOpen, setSmtpModalOpen] = useState(false);
  const [smtpTargetEmail, setSmtpTargetEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    let mounted = true;
    getAdminSettingsApi()
      .then((res) => {
        if (mounted) setSettings(res);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleUpdate = async (patch: Partial<Omit<AdminSettings, "smtp">>) => {
    setSaving(true);
    try {
      const res = await updateAdminSettingsApi(patch);
      setSettings(res);
      setToastMessage(t("admin.settings.saveSuccess"));
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
      setToastMessage("Email uji berhasil dikirim.");
    } catch {
      setToastMessage("Gagal mengirim email uji.");
    } finally {
      setSendingTest(false);
    }
  };

  if (loading || !settings) {
    return <p className="ls-text-secondary">{t("state.loading")}</p>;
  }

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
            onChange={(val) => handleUpdate({ registration: val as AdminSettings["registration"] })}
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
            onChange={(val) => handleUpdate({ defaultLocale: val as AdminSettings["defaultLocale"] })}
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
                handleUpdate({
                  globalSchedule: {
                    ...settings.globalSchedule,
                    enabled: e.target.checked,
                  },
                })
              }
            />
            <span style={{ fontSize: "var(--font-body)" }}>{t("admin.settings.scheduleActive")}</span>
          </label>
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
              onChange={(e) => handleUpdate({ chatEnabled: e.target.checked })}
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
                  handleUpdate({ ludoMaxPlayers: val });
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
          label="Email Tujuan"
          type="email"
          value={smtpTargetEmail}
          onChange={(e) => setSmtpTargetEmail(e.target.value)}
          placeholder="admin@example.com"
          autoFocus
        />
        <div className="ls-row" style={{ justifyContent: "flex-end", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
          <Button variant="secondary" onClick={() => setSmtpModalOpen(false)}>
            {t("action.cancel")}
          </Button>
          <Button disabled={sendingTest || !smtpTargetEmail.trim()} onClick={handleSendTestEmail}>
            {sendingTest ? t("state.loading") : "Kirim"}
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
