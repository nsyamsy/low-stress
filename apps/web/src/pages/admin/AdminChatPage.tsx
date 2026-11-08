import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateErrorCode } from "@low-stress/i18n";
import { Button, Chip, Input, Modal, SegmentedControl } from "@low-stress/ui";
import {
  deleteAdminBannedWordApi,
  deleteAdminChatMessageApi,
  getAdminBannedWordsApi,
  getAdminChatMessagesApi,
  getAdminChatMutesApi,
  muteUserApi,
  unmuteUserApi,
  createAdminBannedWordApi,
  updateAdminBannedWordApi,
  type AdminBannedWordItem,
  type AdminChatMessageItem,
  type AdminChatMuteItem,
} from "../../features/admin/api";
import type { ApiError } from "../../lib/apiFetch";

type ChatTab = "messages" | "mutes" | "words";

function getErrorText(err: unknown, fallback: string): string {
  const apiError = (err as { apiError?: ApiError })?.apiError;
  if (apiError?.code) {
    return translateErrorCode(apiError.code, apiError.params);
  }
  return fallback;
}

export function AdminChatPage() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<ChatTab>("messages");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Messages State
  const [messages, setMessages] = useState<AdminChatMessageItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteTargetMessage, setDeleteTargetMessage] = useState<string | null>(null);

  // Mute Modal State
  const [muteTargetUser, setMuteTargetUser] = useState<{ id: string; name: string } | null>(null);
  const [muteMinutes, setMuteMinutes] = useState("60");
  const [muteReason, setMuteReason] = useState("");

  // Mutes List State
  const [mutes, setMutes] = useState<AdminChatMuteItem[]>([]);
  const [unmuteTargetUser, setUnmuteTargetUser] = useState<string | null>(null);

  // Banned Words State
  const [bannedWords, setBannedWords] = useState<AdminBannedWordItem[]>([]);
  const [newWord, setNewWord] = useState("");
  const [newWordLang, setNewWordLang] = useState<"id" | "en" | "any">("any");
  const [showAddWordModal, setShowAddWordModal] = useState(false);
  const [deleteTargetWord, setDeleteTargetWord] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === "messages") {
        const res = await getAdminChatMessagesApi(page, 25);
        setMessages(res.items);
        setTotalPages(res.totalPages);
      } else if (activeTab === "mutes") {
        const res = await getAdminChatMutesApi();
        setMutes(res);
      } else if (activeTab === "words") {
        const res = await getAdminBannedWordsApi();
        setBannedWords(res);
      }
    } catch (err: unknown) {
      setError(getErrorText(err, t("state.error")));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const fetchTab = async () => {
      setLoading(true);
      setError(null);
      try {
        if (activeTab === "messages") {
          const res = await getAdminChatMessagesApi(page, 25);
          if (mounted) {
            setMessages(res.items);
            setTotalPages(res.totalPages);
          }
        } else if (activeTab === "mutes") {
          const res = await getAdminChatMutesApi();
          if (mounted) setMutes(res);
        } else if (activeTab === "words") {
          const res = await getAdminBannedWordsApi();
          if (mounted) setBannedWords(res);
        }
      } catch (err: unknown) {
        if (mounted) {
          setError(getErrorText(err, t("state.error")));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void fetchTab();
    return () => {
      mounted = false;
    };
  }, [activeTab, page, t]);

  // Actions
  const handleDeleteMessage = async () => {
    if (!deleteTargetMessage) return;
    try {
      await deleteAdminChatMessageApi(deleteTargetMessage);
      setDeleteTargetMessage(null);
      await loadData();
    } catch (err: unknown) {
      setError(getErrorText(err, t("state.error")));
    }
  };

  const handleMuteUser = async () => {
    if (!muteTargetUser) return;
    try {
      await muteUserApi(
        muteTargetUser.id,
        parseInt(muteMinutes, 10) || 60,
        muteReason.trim() || undefined,
      );
      setMuteTargetUser(null);
      setMuteReason("");
      await loadData();
    } catch (err: unknown) {
      setError(getErrorText(err, t("state.error")));
    }
  };

  const handleUnmuteUser = async () => {
    if (!unmuteTargetUser) return;
    try {
      await unmuteUserApi(unmuteTargetUser);
      setUnmuteTargetUser(null);
      await loadData();
    } catch (err: unknown) {
      setError(getErrorText(err, t("state.error")));
    }
  };

  const handleAddWord = async () => {
    if (!newWord.trim()) return;
    try {
      await createAdminBannedWordApi(
        newWord.trim().toLowerCase(),
        newWordLang,
      );
      setShowAddWordModal(false);
      setNewWord("");
      await loadData();
    } catch (err: unknown) {
      setError(getErrorText(err, t("state.error")));
    }
  };

  const handleToggleWord = async (id: string, currentlyEnabled: boolean) => {
    try {
      await updateAdminBannedWordApi(id, !currentlyEnabled);
      await loadData();
    } catch (err: unknown) {
      setError(getErrorText(err, t("state.error")));
    }
  };

  const handleDeleteWord = async () => {
    if (!deleteTargetWord) return;
    try {
      await deleteAdminBannedWordApi(deleteTargetWord);
      setDeleteTargetWord(null);
      await loadData();
    } catch (err: unknown) {
      setError(getErrorText(err, t("state.error")));
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

  return (
    <div className="ls-admin-page">
      <div className="ls-admin-page-header">
        <h1 className="ls-admin-page-title">{t("admin.chat.title")}</h1>
        {activeTab === "words" && (
          <Button variant="primary" onClick={() => setShowAddWordModal(true)}>
            {t("admin.chat.addWord")}
          </Button>
        )}
      </div>

      <div style={{ marginBottom: "var(--space-6)" }}>
        <SegmentedControl
          label={t("admin.chat.title")}
          options={[
            { value: "messages", label: t("admin.chat.tabMessages") },
            { value: "mutes", label: t("admin.chat.tabMutes") },
            { value: "words", label: t("admin.chat.tabBannedWords") },
          ]}
          value={activeTab}
          onChange={(val) => {
            setActiveTab(val as ChatTab);
            setPage(1);
          }}
        />
      </div>

      {error && (
        <div style={{ color: "var(--danger-text)", marginBottom: "var(--space-4)" }}>
          {error}
        </div>
      )}

      {loading ? (
        <p className="ls-text-secondary">{t("state.loading")}</p>
      ) : activeTab === "messages" ? (
        <div className="ls-card">
          {messages.length === 0 ? (
            <p className="ls-text-secondary" style={{ textAlign: "center", padding: "var(--space-6)" }}>
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
                      <th scope="col" style={{ textAlign: "right" }}>{t("admin.chat.colActions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {messages.map((m) => (
                      <tr key={m.id}>
                        <td style={{ whiteSpace: "nowrap", fontSize: "var(--font-caption)" }}>
                          {formatDate(m.createdAt)}
                        </td>
                        <td>
                          <strong>{m.name}</strong>
                          {m.username !== "deleted" && (
                            <div style={{ fontSize: "var(--font-caption)", color: "var(--text-secondary)" }}>
                              @{m.username}
                            </div>
                          )}
                        </td>
                        <td style={{ wordBreak: "break-word" }}>
                          {m.body}
                        </td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          {m.userId && (
                            <Button
                              variant="secondary"
                              style={{ marginRight: "var(--space-2)" }}
                              onClick={() =>
                                setMuteTargetUser({ id: m.userId!, name: m.name })
                              }
                            >
                              {t("admin.chat.mute")}
                            </Button>
                          )}
                          <Button
                            variant="danger"
                            onClick={() => setDeleteTargetMessage(m.id)}
                          >
                            {t("admin.chat.delete")}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards for Messages */}
              <div className="ls-admin-card-list">
                {messages.map((m) => (
                  <div key={m.id} className="ls-admin-mobile-card">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <strong>{m.name}</strong>
                        {m.username !== "deleted" && (
                          <span style={{ marginLeft: "var(--space-1)", fontSize: "var(--font-caption)", color: "var(--text-secondary)" }}>
                            (@{m.username})
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: "var(--font-caption)", color: "var(--text-muted)" }}>
                        {formatDate(m.createdAt)}
                      </span>
                    </div>
                    <div style={{ wordBreak: "break-word", fontSize: "var(--font-body)" }}>
                      {m.body}
                    </div>
                    <div className="ls-row" style={{ gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                      {m.userId && (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setMuteTargetUser({ id: m.userId!, name: m.name })
                          }
                        >
                          {t("admin.chat.mute")}
                        </Button>
                      )}
                      <Button
                        variant="danger"
                        onClick={() => setDeleteTargetMessage(m.id)}
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
      ) : activeTab === "mutes" ? (
        <div className="ls-card">
          {mutes.length === 0 ? (
            <p className="ls-text-secondary" style={{ textAlign: "center", padding: "var(--space-6)" }}>
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
                      <th scope="col" style={{ textAlign: "right" }}>{t("admin.chat.colActions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mutes.map((m) => (
                      <tr key={m.userId}>
                        <td>
                          <strong>{m.displayName}</strong>
                          <div style={{ fontSize: "var(--font-caption)", color: "var(--text-secondary)" }}>
                            @{m.username}
                          </div>
                        </td>
                        <td>{formatDate(m.mutedUntil)}</td>
                        <td>{m.reason || "—"}</td>
                        <td style={{ textAlign: "right" }}>
                          <Button
                            variant="secondary"
                            onClick={() => setUnmuteTargetUser(m.userId)}
                          >
                            {t("admin.chat.unmute")}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards for Mutes */}
              <div className="ls-admin-card-list">
                {mutes.map((m) => (
                  <div key={m.userId} className="ls-admin-mobile-card">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <strong>{m.displayName}</strong>{" "}
                        <span style={{ fontSize: "var(--font-caption)", color: "var(--text-secondary)" }}>
                          (@{m.username})
                        </span>
                      </div>
                      <span style={{ fontSize: "var(--font-caption)", color: "var(--text-muted)" }}>
                        {formatDate(m.mutedUntil)}
                      </span>
                    </div>
                    <div style={{ fontSize: "var(--font-small)", color: "var(--text-secondary)" }}>
                      {t("admin.chat.colReason")}: {m.reason || "—"}
                    </div>
                    <div style={{ marginTop: "var(--space-2)" }}>
                      <Button
                        variant="secondary"
                        onClick={() => setUnmuteTargetUser(m.userId)}
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
      ) : (
        <div className="ls-card">
          {bannedWords.length === 0 ? (
            <p className="ls-text-secondary" style={{ textAlign: "center", padding: "var(--space-6)" }}>
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
                      <th scope="col" style={{ textAlign: "right" }}>{t("admin.chat.colActions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bannedWords.map((w) => (
                      <tr key={w.id}>
                        <td>
                          <strong>{w.word}</strong>
                        </td>
                        <td>
                          <span style={{ textTransform: "uppercase", fontSize: "var(--font-caption)" }}>
                            {w.lang}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: "var(--font-caption)", color: "var(--text-secondary)" }}>
                            {w.source}
                          </span>
                        </td>
                        <td>
                          <Chip tone={w.enabled ? "success" : "neutral"}>
                            {w.enabled ? t("admin.chat.active") : t("admin.chat.inactive")}
                          </Chip>
                        </td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <Button
                            variant="secondary"
                            style={{ marginRight: "var(--space-2)" }}
                            onClick={() => handleToggleWord(w.id, w.enabled)}
                          >
                            {w.enabled ? t("admin.chat.inactive") : t("admin.chat.active")}
                          </Button>
                          <Button
                            variant="danger"
                            onClick={() => setDeleteTargetWord(w.id)}
                          >
                            {t("admin.chat.delete")}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards for Banned Words */}
              <div className="ls-admin-card-list">
                {bannedWords.map((w) => (
                  <div key={w.id} className="ls-admin-mobile-card">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <strong>{w.word}</strong>
                      <Chip tone={w.enabled ? "success" : "neutral"}>
                        {w.enabled ? t("admin.chat.active") : t("admin.chat.inactive")}
                      </Chip>
                    </div>
                    <div style={{ fontSize: "var(--font-caption)", color: "var(--text-secondary)" }}>
                      {t("admin.chat.lang")}: {w.lang.toUpperCase()} • {t("admin.chat.colSource")}: {w.source}
                    </div>
                    <div className="ls-row" style={{ gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                      <Button
                        variant="secondary"
                        onClick={() => handleToggleWord(w.id, w.enabled)}
                      >
                        {w.enabled ? t("admin.chat.inactive") : t("admin.chat.active")}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => setDeleteTargetWord(w.id)}
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
      )}

      {/* Modal Hapus Pesan */}
      <Modal
        title={t("admin.chat.delete")}
        open={Boolean(deleteTargetMessage)}
        onClose={() => setDeleteTargetMessage(null)}
        closeLabel={t("action.close")}
      >
        <p style={{ margin: "var(--space-4) 0", color: "var(--text-secondary)" }}>
          {t("admin.chat.confirmDelete")}
        </p>
        <div className="ls-row" style={{ justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button variant="secondary" onClick={() => setDeleteTargetMessage(null)}>
            {t("action.cancel")}
          </Button>
          <Button variant="danger" onClick={handleDeleteMessage}>
            {t("admin.chat.delete")}
          </Button>
        </div>
      </Modal>

      {/* Modal Bisukan Pengguna */}
      <Modal
        title={`${t("admin.chat.mute")} ${muteTargetUser?.name ?? ""}`}
        open={Boolean(muteTargetUser)}
        onClose={() => setMuteTargetUser(null)}
        closeLabel={t("action.close")}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", margin: "var(--space-4) 0" }}>
          <Input
            label={t("admin.chat.duration")}
            type="number"
            value={muteMinutes}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMuteMinutes(e.target.value)}
          />
          <Input
            label={t("admin.chat.reason")}
            value={muteReason}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMuteReason(e.target.value)}
          />
        </div>
        <div className="ls-row" style={{ justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button variant="secondary" onClick={() => setMuteTargetUser(null)}>
            {t("action.cancel")}
          </Button>
          <Button variant="primary" onClick={handleMuteUser}>
            {t("admin.chat.mute")}
          </Button>
        </div>
      </Modal>

      {/* Modal Cabut Bisu */}
      <Modal
        title={t("admin.chat.unmute")}
        open={Boolean(unmuteTargetUser)}
        onClose={() => setUnmuteTargetUser(null)}
        closeLabel={t("action.close")}
      >
        <p style={{ margin: "var(--space-4) 0", color: "var(--text-secondary)" }}>
          {t("admin.chat.confirmUnmute")}
        </p>
        <div className="ls-row" style={{ justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button variant="secondary" onClick={() => setUnmuteTargetUser(null)}>
            {t("action.cancel")}
          </Button>
          <Button variant="primary" onClick={handleUnmuteUser}>
            {t("admin.chat.unmute")}
          </Button>
        </div>
      </Modal>

      {/* Modal Tambah Kata Terlarang */}
      <Modal
        title={t("admin.chat.addWord")}
        open={showAddWordModal}
        onClose={() => setShowAddWordModal(false)}
        closeLabel={t("action.close")}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", margin: "var(--space-4) 0" }}>
          <Input
            label={t("admin.chat.word")}
            value={newWord}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewWord(e.target.value)}
          />
          <div>
            <label style={{ display: "block", fontSize: "var(--font-small)", marginBottom: "var(--space-2)" }}>
              {t("admin.chat.lang")}
            </label>
            <SegmentedControl
              label={t("admin.chat.lang")}
              options={[
                { value: "any", label: t("admin.chat.langAny") },
                { value: "id", label: t("admin.chat.langId") },
                { value: "en", label: t("admin.chat.langEn") },
              ]}
              value={newWordLang}
              onChange={(val) => setNewWordLang(val as "id" | "en" | "any")}
            />
          </div>
        </div>
        <div className="ls-row" style={{ justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button variant="secondary" onClick={() => setShowAddWordModal(false)}>
            {t("action.cancel")}
          </Button>
          <Button variant="primary" onClick={handleAddWord}>
            {t("action.save")}
          </Button>
        </div>
      </Modal>

      {/* Modal Hapus Kata Terlarang */}
      <Modal
        title={t("admin.chat.delete")}
        open={Boolean(deleteTargetWord)}
        onClose={() => setDeleteTargetWord(null)}
        closeLabel={t("action.close")}
      >
        <p style={{ margin: "var(--space-4) 0", color: "var(--text-secondary)" }}>
          {t("admin.chat.confirmDeleteWord")}
        </p>
        <div className="ls-row" style={{ justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button variant="secondary" onClick={() => setDeleteTargetWord(null)}>
            {t("action.cancel")}
          </Button>
          <Button variant="danger" onClick={handleDeleteWord}>
            {t("admin.chat.delete")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
