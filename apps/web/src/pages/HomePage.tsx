import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button, Chip } from "@low-stress/ui";
import { useAuth } from "../features/auth";
import { fetchGamesApi } from "../features/games/api";
import type { GameItem } from "../features/games/types";

export function HomePage({
  initialGames = null,
}: {
  initialGames?: GameItem[] | null;
} = {}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [games, setGames] = useState<GameItem[]>(initialGames ?? []);
  const [loading, setLoading] = useState(initialGames === null);

  useEffect(() => {
    if (initialGames !== null) return;
    let mounted = true;
    fetchGamesApi()
      .then((data) => {
        if (mounted) setGames(data.items);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [initialGames]);

  const currentLang = i18n.language.startsWith("en") ? "en" : "id";

  // Hitung ringkasan jadwal global / game
  const computeScheduleSummary = () => {
    if (games.length === 0) return null;

    const anyClosed = games.some((g) => g.status === "active" && !g.open);
    if (!anyClosed) {
      // Periksa apakah semua selalu buka (windows kosong atau default)
      const hasLimit = games.some((g) => g.windows && g.windows.length > 0);
      if (!hasLimit) {
        return t("home.scheduleAllDay");
      }
      const firstActive = games.find((g) => g.status === "active");
      if (firstActive && firstActive.windows.length > 0) {
        const windowsText = firstActive.windows
          .map((w) => `${w.start}–${w.end}`)
          .join(", ");
        return t("home.scheduleOpen", { windows: `${windowsText} WIB` });
      }
      return t("home.scheduleAllDay");
    }

    // Jika ada yang tutup, cari opensAt terdekat
    const closedGames = games.filter((g) => g.status === "active" && !g.open && g.opensAt);
    if (closedGames.length > 0 && closedGames[0]?.opensAt) {
      const nextDate = new Date(closedGames[0].opensAt);
      const dayName = t(`days.${nextDate.getDay()}`);
      const hours = String(nextDate.getHours()).padStart(2, "0");
      const minutes = String(nextDate.getMinutes()).padStart(2, "0");
      return t("home.scheduleClosed", {
        time: `${dayName} ${hours}:${minutes} WIB`,
      });
    }

    return null;
  };

  const scheduleSummary = computeScheduleSummary();

  return (
    <div className="ls-stack" style={{ gap: "var(--space-6)" }}>
      {/* Sapaan & Baris Status Jadwal (Screens §5) */}
      <div className="ls-stack" style={{ gap: "var(--space-1)" }}>
        <h1 className="ls-heading-1">
          {t("home.greeting", { name: user?.displayName ?? "Pemain" })}
        </h1>
        {scheduleSummary && (
          <p className="ls-text-secondary" style={{ fontSize: "var(--font-body)" }}>
            {scheduleSummary}
          </p>
        )}
      </div>

      {loading ? (
        <div style={{ padding: "var(--space-6)", textAlign: "center" }}>
          <p className="ls-text-secondary">{t("state.loading")}</p>
        </div>
      ) : games.length === 0 ? (
        <div className="ls-card" style={{ textAlign: "center", padding: "var(--space-6)" }}>
          <p className="ls-text-secondary">{t("home.emptyGames")}</p>
        </div>
      ) : (
        /* Grid kartu game: 1 kolom (< 768px), 2 kolom (768–1023px), 3 kolom (≥ 1024px) */
        <div className="ls-game-grid">
          {games.map((game) => {
            const title = game.title[currentLang] ?? game.title.id;
            const isMaintenance = game.status === "maintenance";
            const isClosed = game.status === "active" && !game.open;
            const isOpen = game.status === "active" && game.open;

            return (
              <div key={game.id} className="ls-game-card">
                {/* Pratinjau berwarna */}
                <div className="ls-game-card__preview">
                  <div
                    style={{
                      fontSize: "var(--font-h2)",
                      fontWeight: "var(--weight-bold)",
                      color: "var(--text-primary)",
                      opacity: 0.85,
                    }}
                  >
                    {title.slice(0, 2).toUpperCase()}
                  </div>
                  {game.badge && (
                    <div
                      style={{
                        position: "absolute",
                        top: "var(--space-2)",
                        right: "var(--space-2)",
                      }}
                    >
                      <Chip tone="danger">{game.badge.toUpperCase()}</Chip>
                    </div>
                  )}
                </div>

                {/* Badan kartu */}
                <div className="ls-game-card__body">
                  <div className="ls-game-card__header">
                    <h2 className="ls-game-card__title">{title}</h2>
                    <div>
                      {isOpen && (
                        <Chip tone="success">{t("game.status.active")}</Chip>
                      )}
                      {isClosed && (
                        <Chip tone="warning">{t("game.status.closed")}</Chip>
                      )}
                      {isMaintenance && (
                        <Chip tone="warning">{t("game.status.maintenance")}</Chip>
                      )}
                    </div>
                  </div>

                  {/* Satu baris info: rekor pribadi atau pesan maintenance */}
                  <div className="ls-game-card__info">
                    {isMaintenance ? (
                      <span>
                        {game.maintenanceMessage?.[currentLang] ||
                          game.maintenanceMessage?.id ||
                          t("game.maintenance.defaultMessage")}
                      </span>
                    ) : game.mine && game.mine.plays > 0 ? (
                      <span>
                        {t("home.personalBest", {
                          score: game.mine.best,
                          plays: game.mine.plays,
                        })}
                      </span>
                    ) : (
                      <span>{t("home.noScoreYet")}</span>
                    )}
                  </div>

                  {/* Tombol aksi */}
                  <div className="ls-game-card__actions">
                    {isOpen && (
                      <Button
                        variant="primary"
                        onClick={() => navigate(`/games/${game.id}`)}
                      >
                        {t("game.action.play")}
                      </Button>
                    )}
                    {isClosed && (
                      <Button
                        variant="secondary"
                        onClick={() => navigate(`/games/${game.id}/status`)}
                      >
                        {t("game.action.viewSchedule")}
                      </Button>
                    )}
                    {isMaintenance && (
                      <Button variant="secondary" disabled>
                        {t("game.action.locked")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
