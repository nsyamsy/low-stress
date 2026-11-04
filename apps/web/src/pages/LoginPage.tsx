import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { Button, Input, Logo } from "@low-stress/ui";
import { useAuth } from "../features/auth";
import type { ApiError } from "../features/auth/api";

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, publicConfig } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lockoutSec, setLockoutSec] = useState<number | null>(null);

  useEffect(() => {
    if (lockoutSec === null || lockoutSec <= 0) return undefined;
    const timer = setInterval(() => {
      setLockoutSec((prev) => (prev && prev > 1 ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSec]);

  const mapErrorMessage = (error: ApiError): string => {
    switch (error.code) {
      case "AUTH_INVALID_CREDENTIALS":
        return t("auth.error.invalidCredentials");
      case "ACCOUNT_REJECTED":
        return t("auth.error.accountRejected");
      case "ACCOUNT_SUSPENDED":
        return t("auth.error.accountSuspended");
      case "ACCOUNT_BANNED":
        return t("auth.error.accountBanned");
      case "AUTH_LOCKED": {
        const sec = (error.params?.retryAfterSec as number) ?? 60;
        setLockoutSec(sec);
        return t("auth.login.lockoutMessage", { seconds: sec });
      }
      default:
        return t("auth.error.generic");
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);

    try {
      const user = await login({ username, password });
      if (user.status === "pending") {
        navigate("/pending");
      } else {
        navigate("/");
      }
    } catch (err: unknown) {
      const apiErr = (err as { apiError?: ApiError })?.apiError;
      if (apiErr) {
        setErrorMessage(mapErrorMessage(apiErr));
      } else {
        setErrorMessage(t("auth.error.generic"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isRegistrationClosed = publicConfig?.registration === "closed";

  return (
    <div className="ls-auth-page">
      <div className="ls-auth-card ls-stack">
        <div style={{ textAlign: "center" }}>
          <Logo variant="full" height={96} />
          <p className="ls-text-secondary" style={{ marginTop: "var(--space-2)" }}>
            {t("auth.login.subtitle")}
          </p>
        </div>

        {errorMessage ? (
          <div className="ls-field__error" role="alert">
            <span aria-hidden="true">!</span>
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {lockoutSec ? (
          <div className="ls-field__error" role="alert">
            <span aria-hidden="true">!</span>
            <span>{t("auth.login.lockoutMessage", { seconds: lockoutSec })}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="ls-stack">
          <Input
            label={t("auth.login.username")}
            placeholder={t("auth.login.usernamePlaceholder")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={submitting || lockoutSec !== null}
            required
            autoComplete="username"
          />

          <div className="ls-stack" style={{ gap: "var(--space-1)" }}>
            <Input
              label={t("auth.login.password")}
              placeholder={t("auth.login.passwordPlaceholder")}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting || lockoutSec !== null}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="ls-link ls-caption"
              onClick={() => setShowPassword((prev) => !prev)}
              style={{ alignSelf: "flex-end" }}
            >
              {showPassword
                ? t("auth.login.hidePassword")
                : t("auth.login.showPassword")}
            </button>
          </div>

          <Button
            type="submit"
            variant="primary"
            block
            loading={submitting}
            disabled={submitting || lockoutSec !== null}
          >
            {t("auth.login.submit")}
          </Button>
        </form>

        <hr className="ls-divider" />

        <div className="ls-stack" style={{ textAlign: "center", gap: "var(--space-2)" }}>
          {isRegistrationClosed ? (
            <p className="ls-text-muted ls-caption">
              {t("auth.login.registrationClosed")}
            </p>
          ) : (
            <Link to="/register" className="ls-link">
              {t("auth.login.toRegister")}
            </Link>
          )}

          <p className="ls-text-muted ls-caption">
            {t("auth.login.forgotPasswordNotice")}
          </p>
        </div>
      </div>
    </div>
  );
}
