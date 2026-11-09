import React from "react";
import { useTranslation } from "react-i18next";
import { Send, X } from "lucide-react";
import { LUDO_COLORS } from "../../shared/engine";
import { PawnIcon } from "../LudoPawn";
import type { PlayerView, RoomView } from "./types";

export function RoomChatDrawer({
  room,
  acceptedPlayers,
  userId,
  chatOpen,
  chatDraft,
  chatBottomRef,
  onCloseChat,
  onChatDraftChange,
  onSendChat,
}: {
  room: RoomView;
  acceptedPlayers: PlayerView[];
  userId: string;
  chatOpen: boolean;
  chatDraft: string;
  chatBottomRef: React.RefObject<HTMLDivElement | null>;
  onCloseChat: () => void;
  onChatDraftChange: (next: string) => void;
  onSendChat: (e: React.FormEvent) => void;
}) {
  const { t } = useTranslation("game.ludo");

  return (
    <div
      className={`flex flex-col gap-3 ${
        chatOpen
          ? "fixed inset-x-2 bottom-2 z-40 max-h-96 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-raised)] p-3 shadow-2xl md:static md:max-h-none md:border-0 md:bg-transparent md:p-0 md:shadow-none"
          : "hidden md:flex"
      }`}
    >
      {/* Header when open as mobile drawer */}
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 md:hidden">
        <span className="text-xs font-bold text-[var(--text-primary)]">
          {t("chat")}
        </span>
        <button
          type="button"
          onClick={onCloseChat}
          aria-label={t("close")}
          className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* In-Game Players List */}
      {room.status !== "lobby" && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3 shadow-sm backdrop-blur-sm">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            {t("playersTitle")}
          </h3>
          <div className="space-y-1.5">
            {acceptedPlayers.map((p) => {
              const isTurn = room.state?.turn === p.seat;
              const col =
                p.seat !== null && LUDO_COLORS[p.seat]
                  ? LUDO_COLORS[p.seat]!
                  : LUDO_COLORS[0]!;
              return (
                <div
                  key={p.userId}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${
                    isTurn
                      ? "bg-[var(--primary)]/15 font-bold text-[var(--primary)]"
                      : "bg-[var(--bg-inset)] text-[var(--text-secondary)]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <PawnIcon id={p.pawn} color={col.main} dark={col.dark} size={20} />
                    <span>{p.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {p.autopilot && (
                      <span className="rounded bg-[var(--bg-inset)] px-1 text-xs font-bold text-[var(--text-secondary)]">
                        {t("autopilotBadge")}
                      </span>
                    )}
                    {isTurn && (
                      <span className="h-2 w-2 rounded-full bg-[var(--primary)]" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Chat Box */}
      <div className="flex flex-1 flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3 shadow-sm backdrop-blur-sm md:min-h-72">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
          {t("chat")}
        </h3>

        {/* Chat Message Stream */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs max-h-56 md:max-h-80">
          {room.messages.length === 0 ? (
            <p className="py-6 text-center text-xs text-[var(--text-muted)]">
              {t("chatEmpty")}
            </p>
          ) : (
            room.messages.map((m) => {
              const isMine = m.userId === userId;
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}
                >
                  <span className="text-xs text-[var(--text-muted)]">{m.name}</span>
                  <div
                    className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs ${
                      isMine
                        ? "bg-[var(--primary)] text-[var(--text-on-primary)]"
                        : "bg-[var(--bg-inset)] text-[var(--text-primary)]"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              );
            })
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Chat Input */}
        <form
          onSubmit={onSendChat}
          className="mt-2 flex gap-1.5 border-t border-[var(--border)] pt-2"
        >
          <input
            value={chatDraft}
            onChange={(e) => onChatDraftChange(e.target.value)}
            maxLength={300}
            placeholder={t("chatPh")}
            className="h-8 flex-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-raised)] px-2.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
          />
          <button
            type="submit"
            disabled={!chatDraft.trim()}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--text-on-primary)] hover:bg-[var(--primary-hover)] disabled:opacity-50"
            aria-label={t("chatSend")}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
