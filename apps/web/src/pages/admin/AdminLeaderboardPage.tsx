import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateErrorCode } from "@low-stress/i18n";
import { Button, Chip, Modal, SegmentedControl } from "@low-stress/ui";
import {
  deleteAdminRunApi,
  getAdminRunsApi,
  resetAdminLeaderboardApi,
  type AdminGameRunItem,
} from "../../features/admin/api";
import { fetchAdminGamesApi } from "../../features/games/api";
import type { AdminGameItem } from "../../features/games/types";
import { registeredGames } from "../../games/registry";
import type { ApiError } from "../../lib/apiFetch";

function getErrorText(err: unknown, fallback: string): string {
  const apiError = (err as { apiError?: ApiError })?.apiError;
  if (apiError?.code) {
    return translateErrorCode(apiError.code, apiError.params);
  }
  return fallback;
}

export function AdminLeaderboardPage() {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language.startsWith("en") ? "en" : "id";

  const [adminGames, setAdminGames] = useState<AdminGameItem[]>([]);
  const gameOptions = useMemo(() => {
    if (adminGames.length > 0) {
      return adminGames.map((g) => ({
        value: g.id,
        label:
          g.manifest?.title[currentLang] ??
          g.manifest?.title.id ??
          g.id,
      }));
    }
    return registeredGames.map((g) => ({
      value: g.id,
      label: g.title[currentLang] ?? g.title.id ?? g.id,
    }));
  }, [adminGames, currentLang]);

  const [selectedGame, setSelectedGame] = useState(
    () => registeredGames[0]?.id ?? "flappy-bird",
  );
  const [filterFlaggedOnly, setFilterFlaggedOnly] = useState(false);
  const [runs, setRuns] = useState<AdminGameRunItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [deleteRunId, setDeleteRunId] = useState<string | null>(null);
  const [resetPeriod, setResetPeriod] = useState<"week" | "month" | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchAdminGamesApi()
      .then((res) => {
        if (!mounted) return;
        setAdminGames(res.items);
        if (
          res.items.length > 0 &&
          !res.items.some((g) => g.id === selectedGame)
        ) {
          setSelectedGame(res.items[0]!.id);
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [selectedGame]);

  const loadRuns = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminRunsApi({
        gameId: selectedGame,
        flagged: filterFlaggedOnly ? true : undefined,
        page,
        pageSize: 25,
      });
      setRuns(res.items);
      setTotalPages(Math.max(1, Math.ceil(res.total / res.pageSize)));
    } catch (err: unknown) {
      setError(getErrorText(err, t("state.error")));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    getAdminRunsApi({
      gameId: selectedGame,
      flagged: filterFlaggedOnly ? true : undefined,
      page,
      pageSize: 25,
    })
      .then((res) => {
        if (mounted) {
          setRuns(res.items);
          setTotalPages(Math.max(1, Math.ceil(res.total / res.pageSize)));
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (mounted) {
          setError(getErrorText(err, t("state.error")));
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [selectedGame, filterFlaggedOnly, page, t]);

  const handleDeleteRun = async () => {
    if (!deleteRunId) return;
    try {
      await deleteAdminRunApi(deleteRunId);
      setDeleteRunId(null);
      await loadRuns();
    } catch (err: unknown) {
      setError(getErrorText(err, t("state.error")));
    }
  };

  const handleResetBoard = async () => {
    if (!resetPeriod) return;
    try {
      await resetAdminLeaderboardApi(selectedGame, resetPeriod);
      setResetPeriod(null);
      await loadRuns();
    } catch (err: unknown) {
      setError(getErrorText(err, t("state.error")));
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return "—";
    try {
      const date = new Date(isoString);
      if (Number.isNaN(date.getTime())) return isoString;
      return new Intl.DateTimeFormat(i18n.language === "id" ? "id-ID" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
    } catch {
      return isoString;
    }
  };

  const formatDuration = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    const remSec = sec % 60;
    return `${min}m ${remSec}s`;
  };

  const resolvePlayerName = (r: AdminGameRunItem) =>
    r.displayName ?? r.user?.displayName ?? r.username ?? r.user?.username ?? "—";

  const resolvePlayerUsername = (r: AdminGameRunItem) =>
    r.username ?? r.user?.username ?? null;

  const resolvePlayedAt = (r: AdminGameRunItem) => r.playedAt ?? r.createdAt;

  return (
    <div className="ls-admin-page">
      <div className="ls-admin-page-header">
        <h1 className="ls-admin-page-title">{t("admin.leaderboard.title")}</h1>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Button variant="secondary" onClick={() => setResetPeriod("week")}>
            {t("admin.leaderboard.resetWeek")}
          </Button>
          <Button variant="secondary" onClick={() => setResetPeriod("month")}>
            {t("admin.leaderboard.resetMonth")}
          </Button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-4)",
          alignItems: "center",
          marginBottom: "var(--space-6)",
        }}
      >
        <SegmentedControl
          label={t("admin.leaderboard.selectGame")}
          options={gameOptions}
          value={selectedGame}
          onChange={(val) => {
            setSelectedGame(val);
            setPage(1);
          }}
        />

        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-2)",
            fontSize: "var(--font-small)",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={filterFlaggedOnly}
            onChange={(e) => {
              setFilterFlaggedOnly(e.target.checked);
              setPage(1);
            }}
          />
          {t("admin.leaderboard.filterFlagged")}
        </label>
      </div>

      {error && (
        <div style={{ color: "var(--danger-text)", marginBottom: "var(--space-4)" }}>
          {error}
        </div>
      )}

      {loading ? (
        <p className="ls-text-secondary">{t("state.loading")}</p>
      ) : (
        <div className="ls-card">
          {runs.length === 0 ? (
            <p className="ls-text-secondary" style={{ textAlign: "center", padding: "var(--space-6)" }}>
              {t("admin.leaderboard.emptyRuns")}
            </p>
          ) : (
            <>
              <div className="ls-admin-table-container">
                <table className="ls-admin-table">
                  <thead>
                    <tr>
                      <th scope="col">{t("admin.leaderboard.colTime")}</th>
                      <th scope="col">{t("admin.leaderboard.colPlayer")}</th>
                      <th scope="col">{t("admin.leaderboard.colScore")}</th>
                      <th scope="col">{t("admin.leaderboard.colDuration")}</th>
                      <th scope="col">{t("admin.leaderboard.colFlagged")}</th>
                      <th scope="col" style={{ textAlign: "right" }}>{t("admin.leaderboard.colActions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => {
                      const uname = resolvePlayerUsername(r);
                      return (
                        <tr key={r.id}>
                          <td style={{ whiteSpace: "nowrap", fontSize: "var(--font-caption)" }}>
                            {formatDate(resolvePlayedAt(r))}
                          </td>
                          <td>
                            <strong>{resolvePlayerName(r)}</strong>
                            {uname && (
                              <div style={{ fontSize: "var(--font-caption)", color: "var(--text-secondary)" }}>
                                @{uname}
                              </div>
                            )}
                          </td>
                          <td>
                            <strong style={{ fontSize: "var(--font-body)" }}>{r.score.toLocaleString()}</strong>
                          </td>
                          <td>{formatDuration(r.durationMs)}</td>
                          <td>
                            <Chip tone={r.flagged ? "danger" : "success"}>
                              {r.flagged ? t("admin.leaderboard.flagged") : t("admin.leaderboard.normal")}
                            </Chip>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <Button
                              variant="danger"
                              onClick={() => setDeleteRunId(r.id)}
                            >
                              {t("admin.leaderboard.deleteRun")}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="ls-admin-card-list">
                {runs.map((r) => {
                  const uname = resolvePlayerUsername(r);
                  return (
                    <div key={r.id} className="ls-admin-mobile-card">
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <strong>{resolvePlayerName(r)}</strong>
                          {uname && (
                            <span style={{ marginLeft: "var(--space-1)", fontSize: "var(--font-caption)", color: "var(--text-secondary)" }}>
                              (@{uname})
                            </span>
                          )}
                        </div>
                        <Chip tone={r.flagged ? "danger" : "success"}>
                          {r.flagged ? t("admin.leaderboard.flagged") : t("admin.leaderboard.normal")}
                        </Chip>
                      </div>
                      <div style={{ fontSize: "var(--font-small)", color: "var(--text-secondary)" }}>
                        {t("admin.leaderboard.colScore")}: <strong>{r.score.toLocaleString()}</strong> • {formatDuration(r.durationMs)}
                      </div>
                      <div style={{ fontSize: "var(--font-caption)", color: "var(--text-muted)" }}>
                        {formatDate(resolvePlayedAt(r))}
                      </div>
                      <div style={{ marginTop: "var(--space-2)" }}>
                        <Button
                          variant="danger"
                          onClick={() => setDeleteRunId(r.id)}
                        >
                          {t("admin.leaderboard.deleteRun")}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                &larr;
              </Button>
              <span style={{ alignSelf: "center", fontSize: "var(--font-small)" }}>
                {page} / {totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                &rarr;
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Modal Hapus Run */}
      <Modal
        title={t("admin.leaderboard.deleteRun")}
        open={Boolean(deleteRunId)}
        onClose={() => setDeleteRunId(null)}
        closeLabel={t("action.close")}
      >
        <p style={{ margin: "var(--space-4) 0", color: "var(--text-secondary)" }}>
          {t("admin.leaderboard.confirmDeleteRun")}
        </p>
        <div className="ls-row" style={{ justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button variant="secondary" onClick={() => setDeleteRunId(null)}>
            {t("action.cancel")}
          </Button>
          <Button variant="danger" onClick={handleDeleteRun}>
            {t("admin.leaderboard.deleteRun")}
          </Button>
        </div>
      </Modal>

      {/* Modal Reset Leaderboard */}
      <Modal
        title={
          resetPeriod === "week"
            ? t("admin.leaderboard.resetWeek")
            : t("admin.leaderboard.resetMonth")
        }
        open={Boolean(resetPeriod)}
        onClose={() => setResetPeriod(null)}
        closeLabel={t("action.close")}
      >
        <p style={{ margin: "var(--space-4) 0", color: "var(--text-secondary)" }}>
          {resetPeriod === "week"
            ? t("admin.leaderboard.confirmResetWeek")
            : t("admin.leaderboard.confirmResetMonth")}
        </p>
        <div className="ls-row" style={{ justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button variant="secondary" onClick={() => setResetPeriod(null)}>
            {t("action.cancel")}
          </Button>
          <Button variant="danger" onClick={handleResetBoard}>
            {t("action.confirm")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
