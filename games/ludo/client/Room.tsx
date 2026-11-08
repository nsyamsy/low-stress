/* eslint-disable low-stress/no-raw-design-values */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { io as ioClient, type Socket } from "socket.io-client";
import {
  ArrowLeft,
  Bot,
  Crown,
  Dices,
  Loader2,
  MessageCircle,
  RotateCcw,
  Send,
  SkipForward,
  Timer,
  Trophy,
  UserPlus,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { GameProps } from "@low-stress/sdk";
import {
  LUDO_COLORS,
  PAWN_CHARACTERS,
  type ExitRule,
  type LastEvent,
  type LudoState,
  type PawnCharacter,
} from "../shared/engine";
import { Confetti, LudoBackdrop, LudoBoard } from "./LudoBoard";
import { PawnIcon } from "./LudoPawn";
import { Die } from "./Die";
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

export interface PlayerView {
  userId: string;
  name: string;
  status: "invited" | "accepted" | "declined" | "observer";
  isHost: boolean;
  isMe: boolean;
  seat: number | null;
  pawn: PawnCharacter;
  color: number | null;
  autopilot: boolean;
}

export interface ChatMessage {
  id: number;
  roomId: string;
  userId: string | null;
  name: string;
  text: string;
  at: string;
}

export interface RoomView {
  id: string;
  name: string;
  status: "lobby" | "playing" | "finished";
  hostId: string;
  maxPlayers: number;
  pawns: number;
  version: number;
  updatedAt: string;
  playSeconds: number | null;
  players: PlayerView[];
  messages: ChatMessage[];
  state: LudoState | null;
  isHost: boolean;
  isAdmin: boolean;
  mySeat: number | null;
  movable: number[];
  invitable: { id: string; username: string; displayName: string }[];
  event: LastEvent | null;
}

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

  // Invite modal state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; username: string; displayName: string }[]>([]);

  // Host settings state
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

  // Socket setup
  useEffect(() => {
    const s = ioClient("/ludo", {
      path: "/ws",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    socketRef.current = s;

    const autoAcceptIfInvited = (view: RoomView) => {
      if (view.status !== "lobby") return;
      const me = view.players.find((p) => p.userId === userIdRef.current);
      if (me?.status === "invited") {
        s.emit(
          "room:action",
          { roomId, action: "respond", accept: true },
          (resp: { ok: boolean; view?: RoomView }) => {
            if (resp.ok && resp.view) {
              setRoom(resp.view);
            }
          },
        );
      }
    };

    s.on("connect", () => {
      s.emit("room:join", { roomId }, (res: { ok: boolean; view?: RoomView; code?: string }) => {
        if (res.ok && res.view) {
          setRoom(res.view);
          setPawnsSetting(res.view.pawns || 4);
          autoAcceptIfInvited(res.view);
        } else {
          setError(res.code || tRef.current("errorJoinRoom"));
        }
      });
    });

    s.on("room:state", (view: RoomView) => {
      setRoom(view);
      if (view.event) {
        setLastEvent(view.event);
      }
    });

    s.on("room:event", (ev: LastEvent) => {
      setLastEvent(ev);
      const prevKind = lastEventKindRef.current;
      lastEventKindRef.current = ev.kind;

      const rollJustOccurred =
        ev.kind === "roll" ||
        ev.kind === "pass" ||
        ev.kind === "doubles3" ||
        ((ev.kind === "move" || ev.kind === "capture" || ev.kind === "home") &&
          Boolean(ev.dice) &&
          prevKind !== "roll");

      if (rollJustOccurred) {
        setRollId((n) => n + 1);
        playRoll();
      }
      if (ev.kind === "capture") {
        playCapture();
      } else if (ev.kind === "home") {
        playHome();
      }
    });

    s.on("room:chat", (msg: ChatMessage) => {
      playChat();
      setRoom((prev) => (prev ? { ...prev, messages: [...prev.messages, msg] } : prev));
      if (!chatOpenRef.current) {
        setUnreadCount((c) => c + 1);
      }
      setTimeout(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    });

    // Mobile QA: Sinkronisasi dan penyambungan ulang otomatis saat layar mati / kembali aktif
    const onVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        if (s.disconnected) {
          s.connect();
        } else {
          s.emit("room:join", { roomId }, (res: { ok: boolean; view?: RoomView }) => {
            if (res.ok && res.view) {
              setRoom(res.view);
              setPawnsSetting(res.view.pawns || 4);
              autoAcceptIfInvited(res.view);
            }
          });
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      s.emit("room:leave", { roomId });
      s.disconnect();
    };
  }, [roomId]);

  // Sound cues on turn change and victory
  useEffect(() => {
    if (!room || !room.state) {
      prevWinnerRef.current = null;
      return;
    }
    const isMyTurn =
      room.mySeat !== null &&
      room.state.winner === null &&
      room.state.turn === room.mySeat;

    if (isMyTurn && !wasMyTurn.current) {
      playTurn();
    }
    wasMyTurn.current = isMyTurn;

    if (room.state.winner !== null && prevWinnerRef.current === null) {
      playVictory();
    }
    prevWinnerRef.current = room.state.winner;
  }, [room]);

  const sendAction = useCallback(
    (actionPayload: Record<string, unknown>) => {
      if (!socketRef.current) return;
      setBusy(true);
      socketRef.current.emit(
        "room:action",
        { roomId, ...actionPayload },
        (res: { ok: boolean; view?: RoomView; code?: string }) => {
          setBusy(false);
          if (res.ok && res.view) {
            setRoom(res.view);
          } else if (res.code) {
            setError(res.code);
          }
        },
      );
    },
    [roomId],
  );

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatDraft.trim()) return;
    sendAction({ action: "chat", text: chatDraft.trim() });
    setChatDraft("");
  };

  const handleSearchUsers = async (q: string) => {
    setSearchQuery(q);
    try {
      const res = await fetch(`/api/games/ludo/users/search?q=${encodeURIComponent(q)}`, {
        credentials: "same-origin",
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.items ?? []);
      }
    } catch {
      // Ignore
    }
  };

  if (!room) {
    return (
      <div className="flex min-h-[360px] items-center justify-center p-6 text-[var(--text-secondary)]">
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
      <LudoBackdrop className="relative min-h-[500px]">
        {/* Header Bar */}
        <div className="mb-3 flex items-center justify-between border-b border-white/15 pb-2 text-white">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
              aria-label={t("back")}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-sm font-extrabold md:text-base">{room.name}</h1>
              <p className="text-[11px] text-white/70">
                {room.status === "lobby"
                  ? `${acceptedPlayers.length}/${room.maxPlayers} ${t("playersTitle")}`
                  : `${room.pawns} ${t("pawnsEach")}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {room.playSeconds !== null && (
              <span className="flex items-center gap-1 rounded-full bg-black/30 px-2.5 py-1 text-xs font-mono text-white/90">
                <Timer className="h-3.5 w-3.5 text-blue-300" />
                {Math.floor(room.playSeconds / 60)}:
                {String(Math.floor(room.playSeconds % 60)).padStart(2, "0")}
              </span>
            )}

            <button
              type="button"
              onClick={toggleSound}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
              aria-label={sound ? t("muteSound") : t("unmuteSound")}
            >
              {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-white/50" />}
            </button>

            <button
              type="button"
              onClick={() => {
                setChatOpen(!chatOpen);
                setUnreadCount(0);
              }}
              className="relative flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-2.5 text-xs font-bold text-white hover:bg-white/20"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="hidden md:inline">{t("chat")}</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-3 flex items-center justify-between rounded-lg bg-red-500/90 p-2.5 text-xs text-white">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label={t("close")}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
          {/* Left: Board or Lobby View */}
          <div className="flex flex-col items-center">
            {room.status === "lobby" ? (
              /* LOBBY VIEW */
              <div className="w-full space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-sm backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    {t("playersTitle")} ({acceptedPlayers.length}/{room.maxPlayers})
                  </h2>
                  {room.isHost && (
                    <button
                      type="button"
                      onClick={() => {
                        setInviteModalOpen(true);
                        void handleSearchUsers("");
                      }}
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-[var(--primary)] px-2.5 text-xs font-bold text-[var(--text-on-primary)] hover:bg-[var(--primary-hover)]"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      {t("invite")}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {room.players.map((p) => {
                    const col = p.seat !== null && LUDO_COLORS[p.seat] ? LUDO_COLORS[p.seat]! : { main: "#3B82F6", dark: "#1D4ED8" };
                    return (
                      <div
                        key={p.userId}
                        className={`flex items-center justify-between rounded-lg border p-2.5 ${
                          p.isMe ? "border-[var(--border-strong)] bg-[var(--primary)]/10" : "border-[var(--border)] bg-[var(--bg-surface)]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <PawnIcon id={p.pawn} color={col.main} dark={col.dark} size={28} />
                          <div>
                            <div className="flex items-center gap-1 text-xs font-bold text-[var(--text-primary)]">
                              <span>{p.name}</span>
                              {p.isHost && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                              {p.autopilot && (
                                <span className="rounded bg-[var(--bg-inset)] px-1 text-[9px] font-bold text-[var(--text-secondary)]">
                                  {t("autopilotBadge")}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-[var(--text-muted)]">
                              {p.status === "accepted"
                                ? t("pstatus.accepted")
                                : p.status === "invited"
                                  ? t("pstatus.invited")
                                  : p.status === "declined"
                                    ? t("pstatus.declined")
                                    : t("pstatus.observer")}
                            </span>
                          </div>
                        </div>

                        {room.isHost && !p.isHost && (
                          <button
                            type="button"
                            onClick={() => sendAction({ action: "kick", userId: p.userId })}
                            className="text-xs font-semibold text-[var(--danger-text)] hover:text-[var(--danger-text)]"
                          >
                            {t("remove")}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Pawn Shape Picker */}
                <div className="border-t border-[var(--border)] pt-3">
                  <h3 className="mb-2 text-xs font-bold text-[var(--text-secondary)]">{t("pickPawn")}</h3>
                  <div className="flex flex-wrap gap-2">
                    {PAWN_CHARACTERS.map((char) => {
                      const isCurrent = myPlayer?.pawn === char;
                      return (
                        <button
                          key={char}
                          type="button"
                          onClick={() => sendAction({ action: "pawn", pawn: char })}
                          className={`flex h-11 w-11 items-center justify-center rounded-lg border transition ${
                            isCurrent
                              ? "border-[var(--primary)] bg-[var(--primary)]/15 ring-2 ring-[var(--primary)]"
                              : "border-[var(--border-strong)] bg-[var(--bg-surface-raised)] hover:bg-[var(--bg-inset)]"
                          }`}
                          title={t(`char.${char}`)}
                        >
                          <PawnIcon id={char} color="#2563EB" dark="#1D4ED8" size={24} />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Host Settings */}
                {room.isHost && (
                  <div className="space-y-3 border-t border-[var(--border)] pt-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                      {t("roomSettings")}
                    </h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-[11px] font-bold text-[var(--text-secondary)]">
                          {t("pawnsEach")}
                        </label>
                        <select
                          value={pawnsSetting}
                          onChange={(e) => setPawnsSetting(Number(e.target.value))}
                          className="h-8 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-raised)] px-2 text-xs"
                        >
                          {[1, 2, 3, 4].map((n) => (
                            <option key={n} value={n}>
                              {t("pawnCountOption", { count: n })}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-[11px] font-bold text-[var(--text-secondary)]">
                          {t("exitTitle")}
                        </label>
                        <select
                          value={exitSetting}
                          onChange={(e) => setExitSetting(e.target.value as ExitRule)}
                          className="h-8 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-raised)] px-2 text-xs"
                        >
                          <option value="double">{t("exit.double")}</option>
                          <option value="sixes">{t("exit.sixes")}</option>
                          <option value="six">{t("exit.six")}</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-[11px] font-bold text-[var(--text-secondary)]">
                          {t("goalTitle")}
                        </label>
                        <select
                          value={goalSetting}
                          onChange={(e) => setGoalSetting(Number(e.target.value))}
                          className="h-8 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-raised)] px-2 text-xs"
                        >
                          {Array.from(
                            { length: Math.max(1, acceptedPlayers.length - 1) },
                            (_, i) => i + 1,
                          ).map((n) => (
                            <option key={n} value={n}>
                              {t("goalOption", { count: n })}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Start or Wait */}
                <div className="border-t border-[var(--border)] pt-3">
                  {room.isHost ? (
                    <div className="space-y-2">
                      {acceptedPlayers.length < 2 && (
                        <p className="text-xs text-[var(--warning-text)]">{t("needTwo")}</p>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          sendAction({
                            action: "start",
                            pawns: pawnsSetting,
                            exit: exitSetting,
                            goal: goalSetting,
                          })
                        }
                        disabled={busy || acceptedPlayers.length < 2}
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-xs font-bold text-[var(--text-on-primary)] shadow hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Dices className="h-4 w-4" />
                        {t("start")}
                      </button>
                    </div>
                  ) : myPlayer?.status === "invited" ? (
                    <div className="flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => sendAction({ action: "respond", accept: true })}
                        disabled={busy}
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-xs font-bold text-[var(--text-on-primary)] shadow hover:bg-[var(--primary-hover)] disabled:opacity-50"
                      >
                        {t("accept")}
                      </button>
                    </div>
                  ) : (
                    <p className="text-center text-xs font-semibold text-[var(--text-secondary)]">
                      {t("waitHost")}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              /* PLAYING OR FINISHED VIEW */
              <div className="w-full space-y-3">
                {/* Turn Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2.5 shadow-sm backdrop-blur-sm">
                  <div>
                    {room.state?.winner !== null ? (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--success-text)]">
                        <Trophy className="h-4 w-4 text-amber-500" />
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
                              ? room.players.find((p) => p.seat === room.state?.turn)?.name ?? t("playerFallback")
                              : t("playerFallback"),
                        })}
                      </span>
                    )}
                    {isMyTurn && room.state?.phase === "move" && (
                      <p className="text-[11px] text-[var(--text-muted)]">{t("tapPawn")}</p>
                    )}
                  </div>

                  {/* Actions during turn */}
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
                        room.players.find((p) => p.seat === lastEvent.seat)?.name ??
                        t("playerFallback");
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
                <div className="relative mx-auto w-full max-w-[500px]">
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
                      value={room.state?.dice ? (room.state.dice as [number, number])[0] ?? null : null}
                      rollId={rollId}
                    />
                    <Die
                      value={room.state?.dice ? (room.state.dice as [number, number])[1] ?? null : null}
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
                    <Trophy className="mx-auto mb-2 h-8 w-8 text-amber-500" />
                    <h2 className="text-base font-extrabold text-[var(--text-primary)]">
                      {room.state?.place?.[0] !== undefined
                        ? t("winner", {
                            name:
                              room.players.find((p) => p.seat === room.state?.place?.[0])?.name ??
                              t("winnerFallback"),
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
                            {room.players.find((p) => p.seat === seatIdx)?.name ?? t("seatFallback", { seat: seatIdx })}
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

          {/* Right Column / Drawer: Players & Chat */}
          <div
            className={`flex flex-col gap-3 ${
              chatOpen
                ? "fixed inset-x-2 bottom-2 z-40 max-h-[75vh] rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-raised)] p-3 shadow-2xl md:static md:max-h-none md:border-0 md:bg-transparent md:p-0 md:shadow-none"
                : "hidden md:flex"
            }`}
          >
            {/* Header when open as mobile drawer */}
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 md:hidden">
              <span className="text-xs font-bold text-[var(--text-primary)]">{t("chat")}</span>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                aria-label={t("close")}
                className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* In-Game Players List */}
            {room.status !== "lobby" && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3 shadow-sm backdrop-blur-sm">
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  {t("playersTitle")}
                </h3>
                <div className="space-y-1.5">
                  {acceptedPlayers.map((p) => {
                    const isTurn = room.state?.turn === p.seat;
                    const col = p.seat !== null && LUDO_COLORS[p.seat] ? LUDO_COLORS[p.seat]! : { main: "#3B82F6", dark: "#1D4ED8" };
                    return (
                      <div
                        key={p.userId}
                        className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${
                          isTurn ? "bg-[var(--primary)]/15 font-bold text-[var(--primary)]" : "bg-[var(--bg-inset)] text-[var(--text-secondary)]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <PawnIcon id={p.pawn} color={col.main} dark={col.dark} size={20} />
                          <span>{p.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {p.autopilot && (
                            <span className="rounded bg-[var(--bg-inset)] px-1 text-[9px] font-bold text-[var(--text-secondary)]">
                              {t("autopilotBadge")}
                            </span>
                          )}
                          {isTurn && <span className="h-2 w-2 rounded-full bg-[var(--primary)]" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Chat Box */}
            <div className="flex flex-1 flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3 shadow-sm backdrop-blur-sm md:min-h-[300px]">
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                {t("chat")}
              </h3>

              {/* Chat Message Stream */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs max-h-[220px] md:max-h-[340px]">
                {room.messages.length === 0 ? (
                  <p className="py-6 text-center text-[11px] text-[var(--text-muted)]">
                    {t("chatEmpty")}
                  </p>
                ) : (
                  room.messages.map((m) => {
                    const isMine = m.userId === user.id;
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}
                      >
                        <span className="text-[10px] text-[var(--text-muted)]">{m.name}</span>
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
              <form onSubmit={sendChat} className="mt-2 flex gap-1.5 border-t border-[var(--border)] pt-2">
                <input
                  value={chatDraft}
                  onChange={(e) => setChatDraft(e.target.value)}
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
        </div>

        {/* Invite Modal */}
        {inviteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-xl bg-[var(--bg-surface-raised)] p-4 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  {t("invitePick")}
                </h3>
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(false)}
                  aria-label={t("close")}
                  className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <input
                value={searchQuery}
                onChange={(e) => void handleSearchUsers(e.target.value)}
                placeholder={t("searchUsersPh")}
                className="mb-3 h-8 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-raised)] px-2.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
              />

              <div className="max-h-48 overflow-y-auto space-y-1.5">
                {searchResults.length === 0 ? (
                  <p className="py-4 text-center text-xs text-[var(--text-muted)]">
                    {t("noInvitable")}
                  </p>
                ) : (
                  searchResults.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-inset)] p-2 text-xs"
                    >
                      <div>
                        <span className="block font-bold text-[var(--text-primary)]">{u.displayName}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">@{u.username}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          sendAction({ action: "invite", userIds: [u.id] });
                          setInviteModalOpen(false);
                        }}
                        className="rounded-lg bg-[var(--primary)] px-2.5 py-1 text-xs font-bold text-[var(--text-on-primary)] hover:bg-[var(--primary-hover)]"
                      >
                        {t("invite")}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </LudoBackdrop>
    </div>
  );
}
