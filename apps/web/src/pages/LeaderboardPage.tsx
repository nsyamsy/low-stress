import { useCallback, useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { Button, cn } from "@low-stress/ui";
import { useTranslation } from "react-i18next";
import { fetchGamesApi } from "../features/games/api";
import type { GameItem } from "../features/games/types";
import { GameLeaderboard } from "../features/leaderboard/GameLeaderboard";
import type { ApiError } from "../lib/apiFetch";

export function LeaderboardPage({
  initialGames = null,
  initialError = null,
}: {
  initialGames?: GameItem[] | null;
  initialError?: string | null;
} = {}) {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language.startsWith("en") ? "en" : "id";

  const [games, setGames] = useState<GameItem[]>(initialGames ?? []);
  const [selectedGameId, setSelectedGameId] = useState<string>(
    initialGames && initialGames.length > 0 ? initialGames[0]!.id : "",
  );
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
        setSelectedGameId((prev) => {
          if (data.items.length === 0) return "";
          if (prev && data.items.some((g) => g.id === prev)) return prev;
          return data.items[0]?.id ?? "";
        });
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
        if (!mounted) return;
        setGames(data.items);
        setSelectedGameId((prev) => {
          if (data.items.length === 0) return "";
          if (prev && data.items.some((g) => g.id === prev)) return prev;
          return data.items[0]?.id ?? "";
        });
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

  return (
    <div className="w-full max-w-3xl mx-auto py-2 md:py-6">
      {/* Header */}
      <div className="mb-6 text-center">
        <div className="inline-flex items-center justify-center p-2 rounded-full bg-[var(--primary-subtle)] text-[var(--primary)] mb-2">
          <Trophy className="h-6 w-6" />
        </div>
        <h1 className="ls-heading-1 text-2xl font-medium text-[var(--text-primary)]">
          {t("leaderboard.title")}
        </h1>
        <p className="ls-text-secondary text-xs mt-1">
          {t("leaderboard.subtitle")}
        </p>
      </div>

      {/* Pilihan Game (Chips) (Screens §8) */}
      <div className="mb-6">
        <label className="block text-xs font-bold text-[var(--text-secondary)] mb-2 text-center">
          {t("leaderboard.selectGame")}
        </label>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {loading && games.length === 0 ? (
            <span className="text-xs text-[var(--text-secondary)]">
              {t("state.loading")}
            </span>
          ) : error ? null : games.length === 0 ? (
            <span className="text-xs text-[var(--text-muted)]">
              {t("home.emptyGames")}
            </span>
          ) : (
            games.map((game) => {
              const isSelected = game.id === selectedGameId;
              const title = game.title[currentLang] || game.id;
              return (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => setSelectedGameId(game.id)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer",
                    isSelected
                      ? "bg-[var(--primary)] text-[var(--text-on-primary)] shadow-xs scale-105"
                      : "bg-[var(--bg-inset)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                  )}
                >
                  {title}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Leaderboard Content / Error / Empty */}
      {error ? (
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
      ) : !loading && games.length === 0 ? (
        <div
          className="ls-card"
          style={{ textAlign: "center", padding: "var(--space-6)" }}
        >
          <p className="ls-text-secondary">{t("leaderboard.empty")}</p>
        </div>
      ) : (
        <GameLeaderboard gameId={selectedGameId} className="w-full" />
      )}

      {/* Catatan Waktu WIB */}
      <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
        {t("leaderboard.wibNote")}
      </p>
    </div>
  );
}
