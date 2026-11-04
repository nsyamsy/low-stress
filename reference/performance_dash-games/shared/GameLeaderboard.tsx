"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Crown, Loader2, Medal, Target, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCommercialT } from "@/lib/commercial-i18n";
import { commercialApi, initials } from "@/lib/commercial-ui";

type Period = "all" | "week" | "month";

interface Entry {
  rank: number;
  userId: string;
  name: string;
  score: number;
  plays: number;
  /** Which play produced the best score (1 = the first); null when it was not recorded. */
  bestPlay: number | null;
  at: string;
  isMe: boolean;
}

interface Board {
  period: Period;
  periodStart: string | null;
  periodEnd: string | null;
  entries: Entry[];
  me: Entry | null;
  mine: Entry | null;
}

const REFRESH_MS = 30_000;
const PERIODS: Period[] = ["all", "week", "month"];
// The weeks and months of the boards are counted in Western Indonesia Time, so are the dates shown.
const TZ = "Asia/Jakarta";

const PODIUM = [
  { icon: Crown, cls: "bg-amber-400/20 text-amber-600 dark:text-amber-300 ring-amber-400/40" },
  { icon: Medal, cls: "bg-slate-300/30 text-slate-600 dark:text-slate-300 ring-slate-400/40" },
  { icon: Medal, cls: "bg-orange-400/20 text-orange-700 dark:text-orange-300 ring-orange-400/40" },
];

function Row({ entry, youLabel, detail }: { entry: Entry; youLabel: string; detail: string }) {
  const podium = entry.rank <= 3 ? PODIUM[entry.rank - 1] : null;
  const Icon = podium?.icon;
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-[8px] px-2.5 py-2",
        entry.isMe ? "bg-primary/10 ring-1 ring-primary/25" : "hover:bg-surface-container-low/60"
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold",
          podium ? cn("ring-1", podium.cls) : "bg-surface-container-high text-on-surface-variant"
        )}
        aria-label={`#${entry.rank}`}
      >
        {Icon ? <Icon className="h-3.5 w-3.5" /> : entry.rank}
      </span>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
        {initials(entry.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-xs font-bold text-on-surface" title={entry.name}>
            {entry.name}
          </span>
          {entry.isMe && <span className="shrink-0 rounded-full bg-primary px-1.5 py-px text-[9px] font-bold text-white">{youLabel}</span>}
        </span>
        <span className="block text-[10px] text-on-surface-variant">{detail}</span>
      </span>
      <span className="shrink-0 text-sm font-extrabold tabular-nums text-on-surface">{entry.score}</span>
    </li>
  );
}

/**
 * Top players of one game for all time, this week or this month, with the signed-in user's own
 * highscore and the play (1st, 2nd, ...) it was reached on. Pass a new `refreshKey` to reload.
 */
export function GameLeaderboard({ game, refreshKey = 0, className }: { game: string; refreshKey?: number; className?: string }) {
  const { tt, locale } = useCommercialT();
  const [period, setPeriod] = useState<Period>("all");
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setBoard(await commercialApi<Board>(`/api/commercial/games/scores?game=${encodeURIComponent(game)}&period=${period}`));
      setError("");
    } catch {
      setError(tt("loadFailed"));
    }
  }, [game, period, tt]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  // the board on screen belongs to the selected tab only once it has arrived
  const current = board && board.period === period ? board : null;

  const detail = (e: Entry) =>
    e.bestPlay
      ? tt("games.leaderboard.playAtShort", { n: e.bestPlay, total: e.plays })
      : tt("games.leaderboard.plays", { n: e.plays });

  const range = () => {
    if (!current?.periodStart || !current.periodEnd) return "";
    const from = new Date(current.periodStart);
    // the end is the first instant of the next period: show the last day of this one
    const to = new Date(new Date(current.periodEnd).getTime() - 1);
    const fmt = (d: Date, withYear = false) =>
      d.toLocaleDateString(locale, { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: TZ });
    return period === "month"
      ? from.toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: TZ })
      : `${fmt(from)} – ${fmt(to, true)}`;
  };

  return (
    <section className={cn("rounded-[10px] border border-outline-variant/15 bg-surface-container-lowest p-4 shadow-xs", className)}>
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-amber-400/20 text-amber-600 dark:text-amber-300">
          <Trophy className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-sm font-extrabold text-on-surface">{tt("games.leaderboard.title")}</h2>
          <p className="text-[11px] text-on-surface-variant">{tt("games.leaderboard.subtitle")}</p>
        </div>
      </div>

      <div role="tablist" className="mb-2 grid grid-cols-3 gap-1 rounded-[8px] bg-surface-container-low p-0.5">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={period === p}
            onClick={() => setPeriod(p)}
            className={cn(
              "cursor-pointer rounded-[6px] px-2 py-1.5 text-[11px] font-bold transition-colors",
              period === p ? "bg-primary text-white shadow-xs" : "text-on-surface-variant hover:text-on-surface"
            )}
          >
            {tt(`games.leaderboard.tab.${p}`)}
          </button>
        ))}
      </div>
      <p className="mb-3 min-h-[14px] text-center text-[10px] font-semibold text-on-surface-variant">{range()}</p>

      {/* The signed-in user's own highscore for this tab, and the play it was reached on */}
      {current?.mine && (
        <div className="mb-3 flex items-center gap-3 rounded-[8px] border border-primary/20 bg-primary/[0.06] px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Target className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">{tt(`games.leaderboard.mine.${period}`)}</p>
            <p className="truncate text-[11px] text-on-surface">
              {current.mine.bestPlay
                ? tt("games.leaderboard.playAt", { n: current.mine.bestPlay, total: current.mine.plays })
                : tt("games.leaderboard.mineNoPlay", { total: current.mine.plays })}
            </p>
          </div>
          <span className="text-xl font-extrabold tabular-nums text-primary">{current.mine.score}</span>
        </div>
      )}

      {error && !current ? (
        <p className="py-8 text-center text-xs font-semibold text-red-600">{error}</p>
      ) : !current ? (
        <div className="flex justify-center py-10 text-on-surface-variant">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : current.entries.length === 0 ? (
        <p className="py-8 text-center text-xs text-on-surface-variant">{tt("games.leaderboard.empty")}</p>
      ) : (
        <>
          <ol className="space-y-1">
            {current.entries.map((e) => (
              <Row key={e.userId} entry={e} youLabel={tt("games.leaderboard.you")} detail={detail(e)} />
            ))}
          </ol>
          {current.me && (
            <>
              <div className="my-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">
                <span className="h-px flex-1 bg-outline-variant/20" />
                {tt("games.leaderboard.yourRank")}
                <span className="h-px flex-1 bg-outline-variant/20" />
              </div>
              <ol>
                <Row entry={current.me} youLabel={tt("games.leaderboard.you")} detail={detail(current.me)} />
              </ol>
            </>
          )}
        </>
      )}
    </section>
  );
}
