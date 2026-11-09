import { useTranslation } from "react-i18next";
import { Button } from "@low-stress/ui";
import type { AdminChatMuteItem } from "../../../features/admin/api";

export function ChatMutesTab({
  mutes,
  onUnmuteUser,
  formatDate,
}: {
  mutes: AdminChatMuteItem[];
  onUnmuteUser: (userId: string) => void;
  formatDate: (iso: string) => string;
}) {
  const { t } = useTranslation();

  return (
    <div className="ls-card">
      {mutes.length === 0 ? (
        <p
          className="ls-text-secondary"
          style={{ textAlign: "center", padding: "var(--space-6)" }}
        >
          {t("admin.chat.emptyMutes")}
        </p>
      ) : (
        <>
          <div className="ls-admin-table-container">
            <table className="ls-admin-table">
              <thead>
                <tr>
                  <th scope="col">{t("admin.chat.colUser")}</th>
                  <th scope="col">{t("admin.chat.colMutedUntil")}</th>
                  <th scope="col">{t("admin.chat.colReason")}</th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    {t("admin.chat.colActions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {mutes.map((m) => (
                  <tr key={m.userId}>
                    <td>
                      <strong>{m.displayName}</strong>
                      <div
                        style={{
                          fontSize: "var(--font-caption)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        @{m.username}
                      </div>
                    </td>
                    <td>{formatDate(m.mutedUntil)}</td>
                    <td>{m.reason || "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <Button
                        variant="secondary"
                        onClick={() => onUnmuteUser(m.userId)}
                      >
                        {t("admin.chat.unmute")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ls-admin-card-list">
            {mutes.map((m) => (
              <div key={m.userId} className="ls-admin-mobile-card">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <strong>{m.displayName}</strong>{" "}
                    <span
                      style={{
                        fontSize: "var(--font-caption)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      (@{m.username})
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: "var(--font-caption)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {formatDate(m.mutedUntil)}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "var(--font-small)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {t("admin.chat.colReason")}: {m.reason || "—"}
                </div>
                <div style={{ marginTop: "var(--space-2)" }}>
                  <Button
                    variant="secondary"
                    onClick={() => onUnmuteUser(m.userId)}
                  >
                    {t("admin.chat.unmute")}
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
