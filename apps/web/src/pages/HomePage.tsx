import { useCallback, useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button, Chip } from "@low-stress/ui";
import { useAuth } from "../features/auth";
import { fetchGamesApi } from "../features/games/api";
import { getGameThumbnail } from "../features/games/thumbnails";
import type { GameItem } from "../features/games/types";
import type { ApiError } from "../lib/apiFetch";

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

// eslint-disable-next-line react-refresh/only-export-components
export function formatNextOpenWib(opensAtIso: string, t: TFunction): string {
  const nextDate = new Date(opensAtIso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(nextDate);

  const weekdayShort = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const dayIndex = WEEKDAY_INDEX[weekdayShort] ?? 0;
  const hours = (parts.find((p) => p.type === "hour")?.value ?? "00").padStart(2, "0");
  const minutes = (parts.find((p) => p.type === "minute")?.value ?? "00").padStart(2, "0");
  const dayName = t(`days.${dayIndex}`);
  return `${dayName} ${hours}:${minutes} WIB`;
}

export function HomePage({
  initialGames = null,
  initialError = null,
}: {
  initialGames?: GameItem[] | null;
  initialError?: string | null;
} = {}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [games, setGames] = useState<GameItem[]>(initialGames ?? []);
  const [loading, setLoading] = useState(
    initialGames === null && initialError === null,
  );
  const [error, setError] = useState<string | null>(initialError);

  const loadGames = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchGamesApi()
      .then((data) => {
        setGames(data.items);
      })
      .catch((err: unknown) => {
        const typed = err as { status?: number; apiError?: ApiError };
        const code = typed?.apiError?.code;
        if (
          typed?.status === 403 ||
          code === "FORBIDDEN" ||
          code === "ADMIN_CANNOT_PLAY"
        ) {
          setError(t("state.forbidden"));
        } else {
          setError(t("state.error"));
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [t]);

  useEffect(() => {
    if (initialGames !== null || initialError !== null) return;
    let mounted = true;
    fetchGamesApi()
      .then((data) => {
        if (mounted) setGames(data.items);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        const typed = err as { status?: number; apiError?: ApiError };
        const code = typed?.apiError?.code;
        if (
          typed?.status === 403 ||
          code === "FORBIDDEN" ||
          code === "ADMIN_CANNOT_PLAY"
        ) {
          setError(t("state.forbidden"));
        } else {
          setError(t("state.error"));
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [initialGames, initialError, t]);

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
    const closedGames = games
      .filter((g) => g.status === "active" && !g.open && g.opensAt)
      .slice()
      .sort(
        (a, b) =>
          new Date(a.opensAt!).getTime() - new Date(b.opensAt!).getTime(),
      );
    if (closedGames.length > 0 && closedGames[0]?.opensAt) {
      return t("home.scheduleClosed", {
        time: formatNextOpenWib(closedGames[0].opensAt, t),
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
          {t("home.greeting", { name: user?.displayName ?? t("home.fallbackName") })}
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
      ) : error ? (
        <div
          className="ls-card"
          style={{ textAlign: "center", padding: "var(--space-6)" }}
          role="alert"
        >
          <p className="ls-text-secondary" style={{ marginBottom: "var(--space-3)" }}>
            {error}
          </p>
          <Button variant="secondary" onClick={loadGames}>
            {t("action.tryAgain")}
          </Button>
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
            const thumbnail = getGameThumbnail(game.id);

            return (
              <div key={game.id} className="ls-game-card">
                {/* Pratinjau berwarna */}
                <div
                  className={`ls-game-card__preview${isOpen ? "" : " ls-game-card__preview--locked"}`}
                >
                  {thumbnail ? (
                    <img
                      src={thumbnail}
                      alt=""
                      className="ls-game-card__thumb"
                      loading="lazy"
                      draggable={false}
                    />
                  ) : (
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
                  )}
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
