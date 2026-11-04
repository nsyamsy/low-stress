import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button, Chip } from "@low-stress/ui";
import { useAuth } from "../features/auth";
import { ShowcasePage } from "./ShowcasePage";

export function HomePage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  return (
    <div className="ls-stack">
      <div className="ls-card ls-stack">
        <div className="ls-row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1 className="ls-heading-1">
              {user ? `Halo, ${user.displayName}` : t("app.name")}
            </h1>
            <p className="ls-text-secondary">{t("app.tagline")}</p>
          </div>
          <div className="ls-row">
            <Chip tone="success">{user?.status ?? "active"}</Chip>
            <Button variant="ghost" onClick={logout}>
              {t("nav.logout")}
            </Button>
          </div>
        </div>
        <div className="ls-row">
          <Link to="/showcase" className="ls-link ls-caption">
            {t("nav.showcase")}
          </Link>
        </div>
      </div>

      <ShowcasePage />
    </div>
  );
}
