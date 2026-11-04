"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { ArrowLeft, Bot, Crown, Dices, Loader2, MessageCircle, RotateCcw, Send, SkipForward, Timer, Trash2, Trophy, UserPlus, Volume2, VolumeX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCommercialT } from "@/lib/commercial-i18n";
import { commercialApi, initials } from "@/lib/commercial-ui";
import * as E from "@/lib/ludo-engine";
import type { LudoAction, RoomView } from "@/lib/ludo";
import { Confetti, LUDO_COLORS, LudoBackdrop, LudoBoard } from "@/components/commercial/LudoBoard";
import { PawnIcon } from "@/components/commercial/LudoPawn";
import { playChat, playTurn, setSoundEnabled, soundEnabled } from "@/lib/ludo-sound";

const POLL_MS = 2000;
const card = "rounded-[10px] border border-outline-variant/15 bg-surface-container-lowest p-4 shadow-xs";
const btn = "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[7px] px-3 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50";
const btnPrimary = cn(btn, "bg-primary text-white hover:opacity-90");
const btnGhost = cn(btn, "border border-outline-variant/30 text-on-surface hover:bg-surface-container-low");

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

/** One die. When `rollId` changes it tumbles and flickers through random faces before it settles on `value`. */
function Die({ value, rollId }: { value: number | null; rollId: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef(rollId);
  const [face, setFace] = useState(value);

  useEffect(() => {
    if (rollId === seen.current) {
      setFace(value);
      return;
    }
    seen.current = rollId;
    let n = 0;
    const timer = setInterval(() => {
      n++;
      if (n >= 9) {
        clearInterval(timer);
        setFace(value);
      } else {
        setFace(1 + Math.floor(Math.random() * 6));
      }
    }, 70);
    ref.current?.animate(
      [
        { transform: "translateY(0) rotate(0deg) scale(1)" },
        { transform: "translateY(-14px) rotate(200deg) scale(1.2)", offset: 0.45 },
        { transform: "translateY(0) rotate(360deg) scale(1)" },
      ],
      { duration: 640, easing: "ease-out" }
    );
    return () => clearInterval(timer);
  }, [rollId, value]);

  return (
    <div
      ref={ref}
      className="grid h-12 w-12 shrink-0 grid-cols-3 grid-rows-3 gap-1 rounded-[12px] border-2 border-slate-700 bg-white p-2"
      aria-label={face ? String(face) : "-"}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={cn("rounded-full", face && PIPS[face]?.includes(i) ? "bg-slate-800" : "bg-transparent")} />
      ))}
    </div>
  );
}

