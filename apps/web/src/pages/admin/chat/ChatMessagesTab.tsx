import { useTranslation } from "react-i18next";
import { Button } from "@low-stress/ui";
import type { AdminChatMessageItem } from "../../../features/admin/api";

export function ChatMessagesTab({
  messages,
  page,
  totalPages,
  onPageChange,
  onMuteUser,
  onDeleteMessage,
  formatDate,
}: {
  messages: AdminChatMessageItem[];
  page: number;
  totalPages: number;
  onPageChange: (nextPage: number) => void;
  onMuteUser: (target: { id: string; name: string }) => void;
  onDeleteMessage: (id: string) => void;
  formatDate: (iso: string) => string;
}) {
  const { t } = useTranslation();

  return (
    <div className="ls-card">
      {messages.length === 0 ? (
        <p
          className="ls-text-secondary"
          style={{ textAlign: "center", padding: "var(--space-6)" }}
        >
          {t("admin.chat.emptyMessages")}
        </p>
      ) : (
        <>
          <div className="ls-admin-table-container">
            <table className="ls-admin-table">
              <thead>
                <tr>
                  <th scope="col">{t("admin.chat.colTime")}</th>
                  <th scope="col">{t("admin.chat.colSender")}</th>
                  <th scope="col">{t("admin.chat.colMessage")}</th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    {t("admin.chat.colActions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr key={m.id}>
                    <td
                      style={{
                        whiteSpace: "nowrap",
                        fontSize: "var(--font-caption)",
                      }}
                    >
                      {formatDate(m.createdAt)}
                    </td>
                    <td>
                      <strong>{m.name}</strong>
                      {m.username !== "deleted" && (
                        <div
                          style={{
                            fontSize: "var(--font-caption)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          @{m.username}
                        </div>
                      )}
                    </td>
                    <td style={{ wordBreak: "break-word" }}>{m.body}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {m.userId && (
                        <Button
                          variant="secondary"
                          style={{ marginRight: "var(--space-2)" }}
                          onClick={() =>
                            onMuteUser({ id: m.userId!, name: m.name })
                          }
                        >
                          {t("admin.chat.mute")}
                        </Button>
                      )}
                      <Button
                        variant="danger"
                        onClick={() => onDeleteMessage(m.id)}
                      >
                        {t("admin.chat.delete")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ls-admin-card-list">
            {messages.map((m) => (
              <div key={m.id} className="ls-admin-mobile-card">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <strong>{m.name}</strong>
                    {m.username !== "deleted" && (
                      <span
                        style={{
                          marginLeft: "var(--space-1)",
                          fontSize: "var(--font-caption)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        (@{m.username})
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: "var(--font-caption)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {formatDate(m.createdAt)}
                  </span>
                </div>
                <div
                  style={{
                    wordBreak: "break-word",
                    fontSize: "var(--font-body)",
                  }}
                >
                  {m.body}
                </div>
                <div
                  className="ls-row"
                  style={{
                    gap: "var(--space-2)",
                    marginTop: "var(--space-2)",
                  }}
                >
                  {m.userId && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        onMuteUser({ id: m.userId!, name: m.name })
                      }
                    >
                      {t("admin.chat.mute")}
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    onClick={() => onDeleteMessage(m.id)}
                  >
                    {t("admin.chat.delete")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "var(--space-2)",
            marginTop: "var(--space-4)",
          }}
        >
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            &larr;
          </Button>
          <span
            style={{
              alignSelf: "center",
              fontSize: "var(--font-small)",
            }}
          >
            {page} / {totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          >
            &rarr;
          </Button>
        </div>
      )}
    </div>
  );
}
