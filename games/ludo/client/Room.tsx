import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { io as ioClient, type Socket } from "socket.io-client";
import {
  ArrowLeft,
  Bot,
  Dices,
  Loader2,
  MessageCircle,
  RotateCcw,
  SkipForward,
  Timer,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { GameProps } from "@low-stress/sdk";
import {
  defaultPawns,
  type ExitRule,
  type LastEvent,
  type PawnCharacter,
} from "../shared/engine";
import { Confetti, LudoBackdrop, LudoBoard } from "./LudoBoard";
import { Die } from "./Die";
import { InviteModal } from "./room/InviteModal";
import { RoomChatDrawer } from "./room/RoomChatDrawer";
import { RoomLobbyView } from "./room/RoomLobbyView";
import type { ChatMessage, PlayerView, RoomView } from "./room/types";
import {
  playCapture,
  playChat,
  playHome,
  playRoll,
  playTurn,
  playVictory,
  setSoundEnabled,
  soundEnabled,
} from "./sound";

export type { ChatMessage, PlayerView, RoomView };

interface RoomProps extends GameProps {
  roomId: string;
  onBack: () => void;
}

export function Room({ roomId, onBack, user }: RoomProps) {
  const { t } = useTranslation("game.ludo");
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sound, setSound] = useState(() => soundEnabled());
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastEvent, setLastEvent] = useState<LastEvent | null>(null);
  const [rollId, setRollId] = useState(0);

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    { id: string; username: string; displayName: string }[]
  >([]);

  const [pawnsSetting, setPawnsSetting] = useState<number>(4);
  const [exitSetting, setExitSetting] = useState<ExitRule>("double");
  const [goalSetting, setGoalSetting] = useState<number>(1);

  const socketRef = useRef<Socket | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatOpenRef = useRef(chatOpen);
  const wasMyTurn = useRef(false);
  const prevWinnerRef = useRef<number | null>(null);
  const lastEventKindRef = useRef<LastEvent["kind"] | null>(null);
  const tRef = useRef(t);
  const userIdRef = useRef(user.id);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);

  useEffect(() => {
    tRef.current = t;
    userIdRef.current = user.id;
  }, [t, user.id]);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    setSoundEnabled(next);
  };

  useEffect(() => {
    const s = ioClient("/ludo", {
      path: "/ws",
      withCredentials: true,
    });
    socketRef.current = s;

    const joinRoom = () => {
      s.emit("room:join", { roomId }, (res: { ok: boolean; code?: string }) => {
        if (!res.ok) {
          setError(tRef.current(`errors.${res.code ?? "LOAD"}`));
        }
      });
    };

    s.on("connect", joinRoom);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (!s.connected) {
          s.connect();
        } else {
          joinRoom();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    s.on("room:state", (view: RoomView) => {
      setRoom(view);

      const acceptedCount = view.players.filter(
        (p) => p.status === "accepted",
      ).length;
      if (view.status === "lobby") {
        setPawnsSetting(defaultPawns(Math.max(2, acceptedCount)));
      }

      const isNowMyTurn =
        view.state !== null &&
        view.state.winner === null &&
        view.mySeat !== null &&
        view.state.turn === view.mySeat;

      if (isNowMyTurn && !wasMyTurn.current) {
        playTurn();
      }
      wasMyTurn.current = isNowMyTurn;

      const currentWinner = view.state?.winner ?? null;
      if (currentWinner !== null && prevWinnerRef.current === null) {
        playVictory();
      }
      prevWinnerRef.current = currentWinner;

      if (view.event) {
        setLastEvent(view.event);
        if (view.event.kind === "roll") {
          setRollId((r) => r + 1);
          playRoll();
        } else if (view.event.kind === "capture") {
          playCapture();
        } else if (view.event.kind === "home") {
          playHome();
        }
        lastEventKindRef.current = view.event.kind;
      }
    });

    s.on("room:chat", (msg: ChatMessage) => {
      setRoom((prev) => {
        if (!prev) return prev;
        if (prev.messages.some((m) => m.id === msg.id)) return prev;
        return {
          ...prev,
          messages: [...prev.messages, msg],
        };
      });

      if (msg.userId !== userIdRef.current) {
        playChat();
        if (!chatOpenRef.current) {
          setUnreadCount((c) => c + 1);
        }
      }

      setTimeout(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    });

    s.on("room:closed", (payload: { reason: string }) => {
      setError(tRef.current(`errors.ROOM_${payload.reason.toUpperCase()}`));
      setTimeout(() => onBack(), 1500);
    });

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      s.emit("room:leave", { roomId });
      s.disconnect();
      socketRef.current = null;
    };
  }, [roomId, onBack]);

  const sendAction = useCallback(
    (actionPayload: Record<string, unknown>) => {
      if (!socketRef.current) return;
      setBusy(true);
      setError(null);
      socketRef.current.emit(
        "room:action",
        { roomId, ...actionPayload },
        (res: { ok: boolean; code?: string }) => {
          setBusy(false);
          if (!res.ok) {
            setError(t(`errors.${res.code ?? "ACTION"}`));
          }
        },
      );
    },
    [roomId, t],
  );

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatDraft.trim();
    if (!text) return;
    setChatDraft("");
    sendAction({ action: "chat", text });
  };

  const handleSearchUsers = async (q: string) => {
    setSearchQuery(q);
    try {
      const res = await fetch(
        `/api/games/ludo/users/search?roomId=${encodeURIComponent(roomId)}&q=${encodeURIComponent(q)}`,
        { credentials: "include" },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          users: { id: string; username: string; displayName: string }[];
        };
        setSearchResults(data.users);
      }
    } catch {
      // Abaikan
    }
  };

  if (!room) {
    return (
      <div className="flex min-h-80 items-center justify-center p-6 text-[var(--text-secondary)]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const acceptedPlayers = room.players.filter((p) => p.status === "accepted");
  const myPlayer = room.players.find((p) => p.userId === user.id);
  const isMyTurn =
    room.state !== null &&
    room.state.winner === null &&
    room.mySeat !== null &&
    room.state.turn === room.mySeat;

  const charactersArray: (PawnCharacter | undefined)[] = room.players
    .filter((p) => p.seat !== null)
    .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0))
    .map((p) => p.pawn);

  return (
    <div className="mx-auto max-w-5xl p-2 md:p-6">
      <LudoBackdrop className="relative min-h-96">
        {/* Header Bar */}
        <div className="mb-3 flex items-center justify-between border-b border-[var(--border)]/30 pb-2 text-[var(--text-on-primary)]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-surface)]/10 text-[var(--text-on-primary)] hover:bg-[var(--bg-surface)]/20"
              aria-label={t("back")}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-sm font-extrabold md:text-base">{room.name}</h1>
              <p className="text-xs text-[var(--text-on-primary)]/70">
                {room.status === "lobby"
                  ? `${acceptedPlayers.length}/${room.maxPlayers} ${t("playersTitle")}`
                  : `${room.pawns} ${t("pawnsEach")}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {room.playSeconds !== null && (
              <span className="flex items-center gap-1 rounded-full bg-[var(--bg-inset)]/30 px-2.5 py-1 text-xs font-mono text-[var(--text-on-primary)]/90">
                <Timer className="h-3.5 w-3.5 text-[var(--text-on-primary)]" />
                {Math.floor(room.playSeconds / 60)}:
                {String(Math.floor(room.playSeconds % 60)).padStart(2, "0")}
              </span>
            )}

            <button
              type="button"
              onClick={toggleSound}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-surface)]/10 text-[var(--text-on-primary)] hover:bg-[var(--bg-surface)]/20"
              aria-label={sound ? t("muteSound") : t("unmuteSound")}
            >
              {sound ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4 text-[var(--text-on-primary)]/50" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setChatOpen(!chatOpen);
                setUnreadCount(0);
              }}
              className="relative flex h-8 items-center gap-1.5 rounded-lg bg-[var(--bg-surface)]/10 px-2.5 text-xs font-bold text-[var(--text-on-primary)] hover:bg-[var(--bg-surface)]/20"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="hidden md:inline">{t("chat")}</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-3 flex items-center justify-between rounded-lg bg-[var(--danger-bg)] p-2.5 text-xs text-[var(--danger-text)]">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label={t("close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col items-center md:col-span-2">
            {room.status === "lobby" ? (
              <RoomLobbyView
                room={room}
                acceptedPlayers={acceptedPlayers}
                myPlayer={myPlayer}
                busy={busy}
                pawnsSetting={pawnsSetting}
                exitSetting={exitSetting}
                goalSetting={goalSetting}
                onPawnsSettingChange={setPawnsSetting}
                onExitSettingChange={setExitSetting}
                onGoalSettingChange={setGoalSetting}
                onOpenInvite={() => {
                  setInviteModalOpen(true);
                  void handleSearchUsers("");
                }}
                onSendAction={sendAction}
              />
            ) : (
              <div className="w-full space-y-3">
                {/* Turn Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2.5 shadow-sm backdrop-blur-sm">
                  <div>
                    {room.state?.winner !== null ? (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--success-text)]">
                        <Trophy className="h-4 w-4 text-[var(--warning-text)]" />
                        {t("finishedNote")}
                      </span>
                    ) : isMyTurn ? (
                      <span className="flex items-center gap-1.5 text-xs font-extrabold text-[var(--primary)]">
                        <span className="h-2 w-2 rounded-full bg-[var(--primary)] animate-ping" />
                        {t("yourTurn")}!
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-[var(--text-secondary)]">
                        {t("theirTurn", {
                          name:
                            room.state && room.state.turn < room.players.length
                              ? room.players.find(
                                  (p) => p.seat === room.state?.turn,
                                )?.name ?? t("playerFallback")
                              : t("playerFallback"),
                        })}
                      </span>
                    )}
                    {isMyTurn && room.state?.phase === "move" && (
                      <p className="text-xs text-[var(--text-muted)]">
                        {t("tapPawn")}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {room.status === "playing" && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            sendAction({
                              action: "autopilot",
                              on: !myPlayer?.autopilot,
                            })
                          }
                          className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold ${
                            myPlayer?.autopilot
                              ? "border-[var(--border-strong)] bg-[var(--bg-inset)] text-[var(--text-primary)]"
                              : "border-[var(--border-strong)] bg-[var(--bg-surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--bg-inset)]"
                          }`}
                        >
                          <Bot className="h-3.5 w-3.5" />
                          {t("autopilot")}
                        </button>

                        {(room.isHost || room.isAdmin) && (
                          <button
                            type="button"
                            onClick={() => sendAction({ action: "skip" })}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-raised)] px-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-inset)]"
                            title={t("skip")}
                          >
                            <SkipForward className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Event ticker feed */}
                {lastEvent && (
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--primary)]/10 px-3 py-1.5 text-center text-xs font-medium text-[var(--primary)] shadow-xs">
                    {(() => {
                      const actorName =
                        room.players.find((p) => p.seat === lastEvent.seat)
                          ?.name ?? t("playerFallback");
                      if (lastEvent.kind === "roll" && lastEvent.dice) {
                        return t("event.roll", {
                          name: actorName,
                          dice: `${lastEvent.dice[0]}+${lastEvent.dice[1]}`,
                        });
                      }
                      if (lastEvent.kind === "capture") {
                        return t("event.capture", { name: actorName });
                      }
                      if (lastEvent.kind === "home") {
                        return t("event.home", { name: actorName });
                      }
                      if (lastEvent.kind === "skip") {
                        return t("event.skip", { name: actorName });
                      }
                      if (lastEvent.kind === "pass") {
                        return t("event.pass", { name: actorName });
                      }
                      if (lastEvent.kind === "doubles3") {
                        return t("event.doubles3", { name: actorName });
                      }
                      return t("event.move", { name: actorName });
                    })()}
                  </div>
                )}

                {/* SVG Board */}
                <div className="relative mx-auto w-full max-w-lg">
                  {room.state?.winner !== null && <Confetti />}
                  {room.state && (
                    <LudoBoard
                      state={room.state}
                      characters={charactersArray}
                      movable={room.movable}
                      onPawn={(pawn) => sendAction({ action: "move", pawn })}
                      className="rounded-xl shadow-lg"
                    />
                  )}
                </div>

                {/* Dice Controls */}
                {room.status === "playing" && (
                  <div className="flex items-center justify-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3 shadow-sm backdrop-blur-sm">
                    <Die
                      value={
                        room.state?.dice
                          ? (room.state.dice as [number, number])[0] ?? null
                          : null
                      }
                      rollId={rollId}
                    />
                    <Die
                      value={
                        room.state?.dice
                          ? (room.state.dice as [number, number])[1] ?? null
                          : null
                      }
                      rollId={rollId}
                    />

                    {isMyTurn && room.state?.phase === "roll" && (
                      <button
                        type="button"
                        onClick={() => sendAction({ action: "roll" })}
                        disabled={busy}
                        className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--primary)] px-5 text-sm font-extrabold text-[var(--text-on-primary)] shadow-md hover:bg-[var(--primary-hover)] disabled:opacity-50"
                      >
                        <Dices className="h-5 w-5" />
                        {t("roll")}
                      </button>
                    )}
                  </div>
                )}

                {/* Finished Winner Card */}
                {room.status === "finished" && (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 text-center shadow-sm backdrop-blur-sm">
                    <Trophy className="mx-auto mb-2 h-8 w-8 text-[var(--warning-text)]" />
                    <h2 className="text-base font-extrabold text-[var(--text-primary)]">
                      {room.state?.place?.[0] !== undefined
                        ? t("winner", {
                            name:
                              room.players.find(
                                (p) => p.seat === room.state?.place?.[0],
                              )?.name ?? t("winnerFallback"),
                          })
                        : t("finishedNote")}
                    </h2>

                    <div className="mt-3 flex justify-center gap-4">
                      {room.state?.place?.map((seatIdx: number, idx: number) => (
                        <div key={seatIdx} className="text-xs">
                          <span className="block font-bold text-[var(--warning-text)]">
                            {t("rank", { rank: idx + 1 })}
                          </span>
                          <span className="text-[var(--text-secondary)]">
                            {room.players.find((p) => p.seat === seatIdx)
                              ?.name ?? t("seatFallback", { seat: seatIdx })}
                          </span>
                        </div>
                      ))}
                    </div>

                    {(room.isHost || room.isAdmin) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(t("resetConfirm"))) {
                            sendAction({ action: "reset" });
                          }
                        }}
                        className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 text-xs font-bold text-[var(--text-on-primary)] hover:bg-[var(--primary-hover)]"
                      >
                        <RotateCcw className="h-4 w-4" />
                        {t("newGame")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <RoomChatDrawer
            room={room}
            acceptedPlayers={acceptedPlayers}
            userId={user.id}
            chatOpen={chatOpen}
            chatDraft={chatDraft}
            chatBottomRef={chatBottomRef}
            onCloseChat={() => setChatOpen(false)}
            onChatDraftChange={setChatDraft}
            onSendChat={sendChat}
          />
        </div>

        <InviteModal
          open={inviteModalOpen}
          searchQuery={searchQuery}
          searchResults={searchResults}
          onClose={() => setInviteModalOpen(false)}
          onSearchChange={(q) => void handleSearchUsers(q)}
          onInviteUser={(userId) => {
            sendAction({ action: "invite", userIds: [userId] });
            setInviteModalOpen(false);
          }}
        />
      </LudoBackdrop>
    </div>
  );
}
