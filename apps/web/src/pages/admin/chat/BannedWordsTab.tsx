import { useTranslation } from "react-i18next";
import { Button, Chip } from "@low-stress/ui";
import type { AdminBannedWordItem } from "../../../features/admin/api";

export function BannedWordsTab({
  bannedWords,
  onToggleWord,
  onDeleteWord,
}: {
  bannedWords: AdminBannedWordItem[];
  onToggleWord: (id: string, currentlyEnabled: boolean) => void;
  onDeleteWord: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="ls-card">
      {bannedWords.length === 0 ? (
        <p
          className="ls-text-secondary"
          style={{ textAlign: "center", padding: "var(--space-6)" }}
        >
          {t("admin.chat.emptyWords")}
        </p>
      ) : (
        <>
          <div className="ls-admin-table-container">
            <table className="ls-admin-table">
              <thead>
                <tr>
                  <th scope="col">{t("admin.chat.word")}</th>
                  <th scope="col">{t("admin.chat.lang")}</th>
                  <th scope="col">{t("admin.chat.colSource")}</th>
                  <th scope="col">{t("admin.chat.status")}</th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    {t("admin.chat.colActions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {bannedWords.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <strong>{w.word}</strong>
                    </td>
                    <td>
                      <span
                        style={{
                          textTransform: "uppercase",
                          fontSize: "var(--font-caption)",
                        }}
                      >
                        {w.lang}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: "var(--font-caption)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {w.source}
                      </span>
                    </td>
                    <td>
                      <Chip tone={w.enabled ? "success" : "neutral"}>
                        {w.enabled
                          ? t("admin.chat.active")
                          : t("admin.chat.inactive")}
                      </Chip>
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <Button
                        variant="secondary"
                        style={{ marginRight: "var(--space-2)" }}
                        onClick={() => onToggleWord(w.id, w.enabled)}
                      >
                        {w.enabled
                          ? t("admin.chat.inactive")
                          : t("admin.chat.active")}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => onDeleteWord(w.id)}
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
            {bannedWords.map((w) => (
              <div key={w.id} className="ls-admin-mobile-card">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <strong>{w.word}</strong>
                  <Chip tone={w.enabled ? "success" : "neutral"}>
                    {w.enabled
                      ? t("admin.chat.active")
                      : t("admin.chat.inactive")}
                  </Chip>
                </div>
                <div
                  style={{
                    fontSize: "var(--font-caption)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {t("admin.chat.lang")}: {w.lang.toUpperCase()} •{" "}
                  {t("admin.chat.colSource")}: {w.source}
                </div>
                <div
                  className="ls-row"
                  style={{
                    gap: "var(--space-2)",
                    marginTop: "var(--space-2)",
                  }}
                >
                  <Button
                    variant="secondary"
                    onClick={() => onToggleWord(w.id, w.enabled)}
                  >
                    {w.enabled
                      ? t("admin.chat.inactive")
                      : t("admin.chat.active")}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => onDeleteWord(w.id)}
                  >
                    {t("admin.chat.delete")}
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
