import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@low-stress/ui";
import {
  bulkUpdateAdminUsersApi,
  getAdminUsersApi,
  updateAdminUserStatusApi,
  type AdminUserItem,
} from "../../features/admin";

export function AdminApprovalsPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadPendingUsers = async () => {
    try {
      setLoading(true);
      const res = await getAdminUsersApi({ status: "pending", pageSize: 100 });
      setUsers(res.items);
      setSelectedIds([]);
    } catch {
      // Abaikan
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    getAdminUsersApi({ status: "pending", pageSize: 100 })
      .then((res) => {
        if (mounted) {
          setUsers(res.items);
          setSelectedIds([]);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const toggleSelectAll = () => {
    if (selectedIds.length === users.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(users.map((u) => u.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleSingleApprove = async (id: string) => {
    setSubmitting(true);
    try {
      await updateAdminUserStatusApi(id, "approve");
      await loadPendingUsers();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSingleReject = async (id: string) => {
    setSubmitting(true);
    try {
      await updateAdminUserStatusApi(id, "reject");
      await loadPendingUsers();
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    setSubmitting(true);
    try {
      await bulkUpdateAdminUsersApi(selectedIds, "approve");
      await loadPendingUsers();
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkReject = async () => {
    if (selectedIds.length === 0) return;
    setSubmitting(true);
    try {
      await bulkUpdateAdminUsersApi(selectedIds, "reject");
      await loadPendingUsers();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--space-6)",
          flexWrap: "wrap",
          gap: "var(--space-4)",
        }}
      >
        <h1 style={{ fontSize: "var(--font-h1)", margin: 0 }}>
          {t("admin.approvals.title")} ({users.length})
        </h1>

        {selectedIds.length > 0 && (
          <div className="ls-row" style={{ gap: "var(--space-2)" }}>
            <span style={{ fontSize: "var(--font-small)", color: "var(--text-secondary)" }}>
              {t("admin.approvals.selectedCount", { count: selectedIds.length })}
            </span>
            <Button disabled={submitting} onClick={handleBulkApprove}>
              {t("admin.approvals.bulkApprove")}
            </Button>
            <Button variant="secondary" disabled={submitting} onClick={handleBulkReject}>
              {t("admin.approvals.bulkReject")}
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="ls-text-secondary">{t("state.loading")}</p>
      ) : users.length === 0 ? (
        <div className="ls-admin-card" style={{ textAlign: "center", padding: "var(--space-8)" }}>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            {t("admin.approvals.empty")}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="ls-admin-table-container">
            <table className="ls-admin-table">
              <thead>
                <tr>
                  <th scope="col" style={{ width: "var(--space-8)" }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.length === users.length && users.length > 0}
                      onChange={toggleSelectAll}
                      aria-label={t("admin.approvals.selectAll")}
                    />
                  </th>
                  <th scope="col">{t("admin.users.colUsername")}</th>
                  <th scope="col">{t("admin.users.colName")}</th>
                  <th scope="col">{t("admin.users.colEmail")}</th>
                  <th scope="col">{t("admin.users.colJoined")}</th>
                  <th scope="col" style={{ textAlign: "right" }}>{t("admin.users.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(u.id)}
                        onChange={() => toggleSelect(u.id)}
                        aria-label={`${t("admin.users.colUsername")}: ${u.username}`}
                      />
                    </td>
                    <td style={{ fontWeight: "var(--weight-medium)" }}>@{u.username}</td>
                    <td>{u.displayName}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{u.email}</td>
                    <td style={{ color: "var(--text-muted)", fontSize: "var(--font-caption)" }}>
                      {new Date(u.createdAt).toLocaleString()}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="ls-row" style={{ justifyContent: "flex-end", gap: "var(--space-2)" }}>
                        <Button
                          disabled={submitting}
                          onClick={() => handleSingleApprove(u.id)}
                        >
                          {t("admin.approvals.approve")}
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={submitting}
                          onClick={() => handleSingleReject(u.id)}
                        >
                          {t("admin.approvals.reject")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="ls-admin-card-list">
            <div style={{ marginBottom: "var(--space-2)" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--font-small)" }}>
                <input
                  type="checkbox"
                  checked={selectedIds.length === users.length && users.length > 0}
                  onChange={toggleSelectAll}
                />
                {t("admin.approvals.selectAll")}
              </label>
            </div>

            {users.map((u) => (
              <div key={u.id} className="ls-admin-mobile-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontWeight: "var(--weight-medium)" }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(u.id)}
                      onChange={() => toggleSelect(u.id)}
                    />
                    @{u.username}
                  </label>
                  <span style={{ fontSize: "var(--font-caption)", color: "var(--text-muted)" }}>
                    {new Date(u.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div style={{ fontSize: "var(--font-small)", color: "var(--text-secondary)" }}>
                  {u.displayName} • {u.email}
                </div>

                <div className="ls-row" style={{ marginTop: "var(--space-2)", gap: "var(--space-2)" }}>
                  <Button
                    style={{ flex: 1 }}
                    disabled={submitting}
                    onClick={() => handleSingleApprove(u.id)}
                  >
                    {t("admin.approvals.approve")}
                  </Button>
                  <Button
                    variant="secondary"
                    style={{ flex: 1 }}
                    disabled={submitting}
                    onClick={() => handleSingleReject(u.id)}
                  >
                    {t("admin.approvals.reject")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
