import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { translateErrorCode } from "@low-stress/i18n";
import { Button, Input, Logo } from "@low-stress/ui";
import { useAdmin } from "../../features/admin";

export function AdminLoginPage({
  initialErrorCode,
  initialRetryAfterSec,
}: {
  initialErrorCode?: string;
  initialRetryAfterSec?: number;
} = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { admin, login } = useAdmin();

  const mapError = (code?: string, params?: Record<string, unknown>): string => {
    if (code === "AUTH_LOCKED") {
      const seconds = (params?.retryAfterSec as number | undefined) ?? 60;
      return t("auth.login.lockoutMessage", { seconds });
    }
    if (code) {
      return translateErrorCode(code, params);
    }
    return t("auth.error.generic");
  };

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(
    initialErrorCode
      ? mapError(initialErrorCode, { retryAfterSec: initialRetryAfterSec })
      : null,
  );

  if (admin) {
    return <Navigate to="/admin" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setSubmitting(true);
    setErrorMsg(null);

    try {
      await login(username.trim(), password);
      navigate("/admin");
    } catch (err: unknown) {
      const apiError = (
        err as { apiError?: { code?: string; params?: Record<string, unknown> } }
      )?.apiError;
      setErrorMsg(mapError(apiError?.code, apiError?.params));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ls-auth-page">
      <div className="ls-auth-card">
        <div style={{ textAlign: "center", marginBottom: "var(--space-6)" }}>
          <Logo variant="horizontal" height={36} />
          <h1
            style={{
              fontSize: "var(--font-h1)",
              color: "var(--text-primary)",
              marginTop: "var(--space-4)",
              marginBottom: "var(--space-1)",
            }}
          >
            {t("admin.login.title")}
          </h1>
          <p
            style={{
              fontSize: "var(--font-small)",
              color: "var(--text-secondary)",
              margin: 0,
            }}
          >
            {t("admin.login.subtitle")}
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            style={{
              background: "var(--danger-bg)",
              color: "var(--danger-text)",
              padding: "var(--space-3)",
              borderRadius: "var(--radius-control)",
              fontSize: "var(--font-small)",
              marginBottom: "var(--space-4)",
            }}
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <Input
            label={t("admin.login.username")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            autoFocus
          />

          <Input
            label={t("admin.login.password")}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          <Button type="submit" disabled={submitting}>
            {submitting ? t("state.loading") : t("admin.login.submit")}
          </Button>

          <div style={{ textAlign: "center", marginTop: "var(--space-2)" }}>
            <Link to="/" className="ls-link" style={{ fontSize: "var(--font-small)" }}>
              ← {t("admin.nav.backToSite")}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
