"use client";

import React, { useCallback, useState } from "react";
import { Brain, Trophy } from "lucide-react";
import { useCommercialT } from "@/lib/commercial-i18n";
import { commercialApi } from "@/lib/commercial-ui";
import { MemoryMatch, type RunResult } from "@/components/commercial/MemoryMatch";
import { GameLeaderboard } from "@/components/commercial/GameLeaderboard";

export default function MemoryMatchPage() {
  const { tt } = useCommercialT();
  const [refreshKey, setRefreshKey] = useState(0);

  const saveRun = useCallback(async ({ score, durationMs }: RunResult) => {
    try {
      await commercialApi("/api/commercial/games/scores", {
        method: "POST",
        body: JSON.stringify({
          game: "memory-match",
          score,
          durationMs: Math.round(durationMs),
        }),
      });
    } catch {
      // background error silently ignored to avoid interrupting gameplay
    }
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="p-4 md:p-6">
      {/* Phone: game, leaderboard, rules. Tablet: leaderboard | game, rules below. Desktop: all three in a row. */}
      <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-[300px_420px] md:justify-center md:items-start lg:grid-cols-[300px_420px_minmax(240px,1fr)] lg:justify-stretch">
        {/* Left: Leaderboard for Memory Match */}
        <div className="order-2 md:order-1">
          <GameLeaderboard game="memory-match" refreshKey={refreshKey} />
        </div>

        {/* Center: Memory Match 4x4 Grid Game */}
        <div className="order-1 md:order-2">
          <MemoryMatch onRunEnd={saveRun} />
        </div>

        {/* Right: Rules & Info */}
        <aside className="order-3 rounded-[10px] border border-outline-variant/15 bg-surface-container-lowest p-5 shadow-xs md:col-span-2 lg:col-span-1">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
              <Brain className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold text-on-surface">{tt("games.memory.title")}</h1>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {tt("games.memory.badge")}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant">{tt("games.memory.subtitle")}</p>
            </div>
          </div>

          <h2 className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
            {tt("games.memory.howTo")}
          </h2>
          <ul className="list-disc space-y-2 pl-4 text-xs text-on-surface leading-relaxed">
            <li>
              {tt("games.memory.rulesPairs")}
            </li>
            <li>
              {tt("games.memory.rulesScore")}
            </li>
            <li>
              {tt("games.memory.rulesAudio")}
            </li>
          </ul>

          <div className="mt-5 rounded-[8px] bg-surface-container-high/60 p-3 border border-outline-variant/15 text-[11px] text-on-surface-variant">
            <div className="flex items-center gap-1.5 font-bold text-on-surface mb-1">
              <Trophy className="h-3.5 w-3.5 text-amber-500" />
              <span>{tt("games.leaderboard.title")}</span>
            </div>
            {tt("games.memory.leaderboardNote")}
          </div>
        </aside>
      </div>
    </div>
  );
}
