import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { cn } from "@low-stress/ui";
import { useTranslation } from "react-i18next";
import { fetchGamesApi } from "../features/games/api";
import type { GameItem } from "../features/games/types";
import { GameLeaderboard } from "../features/leaderboard/GameLeaderboard";

export function LeaderboardPage() {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language.startsWith("en") ? "en" : "id";

  const [games, setGames] = useState<GameItem[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>("memory-match");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetchGamesApi()
      .then((data) => {
        if (!mounted) return;
        setGames(data.items);
        if (data.items.length > 0 && !data.items.some((g) => g.id === selectedGameId)) {
          setSelectedGameId(data.items[0]!.id);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [selectedGameId]);

  return (
    <div className="w-full max-w-3xl mx-auto py-2 md:py-6">
      {/* Header */}
      <div className="mb-6 text-center">
        <div className="inline-flex items-center justify-center p-2 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] mb-2">
          <Trophy className="h-6 w-6" />
        </div>
        <h1 className="ls-heading-1 text-2xl font-black text-[var(--text-primary)]">
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
          ) : games.length === 0 ? (
            <button
              type="button"
              className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-[var(--primary)] text-[var(--text-on-primary)] shadow-xs cursor-pointer"
            >
              Memory Match
            </button>
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
                      : "bg-black/5 dark:bg-white/5 text-[var(--text-secondary)] hover:bg-black/10 dark:hover:bg-white/10",
                  )}
                >
                  {title}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Leaderboard Table Card */}
      <GameLeaderboard gameId={selectedGameId} className="w-full" />

      {/* Catatan Waktu WIB */}
      <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
        {t("leaderboard.wibNote")}
      </p>
    </div>
  );
}
