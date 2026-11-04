import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button, Chip, Logo } from "@low-stress/ui";
import { useAuth } from "../features/auth";

export function PendingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleBackToLogin = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="ls-auth-page">
      <div
        className="ls-auth-card ls-stack"
        style={{ textAlign: "center", alignItems: "center" }}
      >
        <Logo variant="icon" height={64} />

        <div className="ls-stack" style={{ gap: "var(--space-2)" }}>
          <h1 className="ls-heading-1">{t("auth.pending.title")}</h1>
          <div>
            <Chip tone="warning">{t("auth.pending.chip")}</Chip>
          </div>
        </div>

        <p className="ls-text-secondary">{t("auth.pending.description")}</p>

        {user ? (
          <p className="ls-caption ls-text-muted">
            {t("auth.pending.accountLabel", { username: user.username })}
          </p>
        ) : null}

        <hr className="ls-divider" style={{ width: "100%" }} />

        <Button variant="secondary" onClick={handleBackToLogin} block>
          {t("auth.pending.backToLogin")}
        </Button>
      </div>
    </div>
  );
}
