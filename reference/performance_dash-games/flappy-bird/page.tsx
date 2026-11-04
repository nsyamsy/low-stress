"use client";

import React, { useCallback, useState } from "react";
import { Timer } from "lucide-react";
import { useCommercialT } from "@/lib/commercial-i18n";
import { commercialApi } from "@/lib/commercial-ui";
import { FlappyBird, type RunResult } from "@/components/commercial/FlappyBird";
import { GameLeaderboard } from "@/components/commercial/GameLeaderboard";

// A short break between tasks. The game runs in the browser; only the final score of each run is
// sent to the server, for the leaderboard.
export default function FlappyBirdPage() {
  const { tt } = useCommercialT();
  const [refreshKey, setRefreshKey] = useState(0);

  const saveRun = useCallback(async ({ score, durationMs }: RunResult) => {
    try {
      await commercialApi("/api/commercial/games/scores", {
        method: "POST",
        body: JSON.stringify({ game: "flappy-bird", score, durationMs: Math.round(durationMs) }),
      });
    } catch {
      // a lost score is not worth interrupting the game for
    }
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="p-4 md:p-6">
      {/* Phone: game, leaderboard, rules. Tablet: leaderboard | game, rules below. Desktop: all three in a row. */}
      <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-[280px_360px] md:justify-center md:items-start lg:grid-cols-[280px_360px_minmax(240px,1fr)] lg:justify-stretch">
        <div className="order-2 md:order-1">
          <GameLeaderboard game="flappy-bird" refreshKey={refreshKey} />
        </div>

        <div className="order-1 md:order-2">
          <FlappyBird onRunEnd={saveRun} />
        </div>

        <aside className="order-3 rounded-[10px] border border-outline-variant/15 bg-surface-container-lowest p-5 shadow-xs md:col-span-2 lg:col-span-1">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
              <Timer className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-base font-extrabold text-on-surface">{tt("games.flappy.title")}</h1>
              <p className="text-xs text-on-surface-variant">{tt("games.flappy.subtitle")}</p>
            </div>
          </div>
          <h2 className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{tt("games.flappy.howTo")}</h2>
          <ul className="list-disc space-y-1.5 pl-4 text-xs text-on-surface">
            <li>{tt("games.flappy.controls")}</li>
            <li>{tt("games.flappy.rules")}</li>
            <li>{tt("games.flappy.medals")}</li>
          </ul>
          <p className="mt-4 text-[11px] text-on-surface-variant">{tt("games.flappy.bestNote")}</p>
        </aside>
      </div>
    </div>
  );
}
