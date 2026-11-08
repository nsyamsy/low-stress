import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Chip, Input } from "@low-stress/ui";
import { getAdminAuditLogsApi, type AuditLogItem } from "../../features/admin";

export function AdminAuditPage() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");

  useEffect(() => {
    let mounted = true;
    getAdminAuditLogsApi({
      action: actionFilter || undefined,
      pageSize: 50,
    })
      .then((res) => {
        if (mounted) setLogs(res.items);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [actionFilter]);

  return (
    <div>
      <h1 style={{ fontSize: "var(--font-h1)", marginBottom: "var(--space-6)" }}>
        {t("admin.audit.title")}
      </h1>

      <div className="ls-admin-card" style={{ padding: "var(--space-4)" }}>
        <div className="ls-admin-filter-control">
          <Input
            label={t("admin.audit.colAction")}
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder={t("admin.audit.filterAction")}
          />
        </div>
      </div>

      {loading ? (
        <p className="ls-text-secondary">{t("state.loading")}</p>
      ) : logs.length === 0 ? (
        <div className="ls-admin-card" style={{ textAlign: "center", padding: "var(--space-8)" }}>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            {t("admin.audit.empty")}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="ls-admin-table-container">
            <table className="ls-admin-table">
              <thead>
                <tr>
                  <th scope="col">{t("admin.audit.colTime")}</th>
                  <th scope="col">{t("admin.audit.colAdmin")}</th>
                  <th scope="col">{t("admin.audit.colAction")}</th>
                  <th scope="col">{t("admin.audit.colTarget")}</th>
                  <th scope="col">{t("admin.audit.colDetail")}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ color: "var(--text-muted)", fontSize: "var(--font-caption)", whiteSpace: "nowrap" }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td style={{ fontWeight: "var(--weight-medium)" }}>
                      @{log.adminUsername ?? "system"}
                    </td>
                    <td>
                      <Chip tone="neutral">{log.action}</Chip>
                    </td>
                    <td style={{ fontSize: "var(--font-caption)", color: "var(--text-secondary)" }}>
                      {log.targetType ? `${log.targetType}: ${log.targetId ?? "-"}` : "-"}
                    </td>
                    <td style={{ fontSize: "var(--font-caption)", fontFamily: "var(--font-mono)" }}>
                      {log.detail !== null && log.detail !== undefined ? JSON.stringify(log.detail) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="ls-admin-card-list">
            {logs.map((log) => (
              <div key={log.id} className="ls-admin-mobile-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Chip tone="neutral">{log.action}</Chip>
                  <span style={{ fontSize: "var(--font-caption)", color: "var(--text-muted)" }}>
                    {new Date(log.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div style={{ fontSize: "var(--font-small)", fontWeight: "var(--weight-medium)" }}>
                  {t("admin.audit.colAdmin")}: @{log.adminUsername ?? "system"}
                </div>
                {log.targetType && (
                  <div style={{ fontSize: "var(--font-caption)", color: "var(--text-secondary)" }}>
                    {t("admin.audit.colTarget")}: {log.targetType} ({log.targetId})
                  </div>
                )}
                {Boolean(log.detail) && (
                  <pre
                    style={{
                      margin: 0,
                      background: "var(--bg-inset)",
                      padding: "var(--space-2)",
                      borderRadius: "var(--radius-control)",
                      fontSize: "var(--font-caption)",
                      overflowX: "auto",
                    }}
                  >
                    {JSON.stringify(log.detail, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
