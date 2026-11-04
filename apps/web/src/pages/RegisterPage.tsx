import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { Button, Input, Logo } from "@low-stress/ui";
import { useAuth } from "../features/auth";
import {
  fetchCaptchaChallenge,
  registerApi,
  solveCaptcha,
  type ApiError,
} from "../features/auth/api";

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, publicConfig } = useAuth();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mapErrorMessage = (error: ApiError): string => {
    switch (error.code) {
      case "USERNAME_TAKEN":
        return t("auth.error.usernameTaken");
      case "EMAIL_TAKEN":
        return t("auth.error.emailTaken");
      case "PASSWORD_TOO_WEAK":
        return t("auth.error.passwordTooWeak");
      case "REGISTRATION_CLOSED":
        return t("auth.error.registrationClosed");
      case "CAPTCHA_FAILED":
        return t("auth.error.captchaFailed");
      default:
        return t("auth.error.generic");
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);

    try {
      let captchaPayload:
        | { challenge: string; nonce: string; signature?: string }
        | undefined;

      if (publicConfig?.captcha) {
        const challengeData = await fetchCaptchaChallenge();
        const nonce = await solveCaptcha(
          challengeData.challenge,
          challengeData.difficulty,
        );
        captchaPayload = {
          challenge: challengeData.challenge,
          nonce,
          signature: challengeData.signature,
        };
      }

      const res = await registerApi({
        username,
        displayName,
        email,
        password,
        captcha: captchaPayload,
      });

      if (res.status === "pending") {
        // Otomatis login agar sesi pending tersimpan untuk /pending
        try {
          await login({ username, password });
        } catch {
          // Abaikan bila login otomatis gagal
        }
        navigate("/pending");
      } else {
        await login({ username, password });
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

  return (
    <div className="ls-auth-page">
      <div className="ls-auth-card ls-stack">
        <div style={{ textAlign: "center" }}>
          <Logo variant="horizontal" height={32} />
          <h1 className="ls-heading-1" style={{ marginTop: "var(--space-3)" }}>
            {t("auth.register.title")}
          </h1>
          <p className="ls-text-secondary" style={{ marginTop: "var(--space-1)" }}>
            {t("auth.register.subtitle")}
          </p>
        </div>

        {errorMessage ? (
          <div className="ls-field__error" role="alert">
            <span aria-hidden="true">!</span>
            <span>{errorMessage}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="ls-stack">
          <Input
            label={t("auth.register.username")}
            placeholder={t("auth.register.usernamePlaceholder")}
            helpText={t("auth.register.usernameHelp")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={submitting}
            required
            autoComplete="username"
          />

          <Input
            label={t("auth.register.displayName")}
            placeholder={t("auth.register.displayNamePlaceholder")}
            helpText={t("auth.register.displayNameHelp")}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={submitting}
            required
          />

          <Input
            label={t("auth.register.email")}
            placeholder={t("auth.register.emailPlaceholder")}
            helpText={t("auth.register.emailHelp")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            required
            autoComplete="email"
          />

          <div className="ls-stack" style={{ gap: "var(--space-1)" }}>
            <Input
              label={t("auth.register.password")}
              placeholder={t("auth.register.passwordPlaceholder")}
              helpText={t("auth.register.passwordHelp")}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              required
              autoComplete="new-password"
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

          <Button type="submit" variant="primary" block loading={submitting}>
            {t("auth.register.submit")}
          </Button>
        </form>

        <hr className="ls-divider" />

        <div style={{ textAlign: "center" }}>
          <Link to="/login" className="ls-link">
            {t("auth.register.toLogin")}
          </Link>
        </div>
      </div>
    </div>
  );
}
