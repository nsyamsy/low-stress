import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Chip, Input, Modal } from "@low-stress/ui";
import {
  deleteAdminUserApi,
  getAdminUsersApi,
  updateAdminUserStatusApi,
  type AdminUserItem,
} from "../../features/admin";

export function AdminUsersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modal konfirmasi hapus / ban
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    type: "delete" | "ban";
    userId: string;
    username: string;
  }>({ open: false, type: "delete", userId: "", username: "" });

  // Modal reset password
  const [tempPasswordModal, setTempPasswordModal] = useState<{
    open: boolean;
    password: string;
    copied: boolean;
  }>({ open: false, password: "", copied: false });

  const loadUsers = async () => {
    try {
      setLoading(true);
      const res = await getAdminUsersApi({
        status: statusFilter || undefined,
        q: searchQuery || undefined,
        pageSize: 50,
      });
      setUsers(res.items);
    } catch {
      // Abaikan
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    getAdminUsersApi({
      status: statusFilter || undefined,
      q: searchQuery || undefined,
      pageSize: 50,
    })
      .then((res) => {
        if (mounted) setUsers(res.items);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [statusFilter, searchQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadUsers();
  };

  const handleAction = async (
    userId: string,
    action: "approve" | "reject" | "suspend" | "ban" | "activate" | "reset-password",
  ) => {
    if (action === "reset-password") {
      const res = await updateAdminUserStatusApi(userId, "reset-password");
      if (res.temporaryPassword) {
        setTempPasswordModal({
          open: true,
          password: res.temporaryPassword,
          copied: false,
        });
      }
      return;
    }

    await updateAdminUserStatusApi(userId, action);
    await loadUsers();
  };

  const handleConfirmAction = async () => {
    if (confirmModal.type === "delete") {
      await deleteAdminUserApi(confirmModal.userId);
    } else if (confirmModal.type === "ban") {
      await updateAdminUserStatusApi(confirmModal.userId, "ban");
    }
    setConfirmModal({ open: false, type: "delete", userId: "", username: "" });
    await loadUsers();
  };

  const copyTempPassword = () => {
    navigator.clipboard.writeText(tempPasswordModal.password);
    setTempPasswordModal((prev) => ({ ...prev, copied: true }));
  };

  const statusTone = (status: string): "neutral" | "success" | "warning" | "danger" => {
    switch (status) {
      case "active":
        return "success";
      case "pending":
        return "warning";
      case "suspended":
      case "banned":
      case "rejected":
        return "danger";
      default:
        return "neutral";
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: "var(--font-h1)", marginBottom: "var(--space-6)" }}>
        {t("admin.users.title")}
      </h1>

      {/* Filter and Search Bar */}
      <div className="ls-admin-card" style={{ padding: "var(--space-4)" }}>
        <form onSubmit={handleSearchSubmit} className="ls-row" style={{ gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
          <div style={{ flex: 1 }}>
            <Input
              label={t("admin.users.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" style={{ marginTop: 22 }}>
            Cari
          </Button>
        </form>

        <div className="ls-row" style={{ gap: "var(--space-2)", flexWrap: "wrap" }}>
          {[
            { label: t("admin.users.all"), value: "" },
            { label: t("admin.users.pending"), value: "pending" },
            { label: t("admin.users.active"), value: "active" },
            { label: t("admin.users.suspended"), value: "suspended" },
            { label: t("admin.users.banned"), value: "banned" },
            { label: t("admin.users.rejected"), value: "rejected" },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              className={`ls-chip ${statusFilter === item.value ? "ls-chip--success" : "ls-chip--neutral"}`}
              style={{ cursor: "pointer", border: "none" }}
              onClick={() => setStatusFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="ls-text-secondary">{t("state.loading")}</p>
      ) : users.length === 0 ? (
        <div className="ls-admin-card" style={{ textAlign: "center", padding: "var(--space-8)" }}>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            {t("admin.users.empty")}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="ls-admin-table-container">
            <table className="ls-admin-table">
              <thead>
                <tr>
                  <th>{t("admin.users.colUsername")}</th>
                  <th>{t("admin.users.colName")}</th>
                  <th>{t("admin.users.colEmail")}</th>
                  <th>{t("admin.users.colStatus")}</th>
                  <th>{t("admin.users.colJoined")}</th>
                  <th>{t("admin.users.colLastLogin")}</th>
                  <th style={{ textAlign: "right" }}>{t("admin.users.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: "var(--weight-medium)" }}>@{u.username}</td>
                    <td>{u.displayName}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{u.email}</td>
                    <td>
                      <Chip tone={statusTone(u.status)}>{u.status}</Chip>
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: "var(--font-caption)" }}>
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: "var(--font-caption)" }}>
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "-"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="ls-row" style={{ justifyContent: "flex-end", gap: "var(--space-1)" }}>
                        {u.status === "pending" && (
                          <>
                            <Button onClick={() => handleAction(u.id, "approve")}>
                              {t("admin.approvals.approve")}
                            </Button>
                            <Button variant="secondary" onClick={() => handleAction(u.id, "reject")}>
                              {t("admin.approvals.reject")}
                            </Button>
                          </>
                        )}

                        {u.status === "active" && (
                          <Button variant="secondary" onClick={() => handleAction(u.id, "suspend")}>
                            {t("admin.users.suspend")}
                          </Button>
                        )}

                        {(u.status === "suspended" || u.status === "banned" || u.status === "rejected") && (
                          <Button onClick={() => handleAction(u.id, "activate")}>
                            {t("admin.users.activate")}
                          </Button>
                        )}

                        {(u.status === "active" || u.status === "suspended") && (
                          <Button
                            variant="danger"
                            onClick={() =>
                              setConfirmModal({
                                open: true,
                                type: "ban",
                                userId: u.id,
                                username: u.username,
                              })
                            }
                          >
                            {t("admin.users.ban")}
                          </Button>
                        )}

                        <Button variant="ghost" onClick={() => handleAction(u.id, "reset-password")}>
                          {t("admin.users.resetPassword")}
                        </Button>

                        <Button
                          variant="danger"
                          onClick={() =>
                            setConfirmModal({
                              open: true,
                              type: "delete",
                              userId: u.id,
                              username: u.username,
                            })
                          }
                        >
                          {t("admin.users.delete")}
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
            {users.map((u) => (
              <div key={u.id} className="ls-admin-mobile-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: "var(--weight-medium)" }}>@{u.username}</span>
                  <Chip tone={statusTone(u.status)}>{u.status}</Chip>
                </div>

                <div style={{ fontSize: "var(--font-small)", color: "var(--text-secondary)" }}>
                  {u.displayName} • {u.email}
                </div>

                <div className="ls-row" style={{ flexWrap: "wrap", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                  {u.status === "pending" && (
                    <>
                      <Button onClick={() => handleAction(u.id, "approve")}>
                        {t("admin.approvals.approve")}
                      </Button>
                      <Button variant="secondary" onClick={() => handleAction(u.id, "reject")}>
                        {t("admin.approvals.reject")}
                      </Button>
                    </>
                  )}

                  {u.status === "active" && (
                    <Button variant="secondary" onClick={() => handleAction(u.id, "suspend")}>
                      {t("admin.users.suspend")}
                    </Button>
                  )}

                  {(u.status === "suspended" || u.status === "banned" || u.status === "rejected") && (
                    <Button onClick={() => handleAction(u.id, "activate")}>
                      {t("admin.users.activate")}
                    </Button>
                  )}

                  {(u.status === "active" || u.status === "suspended") && (
                    <Button
                      variant="danger"
                      onClick={() =>
                        setConfirmModal({
                          open: true,
                          type: "ban",
                          userId: u.id,
                          username: u.username,
                        })
                      }
                    >
                      {t("admin.users.ban")}
                    </Button>
                  )}

                  <Button variant="ghost" onClick={() => handleAction(u.id, "reset-password")}>
                    {t("admin.users.resetPassword")}
                  </Button>

                  <Button
                    variant="danger"
                    onClick={() =>
                      setConfirmModal({
                        open: true,
                        type: "delete",
                        userId: u.id,
                        username: u.username,
                      })
                    }
                  >
                    {t("admin.users.delete")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Confirmation Modal */}
      <Modal
        open={confirmModal.open}
        onClose={() => setConfirmModal((prev) => ({ ...prev, open: false }))}
        title={t("admin.modal.confirmTitle")}
        closeLabel={t("action.close")}
      >
        <p style={{ margin: "var(--space-4) 0", color: "var(--text-secondary)" }}>
          {confirmModal.type === "delete"
            ? t("admin.modal.confirmDelete")
            : t("admin.modal.confirmBan")}
        </p>
        <div className="ls-row" style={{ justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button variant="secondary" onClick={() => setConfirmModal((prev) => ({ ...prev, open: false }))}>
            {t("action.cancel")}
          </Button>
          <Button variant="danger" onClick={handleConfirmAction}>
            {confirmModal.type === "delete" ? t("action.close") : t("admin.users.ban")}
          </Button>
        </div>
      </Modal>

      {/* Temporary Password Modal */}
      <Modal
        open={tempPasswordModal.open}
        onClose={() => setTempPasswordModal({ open: false, password: "", copied: false })}
        title={t("admin.modal.tempPasswordTitle")}
        closeLabel={t("action.close")}
      >
        <p style={{ margin: "var(--space-2) 0", color: "var(--text-secondary)" }}>
          {t("admin.modal.tempPasswordNotice")}
        </p>
        <div className="ls-admin-temp-password-box">
          {tempPasswordModal.password}
        </div>
        <div className="ls-row" style={{ justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button onClick={copyTempPassword}>
            {tempPasswordModal.copied ? t("admin.modal.copied") : t("admin.modal.copy")}
          </Button>
          <Button variant="secondary" onClick={() => setTempPasswordModal({ open: false, password: "", copied: false })}>
            {t("admin.modal.close")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
