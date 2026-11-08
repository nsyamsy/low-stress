import React, { useEffect, useState } from "react";
import { Crown, Medal, Trophy } from "lucide-react";
import { cn } from "@low-stress/ui";
import { useTranslation } from "react-i18next";

export type LeaderboardPeriod = "all" | "week" | "month";

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  score: number;
  plays: number;
  bestPlay: number | null;
  at: string;
  isMe: boolean;
}

export interface LeaderboardData {
  period: LeaderboardPeriod;
  periodStart: string | null;
  periodEnd: string | null;
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
  mine: LeaderboardEntry | null;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

const PODIUM_COLORS = [
  "text-amber-500 bg-amber-500/10 border-amber-500/30",
  "text-slate-400 bg-slate-400/10 border-slate-400/30",
  "text-amber-700 bg-amber-700/10 border-amber-700/30",
];

export function LeaderboardRow({
  entry,
  isMeLabel,
}: {
  entry: LeaderboardEntry;
  isMeLabel: string;
}) {
  const { t, i18n } = useTranslation();
  const isPodium = entry.rank >= 1 && entry.rank <= 3;
  const podiumClass = isPodium ? PODIUM_COLORS[entry.rank - 1] : "";

  return (
    <li
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
        entry.isMe
          ? "bg-[var(--bg-inset)] border border-[var(--border)] shadow-xs"
          : "hover:bg-black/5 dark:hover:bg-white/5",
      )}
    >
      {/* Rank badge */}
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium border",
          isPodium
            ? podiumClass
            : "border-transparent bg-black/5 dark:bg-white/5 text-[var(--text-secondary)]",
        )}
      >
        {entry.rank === 1 ? (
          <Crown className="h-3.5 w-3.5" />
        ) : entry.rank === 2 || entry.rank === 3 ? (
          <Medal className="h-3.5 w-3.5" />
        ) : (
          entry.rank
        )}
      </span>

      {/* Avatar Inisial */}
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/15 text-xs font-bold text-[var(--primary)]">
        {getInitials(entry.name)}
      </span>

      {/* Detail Pemain */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className="truncate text-xs font-bold text-[var(--text-primary)]"
            title={entry.name}
          >
            {entry.name}
          </span>
          {entry.isMe && (
            <span className="shrink-0 text-xs font-bold text-[var(--accent-text)]">
              {isMeLabel}
            </span>
          )}
        </div>
        <div className="text-xs text-[var(--text-muted)]">
          {t("leaderboard.playsCount", { count: entry.plays })}
          {entry.bestPlay
            ? ` · ${t("leaderboard.bestPlayInfo", {
                best: entry.bestPlay,
                total: entry.plays,
              })}`
            : ""}
        </div>
      </div>

      {/* Skor */}
      <span className="shrink-0 text-sm font-medium tabular-nums text-[var(--text-primary)]">
        {entry.score.toLocaleString(i18n.language)}
      </span>
    </li>
  );
}

export function GameLeaderboard({
  gameId,
  refreshKey = 0,
  className,
}: {
  gameId: string;
  refreshKey?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<LeaderboardPeriod>("all");
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch(`/api/games/${encodeURIComponent(gameId)}/leaderboard?period=${period}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: LeaderboardData) => {
        if (mounted) {
          setData(json);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setError(t("state.error"));
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [gameId, period, refreshKey, t]);

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-sm",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-[var(--accent-text)]" />
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            {t("leaderboard.title")}
          </h2>
        </div>
      </div>

      {/* Period Tabs */}
      <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-lg mb-3 text-xs">
        {(["all", "week", "month"] as const).map((p) => {
          const isActive = period === p;
          const label =
            p === "week"
              ? t("leaderboard.periodWeek")
              : p === "month"
                ? t("leaderboard.periodMonth")
                : t("leaderboard.periodAll");
          return (
            <button
              key={p}
              type="button"
              onClick={() => {
                setLoading(true);
                setPeriod(p);
              }}
              className={cn(
                "flex-1 py-1 px-2 rounded-md font-bold text-center transition-colors cursor-pointer text-xs",
                isActive
                  ? "bg-[var(--bg-surface)] text-[var(--primary)] shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Entries List */}
      {loading && !data ? (
        <div className="py-6 text-center text-xs text-[var(--text-secondary)]">
          {t("state.loading")}
        </div>
      ) : error ? (
        <div className="py-6 text-center text-xs text-red-500">{error}</div>
      ) : data?.entries.length === 0 ? (
        <div className="py-8 text-center text-xs text-[var(--text-muted)]">
          {t("leaderboard.empty")}
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {data?.entries.map((entry) => (
            <LeaderboardRow
              key={entry.userId}
              entry={entry}
              isMeLabel={t("leaderboard.you")}
            />
          ))}

          {/* Baris pemain sendiri bila berada di luar top 10 (Screens §8) */}
          {data?.me && (
            <>
              <li className="my-1 border-t border-dashed border-[var(--border)]" />
              <LeaderboardRow
                entry={data.me}
                isMeLabel={t("leaderboard.you")}
              />
            </>
          )}
        </ul>
      )}
    </div>
  );
}
