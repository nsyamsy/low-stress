import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { io as ioClient, type Socket } from "socket.io-client";
import { Button } from "@low-stress/ui";
import { useAuth } from "../auth";

interface ChatMessage {
  id: string;
  userId: string | null;
  name: string;
  body: string;
  createdAt: string;
}

const STORAGE_KEY = "ls_chat_collapsed";

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth >= 1024;
  });

  useEffect(() => {
    const handler = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };

    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return isDesktop;
}

export function PublicChatPanel() {
  const isDesktop = useIsDesktop();
  const { user } = useAuth();
  const location = useLocation();

  // Hanya render di desktop (>= 1024px), untuk pemain berstatus active, dan bukan di rute admin
  if (!isDesktop || !user || user.status !== "active" || location.pathname.startsWith("/admin")) {
    return null;
  }

  return <PublicChatInner currentUserId={user.id} />;
}

function PublicChatInner({ currentUserId }: { currentUserId: string }) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const isGamePage = location.pathname.startsWith("/games/");

  // Di halaman game bawaan terlipat, selain itu ikuti pilihan localStorage
  const [collapsed, setCollapsed] = useState(() => {
    if (isGamePage) return true;
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [mutedUntil, setMutedUntil] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [inputText, setInputText] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [sending, setSending] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll ke pesan terbaru
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (!collapsed) {
      scrollToBottom();
    }
  }, [messages, collapsed]);

  // Muat riwayat awal via REST
  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      try {
        const res = await fetch("/api/chat/history", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data.items)) {
            setMessages(data.items);
          }
        } else if (res.status === 403) {
          const body = await res.json().catch(() => null);
          if (body?.error?.code === "CHAT_DISABLED") {
            setEnabled(false);
          }
        }
      } catch {
        // Abaikan kegagalan jaringan awal, soket akan mengambil alih
      }
    }

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, []);

  // Hubungkan Socket.IO hanya saat komponen desktop ini aktif
  useEffect(() => {
    const socket = ioClient("/public-chat", {
      path: "/ws",
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setErrorToast(null);
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("chat:status", (data: { enabled: boolean }) => {
      setEnabled(data.enabled);
    });

    socket.on("chat:presence", (data: { online: number }) => {
      setOnlineCount(data.online);
    });

    socket.on("chat:muted", (data: { until: string }) => {
      setMutedUntil(data.until);
    });

    socket.on("chat:message", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
      setCollapsed((isCol) => {
        if (isCol) {
          setUnreadCount((c) => c + 1);
        }
        return isCol;
      });
    });

    socket.on("chat:deleted", (data: { id: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== data.id));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Abaikan bila localStorage dibatasi
      }
      if (!next) {
        setUnreadCount(0);
      }
      return next;
    });
  };

  const handleSend = () => {
    if (!inputText.trim() || sending || !socketRef.current) return;

    setSending(true);
    setErrorToast(null);

    socketRef.current.emit(
      "chat:send",
      { body: inputText.trim() },
      (res: { ok: boolean; code?: string; params?: Record<string, unknown> }) => {
        setSending(false);
        if (res.ok) {
          setInputText("");
        } else {
          if (res.code === "CHAT_MUTED" && res.params?.until) {
            setMutedUntil(res.params.until as string);
          } else if (res.code === "CHAT_DISABLED") {
            setEnabled(false);
          }
          const errKey = `errors.${res.code ?? "RATE_LIMITED"}`;
          setErrorToast(t(errKey, { defaultValue: res.code ?? "Gagal mengirim" }));
        }
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return new Intl.DateTimeFormat(i18n.language === "id" ? "id-ID" : "en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(d);
    } catch {
      return "";
    }
  };

  // Tampilan Tab Terlipat (40px)
  if (collapsed) {
    return (
      <aside
        data-testid="public-chat-collapsed"
        className="ls-chat-tab"
        onClick={toggleCollapsed}
        title={t("chat.expand")}
      >
        {unreadCount > 0 && <span className="ls-chat-tab-dot" />}
        <div className="ls-chat-tab-title">{t("chat.title")}</div>
        <span className="ls-chat-tab-count">{onlineCount}</span>
      </aside>
    );
  }

  // Tampilan Panel Kolom Penuh (280px)
  return (
    <aside data-testid="public-chat-panel" className="ls-chat-panel">
      {/* Header */}
      <div className="ls-chat-header">
        <div>
          <div className="ls-chat-header-title">{t("chat.title")}</div>
          <div className="ls-chat-header-status">
            {!connected
              ? t("chat.reconnecting")
              : t("chat.online", { count: onlineCount })}
          </div>
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="ls-chat-collapse-btn"
          title={t("chat.collapse")}
          aria-label={t("chat.collapse")}
        >
          ✕
        </button>
      </div>

      {/* Daftar Pesan */}
      <div className="ls-chat-messages-container">
        {messages.length === 0 ? (
          <div className="ls-chat-empty">{t("chat.empty")}</div>
        ) : (
          messages.map((m) => {
            const isSelf = m.userId === currentUserId;
            return (
              <div
                key={m.id}
                className={`ls-chat-msg-row ${isSelf ? "ls-chat-msg-row--self" : "ls-chat-msg-row--other"}`}
              >
                <div className="ls-chat-msg-meta">
                  {isSelf ? t("leaderboard.you") : m.name} • {formatTime(m.createdAt)}
                </div>
                <div
                  className={`ls-chat-msg-bubble ${isSelf ? "ls-chat-msg-bubble--self" : "ls-chat-msg-bubble--other"}`}
                >
                  {m.body}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Area Input & Keadaan */}
      <div className="ls-chat-footer">
        {errorToast && <div className="ls-chat-error">{errorToast}</div>}

        {!enabled ? (
          <div className="ls-chat-notice">{t("chat.disabled")}</div>
        ) : mutedUntil && new Date(mutedUntil) > new Date() ? (
          <div className="ls-chat-notice ls-chat-notice--danger">
            {t("chat.muted", { time: formatTime(mutedUntil) })}
          </div>
        ) : (
          <div className="ls-chat-input-box">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value.slice(0, 300))}
              onKeyDown={handleKeyDown}
              placeholder={t("chat.placeholder")}
              rows={2}
              className="ls-chat-textarea"
            />
            <div className="ls-chat-send-row">
              <span className="ls-chat-char-count">
                {t("chat.charCount", { current: inputText.length, max: 300 })}
              </span>
              <Button
                variant="primary"
                onClick={handleSend}
                disabled={!inputText.trim() || sending}
              >
                {t("chat.send")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
