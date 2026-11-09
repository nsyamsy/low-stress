import React, { useCallback, useEffect, useState } from "react";
import { Crown, Medal, Trophy } from "lucide-react";
import { Button, cn } from "@low-stress/ui";
import { translateErrorCode } from "@low-stress/i18n";
import { useTranslation } from "react-i18next";
import type {
  LeaderboardData,
  LeaderboardEntry,
  LeaderboardPeriod,
} from "@low-stress/sdk";
import { apiFetch, type ApiError } from "../../lib/apiFetch";

export type { LeaderboardData, LeaderboardEntry, LeaderboardPeriod };

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

const PODIUM_COLORS = [
  "text-[var(--warning-text)] bg-[var(--warning-bg)] border-[var(--border-strong)]",
  "text-[var(--text-secondary)] bg-[var(--bg-inset)] border-[var(--border)]",
  "text-[var(--accent-text)] bg-[var(--accent-subtle)] border-[var(--border)]",
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
          : "hover:bg-[var(--bg-inset)]",
      )}
    >
      {/* Rank badge */}
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium border",
          isPodium
            ? podiumClass
            : "border-transparent bg-[var(--bg-inset)] text-[var(--text-secondary)]",
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
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary-subtle)] text-xs font-bold text-[var(--primary)]">
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

// eslint-disable-next-line react-refresh/only-export-components
export function mapLeaderboardFetchError(
  err: unknown,
  t: (key: string) => string,
): string {
  const typed = err as { status?: number; apiError?: ApiError };
  const code = typed?.apiError?.code;
  if (code === "FORBIDDEN" || code === "ADMIN_CANNOT_PLAY") {
    return t("state.forbidden");
  }
  if (code === "GAME_CLOSED") {
    return t("errors.GAME_CLOSED");
  }
  if (code === "GAME_MAINTENANCE") {
    return t("errors.GAME_MAINTENANCE");
  }
  if (typed?.status === 403) {
    return t("state.forbidden");
  }
  if (code) {
    return translateErrorCode(code, typed?.apiError?.params);
  }
  return t("state.error");
}

export function GameLeaderboard({
  gameId,
  refreshKey = 0,
  className,
  initialData = null,
  initialError = null,
}: {
  gameId: string;
  refreshKey?: number;
  className?: string;
  initialData?: LeaderboardData | null;
  initialError?: string | null;
}) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<LeaderboardPeriod>("all");
  const [data, setData] = useState<LeaderboardData | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [retryCount, setRetryCount] = useState(0);

  const mapFetchError = useCallback(
    (err: unknown): string => mapLeaderboardFetchError(err, t),
    [t],
  );

  useEffect(() => {
    if (!gameId || initialData !== null || initialError !== null) {
      return;
    }

    let mounted = true;

    apiFetch<LeaderboardData>(
      `/api/games/${encodeURIComponent(gameId)}/leaderboard?period=${period}`,
    )
      .then((json) => {
        if (mounted) {
          setData(json);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (mounted) {
          setError(mapFetchError(err));
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [gameId, period, refreshKey, retryCount, initialData, initialError, mapFetchError]);

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
      <div className="flex items-center gap-1 p-1 bg-[var(--bg-inset)] rounded-lg mb-3 text-xs">
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
        <div className="py-6 flex flex-col items-center gap-3 text-center">
          <p className="text-xs text-[var(--danger-text)]" role="alert">
            {error}
          </p>
          <Button
            variant="secondary"
            onClick={() => setRetryCount((c) => c + 1)}
          >
            {t("action.tryAgain")}
          </Button>
        </div>
      ) : !data || data.entries.length === 0 ? (
        <div className="py-8 text-center text-xs text-[var(--text-muted)]">
          {t("leaderboard.empty")}
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {data.entries.map((entry) => (
            <LeaderboardRow
              key={entry.userId}
              entry={entry}
              isMeLabel={t("leaderboard.you")}
            />
          ))}

          {/* Baris pemain sendiri bila berada di luar top 10 (Screens §8) */}
          {data.me && (
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
