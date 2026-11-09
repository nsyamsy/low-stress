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

function getCsrfHeader(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("ls_csrf="));
  if (!match) return {};
  const token = decodeURIComponent(match.slice("ls_csrf=".length));
  return token ? { "x-csrf-token": token } : {};
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
      if (!res.ok) throw new Error(t("errorLoadRooms"));
      const data = await res.json();
      setRooms(data.items ?? []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorLoadRooms"));
    }
  }, [t]);

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
      const res = await fetch(
        `/api/games/ludo/rooms/${encodeURIComponent(roomId)}/respond`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getCsrfHeader(),
          },
          credentials: "same-origin",
          body: JSON.stringify({ accept }),
        },
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || t("errorRespond"));
      }
      if (accept) {
        onOpenRoom(roomId);
      } else {
        await fetchRooms();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorRespond"));
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
        headers: {
          "Content-Type": "application/json",
          ...getCsrfHeader(),
        },
        credentials: "same-origin",
        body: JSON.stringify({ name: name.trim(), maxPlayers, play }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || t("errorCreateRoom"));
      }
      const data = await res.json();
      onOpenRoom(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorCreateRoom"));
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
        <div className="mb-4 flex items-center gap-3 text-[var(--text-on-primary)]">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-surface)]/15">
            <LayoutGrid className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-base font-extrabold">{t("title")}</h1>
            <p className="text-xs text-[var(--text-on-primary)]/80">{t("subtitle")}</p>
          </div>
        </div>

        {error && (
          <p className="mb-3 rounded-lg bg-[var(--danger-bg)] p-3 text-xs font-semibold text-[var(--danger-text)]">
            {error}
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-3 md:items-start">
          <div className="space-y-4 md:col-span-2">
            {invitations.length > 0 && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-sm backdrop-blur-sm">
                <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  {t("invitations")}
                </h2>
                <ul className="space-y-2">
                  {invitations.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--primary)]/10 px-3 py-2 border border-[var(--border)]"
                    >
                      <span className="text-xs font-semibold text-[var(--text-primary)]">
                        {t("inviteText", { host: r.hostName, room: r.name })}
                      </span>
                      <span className="flex gap-2">
                        <button
                          type="button"
                          className="inline-flex h-8 items-center rounded-lg bg-[var(--primary)] px-3 text-xs font-bold text-[var(--text-on-primary)] hover:bg-[var(--primary-hover)] disabled:opacity-50"
                          disabled={busy}
                          onClick={() => respond(r.id, true)}
                        >
                          {t("accept")}
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-8 items-center rounded-lg border border-[var(--border-strong)] px-3 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-inset)] disabled:opacity-50"
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

            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-sm backdrop-blur-sm">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                {t("rooms")}
              </h2>
              {rooms === null ? (
                <div className="flex justify-center py-8 text-[var(--text-muted)]">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : mine.length === 0 ? (
                <p className="py-6 text-center text-xs text-[var(--text-muted)]">
                  {t("noRooms")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {mine.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => onOpenRoom(r.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-surface-raised)] px-3 py-2 text-left hover:bg-[var(--bg-inset)]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-bold text-[var(--text-primary)]">
                            {r.name}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                            <Crown className="h-3 w-3 text-[var(--warning-text)]" />
                            {r.hostName} · {r.players} / {r.maxPlayers} {t("playersTitle")}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            r.status === "playing"
                              ? "bg-[var(--success-bg)] text-[var(--success-text)]"
                              : r.status === "finished"
                                ? "bg-[var(--bg-inset)] text-[var(--text-secondary)]"
                                : "bg-[var(--primary)]/15 text-[var(--primary)]"
                          }`}
                        >
                          {r.status === "playing"
                            ? t("status.playing")
                            : r.status === "finished"
                              ? t("status.finished")
                              : t("status.lobby")}
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
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-sm backdrop-blur-sm"
          >
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              {t("create")}
            </h2>
            <label
              htmlFor="ludo-name"
              className="mb-1 block text-xs font-bold text-[var(--text-primary)]"
            >
              {t("roomName")}
            </label>
            <input
              id="ludo-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder={t("roomNamePh")}
              className="mb-3 h-9 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-raised)] px-2.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
            />

            <label
              htmlFor="ludo-max"
              className="mb-1 block text-xs font-bold text-[var(--text-primary)]"
            >
              {t("maxPlayers")}
            </label>
            <select
              id="ludo-max"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="mb-3 h-9 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-raised)] px-2.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
            >
              {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                <option key={n} value={n}>
                  {t("playerCountOption", { count: n })}
                </option>
              ))}
            </select>

            <label className="mb-4 flex cursor-pointer items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={play}
                onChange={(e) => setPlay(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border-strong)] accent-[var(--primary)]"
              />
              {t("joinAsPlayer")}
            </label>

            <button
              type="submit"
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 text-xs font-bold text-[var(--text-on-primary)] shadow hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
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