export default function LudoRoomPage() {
  const { id } = useParams<{ id: string }>();
  const { tt } = useCommercialT();
  const router = useRouter();
  const [room, setRoom] = useState<(RoomView & { at: number }) | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [pawnsEach, setPawnsEach] = useState<number | null>(null);
  const [exitRule, setExitRule] = useState<E.ExitRule>("double");
  const [goalSetting, setGoalSetting] = useState(1);
  const [draft, setDraft] = useState("");
  const [sound, setSound] = useState(true);
  const chatList = useRef<HTMLUListElement>(null);
  const wasMyTurn = useRef<boolean | null>(null);
  const lastMessage = useRef<number | null>(null);

  useEffect(() => setSound(soundEnabled()), []);

  // the play time ticks locally between polls; the server sends the seconds elapsed at the moment of the poll
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // a slow poll must not overwrite the newer room an action just returned
  const accept = useCallback((next: RoomView) => setRoom((prev) => (prev && prev.version > next.version ? prev : { ...next, at: Date.now() })), []);

  const load = useCallback(async () => {
    if (document.hidden) return;
    try {
      accept(await commercialApi<RoomView>(`/api/commercial/games/ludo/${id}`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("loadFailed"));
    }
  }, [id, accept, tt]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const act = useCallback(
    async (body: LudoAction) => {
      setBusy(true);
      try {
        accept(await commercialApi<RoomView>(`/api/commercial/games/ludo/${id}`, { method: "POST", body: JSON.stringify(body) }));
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : tt("loadFailed"));
      } finally {
        setBusy(false);
      }
    },
    [id, accept, tt]
  );

  // a chime when the turn becomes mine, a blip for a message from somebody else; nothing on the first load
  const myTurnNow = !!room?.state && room.state.winner === null && room.mySeat === room.state.turn;
  useEffect(() => {
    if (!room) return;
    if (wasMyTurn.current === false && myTurnNow) playTurn();
    wasMyTurn.current = myTurnNow;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurnNow, !!room]);

  const newestMessage = room?.messages.length ? room.messages[room.messages.length - 1] : null;
  useEffect(() => {
    if (!room) return;
    const newest = newestMessage?.id ?? 0;
    if (lastMessage.current !== null && newest > lastMessage.current && newestMessage?.userId !== room.players.find((p) => p.isMe)?.userId) playChat();
    lastMessage.current = newest;
    const list = chatList.current;
    if (list) list.scrollTop = list.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestMessage?.id, !!room]);

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await act({ action: "chat", text });
  };

  const ask = async (title: string, text: string) =>
    (await Swal.fire({ icon: "warning", title, text, showCancelButton: true, confirmButtonColor: "#dc2626", confirmButtonText: tt("games.ludo.confirm"), cancelButtonText: tt("games.ludo.cancel") })).isConfirmed;

  const removeRoom = async () => {
    if (!(await ask(tt("games.ludo.delete"), tt("games.ludo.deleteConfirm")))) return;
    setBusy(true);
    try {
      await commercialApi(`/api/commercial/games/ludo/${id}`, { method: "DELETE" });
      Swal.fire({ icon: "success", title: tt("games.ludo.deleted"), toast: true, position: "top-end", timer: 1800, showConfirmButton: false });
      router.push("/commercial/utilities/team-sync");
    } catch (e) {
      Swal.fire({ icon: "error", title: tt("games.ludo.delete"), text: e instanceof Error ? e.message : tt("loadFailed") });
      setBusy(false);
    }
  };

  const state = room?.state ?? null;
  const nameOfSeat = useCallback((seat: number) => room?.players.find((p) => p.seat === seat)?.name ?? "", [room]);
  const accepted = useMemo(() => room?.players.filter((p) => p.status === "accepted") ?? [], [room]);

  if (!room) {
    return (
      <div className="p-4 md:p-6">
        <LudoBackdrop className="mx-auto max-w-6xl">
          <div className="flex min-h-[320px] items-center justify-center text-white">
            {error ? <p className="text-sm font-semibold">{error}</p> : <Loader2 className="h-6 w-6 animate-spin" />}
          </div>
        </LudoBackdrop>
      </div>
    );
  }

  const me = room.players.find((p) => p.isMe);
  const myTurn = !!state && state.winner === null && room.mySeat === state.turn;
  const lastText = state?.last
    ? tt(`games.ludo.event.${state.last.kind}`, {
        name: nameOfSeat(state.last.seat),
        dice: state.last.dice ? `${state.last.dice[0]} + ${state.last.dice[1]} = ${E.total(state.last.dice)}` : "",
        n: state.last.captured ?? 0,
      })
    : "";
  const defaultPawns = E.defaultPawns(accepted.length);
  const maxGoal = Math.max(1, accepted.length - 1);
  const pickedGoal = Math.min(goalSetting, maxGoal);
  const shownGoal = state?.goal ?? pickedGoal;
  const geo = E.geometry(Math.max(E.MIN_PLAYERS, accepted.length));

  const elapsedSeconds = room.elapsed === null ? null : Math.max(0, Math.floor(room.elapsed + (room.status === "playing" ? (now - room.at) / 1000 : 0)));
  const clock = (s: number) => {
    const h = Math.floor(s / 3600);
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  const statusBadge = (
    <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold text-white">{tt(`games.ludo.status.${room.status}`)}</span>
  );

  const playerList = (
    <div className={card}>
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
        {tt("games.ludo.playersTitle")} · {accepted.length}/{room.maxPlayers}
      </h2>
      <ul className="space-y-1">
        {room.players
          .filter((p) => p.status !== "declined" || room.status === "lobby")
          .map((p) => {
            const arm = state && p.seat !== null ? state.seats[p.seat] : null;
            const active = state && state.winner === null && p.seat === state.turn;
            return (
              <li key={p.userId} className={cn("flex items-center gap-2 rounded-[8px] px-2 py-1.5", p.isMe && "bg-primary/10", active && "ring-2 ring-primary")}>
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ background: arm !== null ? LUDO_COLORS[arm].main : "#94a3b8" }}
                >
                  {initials(p.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 truncate text-xs font-bold text-on-surface">
                    {p.name}
                    {p.isHost && <Crown className="h-3 w-3 text-amber-500" aria-label={tt("games.ludo.host")} />}
                    {p.isMe && <span className="rounded-full bg-primary px-1.5 py-px text-[9px] font-bold text-white">{tt("games.leaderboard.you")}</span>}
                    {state && p.seat !== null && (state.place ?? []).includes(p.seat) && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500 px-1.5 py-px text-[9px] font-bold text-white">
                        <Trophy className="h-2.5 w-2.5" />
                        {tt("games.ludo.place", { n: (state.place ?? []).indexOf(p.seat) + 1 })}
                      </span>
                    )}
                    {p.autopilot && room.status === "playing" && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-600 px-1.5 py-px text-[9px] font-bold text-white">
                        <Bot className="h-2.5 w-2.5" />
                        {tt("games.ludo.autopilotBadge")}
                      </span>
                    )}
                  </span>
                  <span className="block text-[10px] text-on-surface-variant">
                    {arm !== null ? tt(`games.ludo.color.${arm}`) : tt(`games.ludo.pstatus.${p.status}`)}
                  </span>
                </span>
                {(room.isHost || room.isAdmin) && room.status === "playing" && !p.isMe && p.status === "accepted" && (
                  <button
                    type="button"
                    className={cn("cursor-pointer rounded-[6px] p-1 hover:bg-surface-container-low", p.autopilot ? "text-primary" : "text-on-surface-variant")}
                    title={tt("games.ludo.autopilotFor", { name: p.name })}
                    aria-label={tt("games.ludo.autopilotFor", { name: p.name })}
                    aria-pressed={p.autopilot}
                    disabled={busy}
                    onClick={() => act({ action: "autopilot", on: !p.autopilot, userId: p.userId })}
                  >
                    <Bot className="h-3.5 w-3.5" />
                  </button>
                )}
                {room.isHost && room.status === "lobby" && !p.isHost && (
                  <button
                    type="button"
                    className="cursor-pointer rounded-[6px] p-1 text-on-surface-variant hover:bg-surface-container-low hover:text-red-600"
                    title={tt("games.ludo.remove")}
                    aria-label={tt("games.ludo.remove")}
                    onClick={() => act({ action: "kick", userId: p.userId })}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
      </ul>
    </div>
  );

  const chatCard = (
    <div className={card}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
          <MessageCircle className="h-3.5 w-3.5" />
          {tt("games.ludo.chat")}
        </h2>
        <button
          type="button"
          className="cursor-pointer rounded-[6px] p-1 text-on-surface-variant hover:bg-surface-container-low"
          title={tt(sound ? "games.ludo.soundOn" : "games.ludo.soundOff")}
          aria-label={tt(sound ? "games.ludo.soundOn" : "games.ludo.soundOff")}
          aria-pressed={sound}
          onClick={() => {
            setSoundEnabled(!sound);
            setSound(!sound);
          }}
        >
          {sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        </button>
      </div>
      <ul ref={chatList} className="mb-2 h-44 space-y-1.5 overflow-y-auto rounded-[8px] bg-surface-container-low/60 p-2">
        {room.messages.length === 0 && <li className="py-6 text-center text-[11px] text-on-surface-variant">{tt("games.ludo.chatEmpty")}</li>}
        {room.messages.map((m) => {
          const mineMsg = m.userId === me?.userId;
          return (
            <li key={m.id} className={cn("flex flex-col", mineMsg ? "items-end" : "items-start")}>
              <span className="text-[10px] font-semibold text-on-surface-variant">{mineMsg ? tt("games.leaderboard.you") : m.name}</span>
              <span className={cn("max-w-[90%] break-words rounded-[10px] px-2.5 py-1 text-xs", mineMsg ? "bg-primary text-white" : "bg-surface-container-lowest text-on-surface shadow-xs")}>{m.text}</span>
            </li>
          );
        })}
      </ul>
      <form onSubmit={sendChat} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={500}
          placeholder={tt("games.ludo.chatPh")}
          aria-label={tt("games.ludo.chat")}
          className="h-8 min-w-0 flex-1 rounded-[7px] border border-outline-variant/30 bg-surface-container-lowest px-2 text-xs"
        />
        <button type="submit" className={btnPrimary} disabled={!draft.trim()} title={tt("games.ludo.chatSend")} aria-label={tt("games.ludo.chatSend")}>
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );

  const myColor = state && room.mySeat !== null ? LUDO_COLORS[state.seats[room.mySeat]] : { main: "#475569", dark: "#1e293b" };
  const pawnPicker =
    me?.status === "accepted" ? (
      <div className={card}>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{tt("games.ludo.pawnTitle")}</h2>
        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={tt("games.ludo.pawnTitle")}>
          {E.PAWN_CHARACTERS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={me.pawn === id}
              title={tt(`games.ludo.char.${id}`)}
              aria-label={tt(`games.ludo.char.${id}`)}
              disabled={busy}
              onClick={() => act({ action: "pawn", pawn: id })}
              className={cn(
                "flex h-11 cursor-pointer items-center justify-center rounded-[8px] border bg-surface-container-lowest",
                me.pawn === id ? "border-primary ring-2 ring-primary/40" : "border-outline-variant/20 hover:bg-surface-container-low"
              )}
            >
              <PawnIcon id={id} color={myColor.main} dark={myColor.dark} size={30} />
            </button>
          ))}
        </div>
      </div>
    ) : null;

  const rules = (
    <div className={card}>
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{tt("games.ludo.rulesTitle")}</h2>
      <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-on-surface">
        {[1, 2, 3, 4, 5, ...(shownGoal > 1 ? [6] : [])].map((n) => (
          <li key={n}>{tt(`games.ludo.rules${n}`, { exit: tt(`games.ludo.exitRule.${state?.exit ?? exitRule}`), goal: shownGoal })}</li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="p-4 md:p-6">
      <LudoBackdrop className="mx-auto max-w-6xl">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link href="/commercial/utilities/team-sync" className="inline-flex items-center gap-1 text-xs font-bold text-white/80 hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" />
              {tt("games.ludo.back")}
            </Link>
            <h1 className="text-base font-extrabold text-white">{room.name}</h1>
            {statusBadge}
            {elapsedSeconds !== null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-white" title={tt("games.ludo.playTime")}>
                <Timer className="h-3 w-3" aria-hidden="true" />
                <span className="sr-only">{tt("games.ludo.playTime")}</span>
                {clock(elapsedSeconds)}
              </span>
            )}
          </div>
          {room.isAdmin && (
            <button type="button" className={cn(btn, "bg-red-600 text-white hover:opacity-90")} disabled={busy} onClick={removeRoom}>
              <Trash2 className="h-3.5 w-3.5" />
              {tt("games.ludo.delete")}
            </button>
          )}
        </div>

        {error && <p className="mb-3 rounded-[8px] bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}

        {room.status === "lobby" || !state ? (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              {playerList}
              {pawnPicker}
              {chatCard}
              {rules}
            </div>
            <div className="space-y-4">
              {me?.status === "invited" && (
                <div className={card}>
                  <p className="mb-3 text-xs font-semibold text-on-surface">
                    {tt("games.ludo.invitedBy", { host: room.players.find((p) => p.isHost)?.name ?? "", room: room.name })}
                  </p>
                  <div className="flex gap-2">
                    <button type="button" className={btnPrimary} disabled={busy} onClick={() => act({ action: "respond", accept: true })}>
                      {tt("games.ludo.accept")}
                    </button>
                    <button type="button" className={btnGhost} disabled={busy} onClick={() => act({ action: "respond", accept: false })}>
                      {tt("games.ludo.decline")}
                    </button>
                  </div>
                </div>
              )}

              {room.isHost ? (
                <>
                  <div className={card}>
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-on-surface">
                      <input
                        type="checkbox"
                        checked={me?.status === "accepted"}
                        disabled={busy}
                        onChange={(e) => act({ action: "participate", play: e.target.checked })}
                      />
                      {tt("games.ludo.joinAsPlayer")}
                    </label>
                    <p className="mt-1 text-[11px] text-on-surface-variant">{tt("games.ludo.joinAsPlayerHint")}</p>
                  </div>

                  <div className={card}>
                    <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                      <UserPlus className="h-3.5 w-3.5" />
                      {tt("games.ludo.invitePick")}
                    </h2>
                    {room.invitable.length === 0 ? (
                      <p className="text-xs text-on-surface-variant">{tt("games.ludo.noInvitable")}</p>
                    ) : (
                      <>
                        <ul className="mb-3 max-h-48 space-y-0.5 overflow-y-auto">
                          {room.invitable.map((u) => (
                            <li key={u.id}>
                              <label className="flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1 text-xs text-on-surface hover:bg-surface-container-low">
                                <input
                                  type="checkbox"
                                  checked={picked.includes(u.id)}
                                  onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, u.id] : cur.filter((x) => x !== u.id)))}
                                />
                                {u.name}
                              </label>
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          className={btnPrimary}
                          disabled={busy || picked.length === 0}
                          onClick={async () => {
                            await act({ action: "invite", userIds: picked });
                            setPicked([]);
                          }}
                        >
                          {tt("games.ludo.invite")} ({picked.length})
                        </button>
                      </>
                    )}
                  </div>

                  <div className={card}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <label htmlFor="ludo-pawns" className="text-xs font-bold text-on-surface">
                        {tt("games.ludo.pawnsEach")}
                      </label>
                      <select
                        id="ludo-pawns"
                        className="h-8 rounded-[7px] border border-outline-variant/30 bg-surface-container-lowest px-2 text-xs"
                        value={pawnsEach ?? defaultPawns}
                        onChange={(e) => setPawnsEach(Number(e.target.value))}
                      >
                        {[1, 2, 3, 4].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <label htmlFor="ludo-exit" className="text-xs font-bold text-on-surface">
                        {tt("games.ludo.exitTitle")}
                      </label>
                      <select
                        id="ludo-exit"
                        className="h-8 rounded-[7px] border border-outline-variant/30 bg-surface-container-lowest px-2 text-xs"
                        value={exitRule}
                        onChange={(e) => setExitRule(e.target.value as E.ExitRule)}
                      >
                        {E.EXIT_RULES.map((r) => (
                          <option key={r} value={r}>
                            {tt(`games.ludo.exit.${r}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <label htmlFor="ludo-goal" className="text-xs font-bold text-on-surface">
                        {tt("games.ludo.goalTitle")}
                      </label>
                      <select
                        id="ludo-goal"
                        className="h-8 rounded-[7px] border border-outline-variant/30 bg-surface-container-lowest px-2 text-xs"
                        value={pickedGoal}
                        onChange={(e) => setGoalSetting(Number(e.target.value))}
                      >
                        {Array.from({ length: maxGoal }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="mb-3 text-[11px] text-on-surface-variant">{tt("games.ludo.boardInfo", { arms: geo.arms, ring: geo.ring })}</p>
                    {accepted.length < E.MIN_PLAYERS && <p className="mb-3 text-[11px] font-semibold text-amber-600">{tt("games.ludo.needTwo")}</p>}
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={busy || accepted.length < E.MIN_PLAYERS}
                      onClick={() => act({ action: "start", pawns: pawnsEach ?? defaultPawns, exit: exitRule, goal: pickedGoal })}
                    >
                      <Dices className="h-3.5 w-3.5" />
                      {tt("games.ludo.start")}
                    </button>
                  </div>
                </>
              ) : (
                me?.status === "accepted" && (
                  <div className={cn(card, "flex items-center gap-3")}>
                    <Loader2 className="h-4 w-4 animate-spin text-on-surface-variant" />
                    <p className="text-xs font-semibold text-on-surface">{tt("games.ludo.waitHost")}</p>
                  </div>
                )
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <div className="relative mx-auto w-full max-w-[640px] rounded-[14px] bg-white/95 p-2 shadow-md">
              <LudoBoard
                state={state}
                characters={state.seats.map((_, seat) => room.players.find((p) => p.seat === seat)?.pawn)}
                movable={room.movable}
                onPawn={(pawn) => act({ action: "move", pawn })}
              />
              {state.winner !== null && <Confetti />}
            </div>

            <div className="space-y-4">
              <div className={card}>
                {state.winner !== null ? (
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-400/20 text-amber-600">
                      <Trophy className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-extrabold text-on-surface">{tt("games.ludo.winner", { name: nameOfSeat(state.winner) })}</p>
                      <p className="text-[11px] text-on-surface-variant">{tt("games.ludo.finishedNote")}</p>
                      {(state.place ?? []).length > 1 && (
                        <ol className="mt-2 space-y-0.5 text-xs text-on-surface">
                          {(state.place ?? []).map((seat, i) => (
                            <li key={seat}>
                              <span className="font-bold">{i + 1}.</span> {nameOfSeat(seat)}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex items-center gap-2">
                      <span className="h-3 w-3 animate-pulse rounded-full" style={{ background: LUDO_COLORS[state.seats[state.turn]].main }} />
                      <p className="text-sm font-extrabold text-on-surface">
                        {myTurn ? tt("games.ludo.yourTurn") : tt("games.ludo.turnOf", { name: nameOfSeat(state.turn) })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex gap-2">
                        <Die value={(state.dice ?? state.last?.dice)?.[0] ?? null} rollId={state.rolls ?? 0} />
                        <Die value={(state.dice ?? state.last?.dice)?.[1] ?? null} rollId={state.rolls ?? 0} />
                      </div>
                      <div className="min-w-0 flex-1">
                        {myTurn && state.phase === "roll" && (
                          <button type="button" className={btnPrimary} disabled={busy} onClick={() => act({ action: "roll" })}>
                            <Dices className="h-3.5 w-3.5" />
                            {tt("games.ludo.roll")}
                          </button>
                        )}
                        {myTurn && state.phase === "move" && <p className="text-xs font-semibold text-on-surface">{tt("games.ludo.pickPawn")}</p>}
                        {!myTurn && <p className="text-xs text-on-surface-variant">{tt("games.ludo.waiting", { name: nameOfSeat(state.turn) })}</p>}
                      </div>
                    </div>
                  </>
                )}
                {lastText && <p className="mt-3 border-t border-outline-variant/15 pt-2 text-[11px] text-on-surface-variant">{lastText}</p>}
              </div>

              {playerList}
              {me?.status === "accepted" && room.mySeat !== null && state.winner === null && (
                <div className={card}>
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-on-surface">
                    <input type="checkbox" checked={me.autopilot} disabled={busy} onChange={(e) => act({ action: "autopilot", on: e.target.checked })} />
                    <Bot className="h-3.5 w-3.5" />
                    {tt("games.ludo.autopilot")}
                  </label>
                  <p className="mt-1 text-[11px] text-on-surface-variant">{tt("games.ludo.autopilotHint")}</p>
                </div>
              )}
              {chatCard}
              {pawnPicker}

              {(room.isHost || room.isAdmin) && state.winner === null && (
                <button type="button" className={cn(btnGhost, "w-full justify-center bg-surface-container-lowest")} disabled={busy} onClick={async () => {
                    if (await ask(tt("games.ludo.skip"), tt("games.ludo.skipConfirm", { name: nameOfSeat(state.turn) }))) await act({ action: "skip" });
                  }}>
                  <SkipForward className="h-3.5 w-3.5" />
                  {tt("games.ludo.skip")}
                </button>
              )}

              {room.isAdmin ? (
                <div className={card}>
                  <button
                    type="button"
                    className={btnGhost}
                    disabled={busy}
                    onClick={async () => {
                      if (await ask(tt("games.ludo.newGame"), tt("games.ludo.resetConfirm"))) await act({ action: "reset" });
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {tt("games.ludo.newGame")}
                  </button>
                </div>
              ) : (
                <p className="px-1 text-[11px] text-white/80">{tt("games.ludo.newGameHint")}</p>
              )}

              {rules}
            </div>
          </div>
        )}
      </LudoBackdrop>
    </div>
  );
}
