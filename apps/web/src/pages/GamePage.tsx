import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import type { GameProps, Theme } from "@low-stress/sdk";
import { fetchGamesApi } from "../features/games/api";
import type { GameItem } from "../features/games/types";
import { findGame } from "../games/registry";
import { useAuth } from "../features/auth/useAuth";
import { GameStatusPage } from "./GameStatusPage";

export function GamePage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [gameInfo, setGameInfo] = useState<GameItem | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [ClientComponent, setClientComponent] =
    useState<React.ComponentType<GameProps> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const manifest = useMemo(() => (id ? findGame(id) : undefined), [id]);

  useEffect(() => {
    if (!id) return;
    let mounted = true;

    fetchGamesApi()
      .then((data) => {
        if (!mounted) return;
        const found = data.items.find((g) => g.id === id);
        setGameInfo(found ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoadingInfo(false);
      });

    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    if (!manifest) return;
    let mounted = true;

    manifest
      .client()
      .then((mod) => {
        if (!mounted) return;
        setClientComponent(() => mod.default);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      mounted = false;
    };
  }, [manifest]);

  if (loadingInfo) {
    return (
      <div className="ls-status-screen">
        <p className="ls-text-secondary">{t("state.loading")}</p>
      </div>
    );
  }

  // Jika game tidak ditemukan atau tidak aktif
  if (!gameInfo && !manifest) {
    return (
      <div className="ls-status-screen">
        <p className="ls-text-secondary">{t("state.error")}</p>
      </div>
    );
  }

  // Jika game sedang dalam perbaikan atau di luar jadwal (Screens §6)
  if (gameInfo && (!gameInfo.open || gameInfo.status === "maintenance")) {
    return <GameStatusPage initialGame={gameInfo} initialLoading={false} />;
  }

  if (loadError) {
    return (
      <div className="ls-status-screen">
        <p className="ls-text-secondary">{loadError}</p>
      </div>
    );
  }

  if (!ClientComponent || !user || !id) {
    return (
      <div className="ls-status-screen">
        <p className="ls-text-secondary">{t("state.loading")}</p>
      </div>
    );
  }

  const currentLocale = i18n.language.startsWith("en") ? "en" : "id";
  const currentTheme =
    (typeof document !== "undefined"
      ? (document.documentElement.getAttribute("data-theme") as Theme)
      : null) || "light";

  const gameProps: GameProps = {
    gameId: id,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      locale: currentLocale,
    },
    locale: currentLocale,
    theme: currentTheme,
    isMobile: typeof window !== "undefined" ? window.innerWidth < 768 : false,
    onScore: async (run) => {
      const payload = {
        score: run.score,
        durationMs: run.durationMs,
        moves: (run.meta as Record<string, unknown> | undefined)?.moves,
        combos: (run.meta as Record<string, unknown> | undefined)?.combos,
        ...run.meta,
      };
      await fetch(`/api/games/${encodeURIComponent(id)}/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
    onExit: () => navigate("/"),
  };

  return (
    <div className="flex flex-col w-full flex-1">
      {/* Top game frame bar */}
      <div className="flex items-center justify-between py-2 border-b border-[var(--border)] mb-4">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          ← {t("action.back")}
        </button>
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {manifest?.title[currentLocale] || id}
        </span>
        <div className="w-12" />
      </div>

      {/* Game Content */}
      <Suspense
        fallback={
          <div className="ls-status-screen">
            <p className="ls-text-secondary">{t("state.loading")}</p>
          </div>
        }
      >
        <ClientComponent {...gameProps} />
      </Suspense>
    </div>
  );
}
