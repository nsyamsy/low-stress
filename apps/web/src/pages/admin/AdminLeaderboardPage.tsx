import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Chip, Modal, SegmentedControl } from "@low-stress/ui";
import {
  deleteAdminRunApi,
  getAdminRunsApi,
  resetAdminLeaderboardApi,
  type AdminGameRunItem,
} from "../../features/admin/api";

const GAME_OPTIONS = [
  { value: "flappy-bird", label: "Flappy Bird" },
  { value: "memory-match", label: "Memory Match" },
  { value: "ludo", label: "Ludo" },
];

export function AdminLeaderboardPage() {
  const { t, i18n } = useTranslation();
  const [selectedGame, setSelectedGame] = useState("flappy-bird");
  const [filterFlaggedOnly, setFilterFlaggedOnly] = useState(false);
  const [runs, setRuns] = useState<AdminGameRunItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [deleteRunId, setDeleteRunId] = useState<string | null>(null);
  const [resetPeriod, setResetPeriod] = useState<"week" | "month" | null>(null);

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
      setError(err instanceof Error ? err.message : "Gagal memuat catatan run");
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
        }
      })
      .catch((err: unknown) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Gagal memuat catatan run");
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [selectedGame, filterFlaggedOnly, page]);

  const handleDeleteRun = async () => {
    if (!deleteRunId) return;
    try {
      await deleteAdminRunApi(deleteRunId);
      setDeleteRunId(null);
      await loadRuns();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal menghapus run");
    }
  };

  const handleResetBoard = async () => {
    if (!resetPeriod) return;
    try {
      await resetAdminLeaderboardApi(selectedGame, resetPeriod);
      setResetPeriod(null);
      await loadRuns();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal mereset leaderboard");
    }
  };

  const formatDate = (isoString: string) => {
    try {
      return new Intl.DateTimeFormat(i18n.language === "id" ? "id-ID" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(isoString));
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
          label=""
          options={GAME_OPTIONS}
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
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: "nowrap", fontSize: "var(--font-caption)" }}>
                        {formatDate(r.playedAt)}
                      </td>
                      <td>
                        <strong>{r.displayName}</strong>
                        <div style={{ fontSize: "var(--font-caption)", color: "var(--text-secondary)" }}>
                          @{r.username}
                        </div>
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
                  ))}
                </tbody>
              </table>
            </div>
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
