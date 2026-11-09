import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateErrorCode } from "@low-stress/i18n";
import { Button, Input, Modal, SegmentedControl } from "@low-stress/ui";
import {
  createAdminBannedWordApi,
  deleteAdminBannedWordApi,
  deleteAdminChatMessageApi,
  getAdminBannedWordsApi,
  getAdminChatMessagesApi,
  getAdminChatMutesApi,
  muteUserApi,
  unmuteUserApi,
  updateAdminBannedWordApi,
  type AdminBannedWordItem,
  type AdminChatMessageItem,
  type AdminChatMuteItem,
} from "../../features/admin/api";
import type { ApiError } from "../../lib/apiFetch";
import { BannedWordsTab } from "./chat/BannedWordsTab";
import { ChatMessagesTab } from "./chat/ChatMessagesTab";
import { ChatMutesTab } from "./chat/ChatMutesTab";

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

  const [messages, setMessages] = useState<AdminChatMessageItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteTargetMessage, setDeleteTargetMessage] = useState<string | null>(null);

  const [muteTargetUser, setMuteTargetUser] = useState<{ id: string; name: string } | null>(null);
  const [muteMinutes, setMuteMinutes] = useState("60");
  const [muteReason, setMuteReason] = useState("");

  const [mutes, setMutes] = useState<AdminChatMuteItem[]>([]);
  const [unmuteTargetUser, setUnmuteTargetUser] = useState<string | null>(null);

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
        <ChatMessagesTab
          messages={messages}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onMuteUser={setMuteTargetUser}
          onDeleteMessage={setDeleteTargetMessage}
          formatDate={formatDate}
        />
      ) : activeTab === "mutes" ? (
        <ChatMutesTab
          mutes={mutes}
          onUnmuteUser={setUnmuteTargetUser}
          formatDate={formatDate}
        />
      ) : (
        <BannedWordsTab
          bannedWords={bannedWords}
          onToggleWord={(id, enabled) => void handleToggleWord(id, enabled)}
          onDeleteWord={setDeleteTargetWord}
        />
      )}

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
