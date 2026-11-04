import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@low-stress/ui";
import { fetchGamesApi } from "../features/games/api";
import type { GameItem } from "../features/games/types";

export function GameStatusPage({
  initialGame = null,
  initialLoading = false,
}: {
  initialGame?: GameItem | null;
  initialLoading?: boolean;
} = {}) {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [game, setGame] = useState<GameItem | null>(initialGame);
  const [loading, setLoading] = useState(initialGame ? false : initialLoading);

  const currentLang = i18n.language.startsWith("en") ? "en" : "id";

  useEffect(() => {
    if (initialGame) return;
    let mounted = true;
    fetchGamesApi()
      .then((data) => {
        if (!mounted) return;
        const found = data.items.find((g) => g.id === id);
        if (found) {
          setGame(found);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [id, initialGame]);

  if (loading) {
    return (
      <div className="ls-status-screen">
        <p className="ls-text-secondary">{t("state.loading")}</p>
      </div>
    );
  }

  const isMaintenance = game?.status === "maintenance";
  const windowsStr =
    game?.windows && game.windows.length > 0
      ? `${game.windows.map((w) => `${w.start}–${w.end}`).join(", ")} WIB`
      : "12:00–13:00 WIB";

  const daysStr =
    game?.days && game.days.length > 0
      ? game.days.map((d) => t(`days.${d}`)).join(", ")
      : t("days.1");

  return (
    <div className="ls-status-screen">
      <div className="ls-status-screen__card">
        {/* Ikon Jam SVG */}
        <div className="ls-status-screen__icon">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>

        {/* Judul dan Konten Layar Status (Screens §6) */}
        {isMaintenance ? (
          <>
            <h1 className="ls-heading-1" style={{ fontSize: "var(--font-h2)" }}>
              {t("game.maintenance.title")}
            </h1>
            <p className="ls-text-secondary">
              {game?.maintenanceMessage?.[currentLang] ||
                game?.maintenanceMessage?.id ||
                t("game.maintenance.defaultMessage")}
            </p>
          </>
        ) : (
          <>
            <h1 className="ls-heading-1" style={{ fontSize: "var(--font-h2)" }}>
              {t("game.closed.title")}
            </h1>
            <p className="ls-text-secondary">
              {t("game.closed.description", {
                windows: windowsStr,
                days: daysStr,
              })}
            </p>
          </>
        )}

        {/* Tombol kembali ke beranda */}
        <Button variant="primary" onClick={() => navigate("/")}>
          {t("game.closed.backHome")}
        </Button>
      </div>
    </div>
  );
}
