import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@low-stress/ui";
import {
  getAdminDashboardApi,
  updateAdminUserStatusApi,
  type AdminDashboardData,
} from "../../features/admin";

export function AdminDashboardPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = async () => {
    try {
      const res = await getAdminDashboardApi();
      setData(res);
    } catch {
      // Abaikan
    }
  };

  useEffect(() => {
    let mounted = true;
    getAdminDashboardApi()
      .then((res) => {
        if (mounted) setData(res);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleQuickApprove = async (id: string) => {
    await updateAdminUserStatusApi(id, "approve");
    void loadDashboard();
  };

  const handleQuickReject = async (id: string) => {
    await updateAdminUserStatusApi(id, "reject");
    void loadDashboard();
  };

  if (loading) {
    return <p className="ls-text-secondary">{t("state.loading")}</p>;
  }

  return (
    <div>
      <h1
        style={{
          fontSize: "var(--font-h1)",
          color: "var(--text-primary)",
          marginBottom: "var(--space-6)",
        }}
      >
        {t("admin.dashboard.title")}
      </h1>

      {/* 4 Stat Cards */}
      <div className="ls-admin-grid-cards">
        <div className="ls-admin-stat-card">
          <span style={{ fontSize: "var(--font-small)", color: "var(--text-secondary)" }}>
            {t("admin.dashboard.activeToday")}
          </span>
          <div className="ls-admin-stat-number">{data?.activeToday ?? 0}</div>
        </div>

        <div className="ls-admin-stat-card">
          <span style={{ fontSize: "var(--font-small)", color: "var(--text-secondary)" }}>
            {t("admin.dashboard.pending")}
          </span>
          <div className="ls-admin-stat-number" style={{ color: "var(--accent-text)" }}>
            {data?.pending ?? 0}
          </div>
        </div>

        <div className="ls-admin-stat-card">
          <span style={{ fontSize: "var(--font-small)", color: "var(--text-secondary)" }}>
            {t("admin.dashboard.runsToday")}
          </span>
          <div className="ls-admin-stat-number">{data?.runsToday ?? 0}</div>
        </div>

        <div className="ls-admin-stat-card">
          <span style={{ fontSize: "var(--font-small)", color: "var(--text-secondary)" }}>
            {t("admin.dashboard.newRegistrations7d")}
          </span>
          <div className="ls-admin-stat-number">{data?.newRegistrations7d ?? 0}</div>
        </div>
      </div>

      {/* Pending Section */}
      <div className="ls-admin-card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "var(--space-4)",
          }}
        >
          <h2 style={{ fontSize: "var(--font-h2)", margin: 0 }}>
            {t("admin.dashboard.pendingSection")} ({data?.pending ?? 0})
          </h2>
          <Link to="/admin/approvals" className="ls-link" style={{ fontSize: "var(--font-small)" }}>
            {t("admin.dashboard.viewAll")}
          </Link>
        </div>

        {data?.pendingQueue && data.pendingQueue.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {data.pendingQueue.map((user) => (
              <div
                key={user.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "var(--space-3)",
                  background: "var(--bg-inset)",
                  borderRadius: "var(--radius-control)",
                  flexWrap: "wrap",
                  gap: "var(--space-2)",
                }}
              >
                <div>
                  <div style={{ fontWeight: "var(--weight-medium)" }}>
                    {user.displayName}{" "}
                    <span style={{ color: "var(--text-secondary)", fontSize: "var(--font-small)" }}>
                      (@{user.username})
                    </span>
                  </div>
                  <div style={{ fontSize: "var(--font-caption)", color: "var(--text-muted)" }}>
                    {user.email}
                  </div>
                </div>

                <div className="ls-row" style={{ gap: "var(--space-2)" }}>
                  <Button onClick={() => handleQuickApprove(user.id)}>
                    {t("admin.approvals.approve")}
                  </Button>
                  <Button variant="secondary" onClick={() => handleQuickReject(user.id)}>
                    {t("admin.approvals.reject")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: "var(--font-small)" }}>
            {t("admin.dashboard.noPending")}
          </p>
        )}
      </div>

      {/* Runs by Game */}
      <div className="ls-admin-card">
        <h2 style={{ fontSize: "var(--font-h2)", marginBottom: "var(--space-4)" }}>
          {t("admin.dashboard.runsByGame")}
        </h2>
        {data?.runsByGame && Object.keys(data.runsByGame).length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {Object.entries(data.runsByGame).map(([gameId, count]) => (
              <div
                key={gameId}
                className="ls-admin-row-item"
              >
                <span style={{ fontWeight: "var(--weight-medium)" }}>{gameId}</span>
                <span style={{ color: "var(--primary)", fontWeight: "var(--weight-medium)" }}>
                  {t("admin.dashboard.playsCount", { count })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: "var(--font-small)" }}>
            {t("admin.dashboard.noRuns")}
          </p>
        )}
      </div>
    </div>
  );
}
