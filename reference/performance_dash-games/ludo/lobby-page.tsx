"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crown, LayoutGrid, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCommercialT } from "@/lib/commercial-i18n";
import { commercialApi } from "@/lib/commercial-ui";
import type { RoomSummary } from "@/lib/ludo";
import { LudoBackdrop } from "@/components/commercial/LudoBoard";

const POLL_MS = 5000;
const card = "rounded-[10px] border border-outline-variant/15 bg-surface-container-lowest p-4 shadow-xs";
const btn = "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[7px] px-3 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50";
const btnPrimary = cn(btn, "bg-primary text-white hover:opacity-90");
const btnGhost = cn(btn, "border border-outline-variant/30 text-on-surface hover:bg-surface-container-low");

export default function LudoLobbyPage() {
  const { tt } = useCommercialT();
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [play, setPlay] = useState(true);

  const load = useCallback(async () => {
    if (document.hidden) return;
    try {
      setRooms((await commercialApi<{ rooms: RoomSummary[] }>("/api/commercial/games/ludo")).rooms);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("loadFailed"));
    }
  }, [tt]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const respond = async (id: string, accept: boolean) => {
    setBusy(true);
    try {
      await commercialApi(`/api/commercial/games/ludo/${id}`, { method: "POST", body: JSON.stringify({ action: "respond", accept }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("loadFailed"));
    } finally {
      setBusy(false);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { id } = await commercialApi<{ id: string }>("/api/commercial/games/ludo", { method: "POST", body: JSON.stringify({ name, maxPlayers, play }) });
      router.push(`/commercial/utilities/team-sync/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : tt("loadFailed"));
      setBusy(false);
    }
  };

  const invitations = (rooms ?? []).filter((r) => r.myStatus === "invited" && r.status === "lobby");
  const mine = (rooms ?? []).filter((r) => !invitations.includes(r));

  return (
    <div className="p-4 md:p-6">
      <LudoBackdrop className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center gap-3 text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-white/15">
            <LayoutGrid className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-base font-extrabold">{tt("games.ludo.title")}</h1>
            <p className="text-xs text-white/80">{tt("games.ludo.subtitle")}</p>
          </div>
        </div>

        {error && <p className="mb-3 rounded-[8px] bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px] md:items-start">
          <div className="space-y-4">
            {invitations.length > 0 && (
              <div className={card}>
                <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{tt("games.ludo.invitations")}</h2>
                <ul className="space-y-2">
                  {invitations.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] bg-primary/[0.06] px-3 py-2">
                      <span className="text-xs font-semibold text-on-surface">{tt("games.ludo.invitedBy", { host: r.hostName, room: r.name })}</span>
                      <span className="flex gap-2">
                        <button type="button" className={btnPrimary} disabled={busy} onClick={() => respond(r.id, true)}>
                          {tt("games.ludo.accept")}
                        </button>
                        <button type="button" className={btnGhost} disabled={busy} onClick={() => respond(r.id, false)}>
                          {tt("games.ludo.decline")}
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className={card}>
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{tt("games.ludo.rooms")}</h2>
              {rooms === null ? (
                <div className="flex justify-center py-8 text-on-surface-variant">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : mine.length === 0 ? (
                <p className="py-6 text-center text-xs text-on-surface-variant">{tt("games.ludo.noRooms")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {mine.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/commercial/utilities/team-sync/${r.id}`}
                        className="flex items-center justify-between gap-3 rounded-[8px] border border-outline-variant/15 px-3 py-2 hover:bg-surface-container-low"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-bold text-on-surface">{r.name}</span>
                          <span className="flex items-center gap-1 text-[10px] text-on-surface-variant">
                            <Crown className="h-3 w-3 text-amber-500" />
                            {r.hostName} · {tt("games.ludo.players", { n: r.accepted, max: r.maxPlayers })}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                            r.status === "playing" ? "bg-emerald-500/15 text-emerald-700" : r.status === "finished" ? "bg-slate-500/15 text-slate-600" : "bg-primary/10 text-primary"
                          )}
                        >
                          {tt(`games.ludo.status.${r.status}`)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <form onSubmit={create} className={card}>
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{tt("games.ludo.create")}</h2>
            <label htmlFor="ludo-name" className="mb-1 block text-xs font-bold text-on-surface">
              {tt("games.ludo.roomName")}
            </label>
            <input
              id="ludo-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder={tt("games.ludo.roomNamePh")}
              className="mb-3 h-8 w-full rounded-[7px] border border-outline-variant/30 bg-surface-container-lowest px-2 text-xs"
            />
            <label htmlFor="ludo-max" className="mb-1 block text-xs font-bold text-on-surface">
              {tt("games.ludo.maxPlayers")}
            </label>
            <select
              id="ludo-max"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="mb-3 h-8 w-full rounded-[7px] border border-outline-variant/30 bg-surface-container-lowest px-2 text-xs"
            >
              {Array.from({ length: 9 }, (_, i) => i + 2).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <label className="mb-4 flex cursor-pointer items-center gap-2 text-xs font-bold text-on-surface">
              <input type="checkbox" checked={play} onChange={(e) => setPlay(e.target.checked)} />
              {tt("games.ludo.joinAsPlayer")}
            </label>
            <button type="submit" className={cn(btnPrimary, "w-full justify-center")} disabled={busy || !name.trim()}>
              <Plus className="h-3.5 w-3.5" />
              {tt("games.ludo.create")}
            </button>
          </form>
        </div>
      </LudoBackdrop>
    </div>
  );
}
