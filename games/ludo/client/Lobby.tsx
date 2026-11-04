/* eslint-disable low-stress/no-raw-design-values */
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Crown, LayoutGrid, Loader2, Plus } from "lucide-react";
import type { GameProps } from "@low-stress/sdk";
import { LudoBackdrop } from "./LudoBoard";

export interface RoomSummary {
  id: string;
  name: string;
  status: "lobby" | "playing" | "finished";
  hostId: string;
  hostName: string;
  players: number;
  maxPlayers: number;
  myStatus: "invited" | "accepted" | "declined" | "observer" | null;
  updatedAt: string;
}

interface LobbyProps extends GameProps {
  onOpenRoom: (roomId: string) => void;
}

export function Lobby({ onOpenRoom }: LobbyProps) {
  const { t } = useTranslation("game.ludo");
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [play, setPlay] = useState(true);

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch("/api/games/ludo/rooms", {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Gagal memuat ruangan");
      const data = await res.json();
      setRooms(data.items ?? []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    }
  }, []);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const res = await fetch("/api/games/ludo/rooms", {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (active) {
          setRooms(data.items ?? []);
        }
      } catch {
        // Ignore initial polling error
      }
    };
    void run();
    const timer = setInterval(() => void run(), 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const respond = async (roomId: string, accept: boolean) => {
    setBusy(true);
    try {
      if (accept) {
        onOpenRoom(roomId);
      } else {
        await fetchRooms();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal merespons");
    } finally {
      setBusy(false);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/games/ludo/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name: name.trim(), maxPlayers, play }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Gagal membuat ruangan");
      }
      const data = await res.json();
      onOpenRoom(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat ruangan");
      setBusy(false);
    }
  };

  const invitations = (rooms ?? []).filter(
    (r) => r.myStatus === "invited" && r.status === "lobby",
  );
  const mine = (rooms ?? []).filter(
    (r) => !invitations.some((inv) => inv.id === r.id),
  );

  return (
    <div className="p-3 md:p-6">
      <LudoBackdrop className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center gap-3 text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-white/15">
            <LayoutGrid className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-base font-extrabold">{t("title")}</h1>
            <p className="text-xs text-white/80">{t("subtitle")}</p>
          </div>
        </div>

        {error && (
          <p className="mb-3 rounded-[8px] bg-red-100 p-3 text-xs font-semibold text-red-800">
            {error}
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px] md:items-start">
          <div className="space-y-4">
            {invitations.length > 0 && (
              <div className="rounded-[12px] border border-white/20 bg-white/95 p-4 shadow-sm backdrop-blur-sm">
                <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  {t("invitations")}
                </h2>
                <ul className="space-y-2">
                  {invitations.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] bg-blue-50 px-3 py-2 border border-blue-200"
                    >
                      <span className="text-xs font-semibold text-slate-800">
                        {r.hostName} mengundang kamu ke {r.name}
                      </span>
                      <span className="flex gap-2">
                        <button
                          type="button"
                          className="inline-flex h-8 items-center rounded-[7px] bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                          disabled={busy}
                          onClick={() => respond(r.id, true)}
                        >
                          {t("accept")}
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-8 items-center rounded-[7px] border border-slate-300 px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                          disabled={busy}
                          onClick={() => respond(r.id, false)}
                        >
                          {t("decline")}
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-[12px] border border-white/20 bg-white/95 p-4 shadow-sm backdrop-blur-sm">
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                {t("rooms")}
              </h2>
              {rooms === null ? (
                <div className="flex justify-center py-8 text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : mine.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  {t("noRooms")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {mine.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => onOpenRoom(r.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-[8px] border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-bold text-slate-900">
                            {r.name}
                          </span>
                          <span className="flex items-center gap-1 text-[11px] text-slate-500">
                            <Crown className="h-3 w-3 text-amber-500" />
                            {r.hostName} · {r.players} / {r.maxPlayers} {t("playersTitle")}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            r.status === "playing"
                              ? "bg-emerald-100 text-emerald-800"
                              : r.status === "finished"
                                ? "bg-slate-200 text-slate-700"
                                : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {r.status === "playing"
                            ? "Berlangsung"
                            : r.status === "finished"
                              ? "Selesai"
                              : "Lobi"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <form
            onSubmit={create}
            className="rounded-[12px] border border-white/20 bg-white/95 p-4 shadow-sm backdrop-blur-sm"
          >
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-600">
              {t("create")}
            </h2>
            <label
              htmlFor="ludo-name"
              className="mb-1 block text-xs font-bold text-slate-800"
            >
              {t("roomName")}
            </label>
            <input
              id="ludo-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder={t("roomNamePh")}
              className="mb-3 h-9 w-full rounded-[7px] border border-slate-300 bg-white px-2.5 text-xs text-slate-900 outline-none focus:border-blue-500"
            />

            <label
              htmlFor="ludo-max"
              className="mb-1 block text-xs font-bold text-slate-800"
            >
              {t("maxPlayers")}
            </label>
            <select
              id="ludo-max"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="mb-3 h-9 w-full rounded-[7px] border border-slate-300 bg-white px-2.5 text-xs text-slate-900 outline-none focus:border-blue-500"
            >
              {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                <option key={n} value={n}>
                  {n} pemain
                </option>
              ))}
            </select>

            <label className="mb-4 flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-800">
              <input
                type="checkbox"
                checked={play}
                onChange={(e) => setPlay(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              {t("joinAsPlayer")}
            </label>

            <button
              type="submit"
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-[7px] bg-blue-600 px-3 text-xs font-bold text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy || !name.trim()}
            >
              <Plus className="h-4 w-4" />
              {t("create")}
            </button>
          </form>
        </div>
      </LudoBackdrop>
    </div>
  );
}
