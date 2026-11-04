import React, { useCallback, useEffect, useState } from "react";
import { Brain, Trophy } from "lucide-react";
import type { GameProps } from "@low-stress/sdk";
import { useTranslation } from "react-i18next";
import { MemoryMatch } from "./MemoryMatch";
import { useGameTranslation, type RunResult } from "./deck";

export interface GameLeaderboardProps {
  gameId: string;
  refreshKey?: number;
  className?: string;
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
}: {
  gameId: string;
  refreshKey?: number;
}) {
  const { t } = useTranslation();
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
    <div className="flex flex-col rounded-xl border border-outline-variant/15 bg-surface-container-lowest p-4 shadow-xs">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-bold text-on-surface">Leaderboard</h2>
      </div>

      <div className="flex items-center gap-1 p-1 bg-surface-container-high rounded-lg mb-3 text-xs">
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
                ? "bg-surface-container-lowest text-primary shadow-xs"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {p === "week"
              ? t("leaderboard.periodWeek") || "Minggu ini"
              : p === "month"
                ? t("leaderboard.periodMonth") || "Bulan ini"
                : t("leaderboard.periodAll") || "Sepanjang waktu"}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="py-6 text-center text-xs text-on-surface-variant">
          {t("state.loading") || "Memuat…"}
        </div>
      ) : data?.entries?.length === 0 ? (
        <div className="py-8 text-center text-xs text-on-surface-variant/60">
          {t("leaderboard.empty") || "Belum ada skor"}
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {data?.entries?.map((e) => (
            <li
              key={e.userId}
              className={`flex items-center justify-between text-xs px-2 py-1.5 rounded-md ${
                e.isMe ? "bg-primary/10 font-bold" : "hover:bg-surface-container-high/40"
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <span className="w-5 text-center font-bold text-on-surface-variant">
                  {e.rank}
                </span>
                <span className="truncate text-on-surface">{e.name}</span>
              </div>
              <span className="font-extrabold tabular-nums text-on-surface ml-2">
                {e.score}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function MemoryMatchGame(props: GameProps) {
  const { onScore } = props;
  const { t } = useGameTranslation();
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRunEnd = useCallback(
    async (result: RunResult) => {
      try {
        await onScore({
          score: result.score,
          durationMs: result.durationMs,
          meta: {
            moves: result.moves,
            combos: result.combos,
          },
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
      <div className="ls-memory-layout">
        {/* Left: Mini Leaderboard */}
        <div className="order-2 md:order-1">
          <MiniLeaderboard gameId="memory-match" refreshKey={refreshKey} />
        </div>

        {/* Center: Memory Match 4x4 Grid Board */}
        <div className="order-1 md:order-2">
          <MemoryMatch onRunEnd={handleRunEnd} />
        </div>

        {/* Right: Rules & Info (Porting_Guide §3) */}
        <aside className="order-3 rounded-xl border border-outline-variant/15 bg-surface-container-lowest p-5 shadow-xs md:col-span-2 lg:col-span-1">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Brain className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold text-on-surface">
                  {t("title")}
                </h1>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                  {t("badge")}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant">{t("subtitle")}</p>
            </div>
          </div>

          <h2 className="mb-1.5 mt-4 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            {t("howTo")}
          </h2>
          <ul className="list-disc space-y-2 pl-4 text-xs text-on-surface leading-relaxed">
            <li>{t("rulesPairs")}</li>
            <li>{t("rulesScore")}</li>
            <li>{t("rulesAudio")}</li>
          </ul>

          <div className="mt-5 rounded-lg bg-surface-container-high/60 p-3 border border-outline-variant/15 text-xs text-on-surface-variant">
            <div className="flex items-center gap-1.5 font-bold text-on-surface mb-1">
              <Trophy className="h-3.5 w-3.5 text-amber-500" />
              <span>Leaderboard</span>
            </div>
            {t("leaderboardNote")}
          </div>
        </aside>
      </div>
    </div>
  );
}
