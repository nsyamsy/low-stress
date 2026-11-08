import React, { useCallback, useEffect, useState } from "react";
import { Feather, Trophy } from "lucide-react";
import type { GameProps } from "@low-stress/sdk";
import { FlappyBird, type RunResult } from "./FlappyBird";
import { useFlappyTranslation } from "./i18n";

export interface MiniLeaderboardProps {
  gameId: string;
  refreshKey?: number;
}

interface LeaderboardEntryItem {
  userId: string;
  rank: number;
  name: string;
  score: number;
  isMe: boolean;
}

interface LeaderboardData {
  entries?: LeaderboardEntryItem[];
}

export function MiniLeaderboard({
  gameId,
  refreshKey = 0,
}: MiniLeaderboardProps) {
  const { t } = useFlappyTranslation();
  const [period, setPeriod] = useState<"all" | "week" | "month">("all");
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch(`/api/games/${encodeURIComponent(gameId)}/leaderboard?period=${period}`)
      .then((r) => r.json())
      .then((json: LeaderboardData) => {
        if (mounted) {
          setData(json);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [gameId, period, refreshKey]);

  return (
    <div className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-xs">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-bold text-[var(--text-primary)]">
          {t("leaderboard")}
        </h2>
      </div>

      <div className="flex items-center gap-1 p-1 bg-[var(--bg-inset)] rounded-lg mb-3 text-xs">
        {(["all", "week", "month"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setLoading(true);
              setPeriod(p);
            }}
            className={`flex-1 py-1 px-1.5 rounded-md font-bold text-center transition-colors cursor-pointer text-xs ${
              period === p
                ? "bg-[var(--bg-surface)] text-[var(--primary)] shadow-xs"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {p === "week"
              ? t("periodWeek")
              : p === "month"
                ? t("periodMonth")
                : t("periodAll")}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="py-6 text-center text-xs text-[var(--text-secondary)]">
          {t("loading")}
        </div>
      ) : data?.entries?.length === 0 ? (
        <div className="py-8 text-center text-xs text-[var(--text-secondary)]">
          {t("empty")}
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {data?.entries?.map((e) => (
            <li
              key={e.userId}
              className={`flex items-center justify-between text-xs px-2 py-1.5 rounded-md ${
                e.isMe
                  ? "bg-[var(--primary-subtle)] font-bold"
                  : "hover:bg-[var(--bg-inset)]"
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <span className="w-5 text-center font-bold text-[var(--text-secondary)]">
                  {e.rank}
                </span>
                <span className="truncate text-[var(--text-primary)]">{e.name}</span>
              </div>
              <span className="font-extrabold tabular-nums text-[var(--text-primary)] ml-2">
                {e.score}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function FlappyBirdGame(props: GameProps) {
  const { onScore } = props;
  const { t } = useFlappyTranslation();
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRunEnd = useCallback(
    async (result: RunResult) => {
      // Run dengan skor < 1 tidak dihitung dan tidak disimpan (Porting_Guide §2 & §6)
      if (result.score < 1) {
        return;
      }
      try {
        await onScore({
          score: result.score,
          durationMs: result.durationMs,
        });
      } catch {
        // Abaikan kegagalan jaringan di latar
      }
      setRefreshKey((k) => k + 1);
    },
    [onScore],
  );

  return (
    <div className="p-4 md:p-6 w-full max-w-6xl mx-auto">
      {/* Phone: game, leaderboard, rules. Tablet: leaderboard | game, rules below. Desktop: all three in a row. */}
      <div className="ls-flappy-layout">
        {/* Left: Mini Leaderboard */}
        <div className="order-2 md:order-1">
          <MiniLeaderboard gameId="flappy-bird" refreshKey={refreshKey} />
        </div>

        {/* Center: Flappy Bird Canvas 2D */}
        <div className="order-1 md:order-2 flex justify-center">
          <FlappyBird onRunEnd={handleRunEnd} />
        </div>

        {/* Right: Rules & Info (Porting_Guide §2) */}
        <aside className="order-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 shadow-xs md:col-span-2 lg:col-span-1">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--primary-subtle)] text-[var(--primary)]">
              <Feather className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold text-[var(--text-primary)]">
                  {t("title")}
                </h1>
                <span className="rounded-full bg-[var(--primary-subtle)] px-2 py-0.5 text-xs font-bold text-[var(--primary)]">
                  {t("badge")}
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">{t("subtitle")}</p>
            </div>
          </div>

          <h2 className="mb-1.5 mt-4 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            {t("howTo")}
          </h2>
          <ul className="list-disc space-y-2 pl-4 text-xs text-[var(--text-primary)] leading-relaxed">
            <li>{t("controls")}</li>
            <li>{t("rules")}</li>
            <li>{t("medals")}</li>
          </ul>

          <div className="mt-5 rounded-lg bg-[var(--bg-inset)] p-3 border border-[var(--border)] text-xs text-[var(--text-secondary)]">
            <div className="flex items-center gap-1.5 font-bold text-[var(--text-primary)] mb-1">
              <Trophy className="h-3.5 w-3.5 text-amber-500" />
              <span>{t("leaderboard")}</span>
            </div>
            {t("bestNote")}
          </div>
        </aside>
      </div>
    </div>
  );
}
