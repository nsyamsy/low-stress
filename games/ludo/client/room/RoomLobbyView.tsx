import { useTranslation } from "react-i18next";
import { Crown, Dices, UserPlus } from "lucide-react";
import {
  LUDO_COLORS,
  PAWN_CHARACTERS,
  type ExitRule,
} from "../../shared/engine";
import { PawnIcon } from "../LudoPawn";
import type { PlayerView, RoomView } from "./types";

export function RoomLobbyView({
  room,
  acceptedPlayers,
  myPlayer,
  busy,
  pawnsSetting,
  exitSetting,
  goalSetting,
  onPawnsSettingChange,
  onExitSettingChange,
  onGoalSettingChange,
  onOpenInvite,
  onSendAction,
}: {
  room: RoomView;
  acceptedPlayers: PlayerView[];
  myPlayer: PlayerView | undefined;
  busy: boolean;
  pawnsSetting: number;
  exitSetting: ExitRule;
  goalSetting: number;
  onPawnsSettingChange: (next: number) => void;
  onExitSettingChange: (next: ExitRule) => void;
  onGoalSettingChange: (next: number) => void;
  onOpenInvite: () => void;
  onSendAction: (payload: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation("game.ludo");

  return (
    <div className="w-full space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
          {t("playersTitle")} ({acceptedPlayers.length}/{room.maxPlayers})
        </h2>
        {room.isHost && (
          <button
            type="button"
            onClick={onOpenInvite}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-[var(--primary)] px-2.5 text-xs font-bold text-[var(--text-on-primary)] hover:bg-[var(--primary-hover)]"
          >
            <UserPlus className="h-3.5 w-3.5" />
            {t("invite")}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {room.players.map((p) => {
          const col =
            p.seat !== null && LUDO_COLORS[p.seat]
              ? LUDO_COLORS[p.seat]!
              : LUDO_COLORS[0]!;
          return (
            <div
              key={p.userId}
              className={`flex items-center justify-between rounded-lg border p-2.5 ${
                p.isMe
                  ? "border-[var(--border-strong)] bg-[var(--primary)]/10"
                  : "border-[var(--border)] bg-[var(--bg-surface)]"
              }`}
            >
              <div className="flex items-center gap-2">
                <PawnIcon id={p.pawn} color={col.main} dark={col.dark} size={28} />
                <div>
                  <div className="flex items-center gap-1 text-xs font-bold text-[var(--text-primary)]">
                    <span>{p.name}</span>
                    {p.isHost && (
                      <Crown className="h-3.5 w-3.5 text-[var(--warning-text)]" />
                    )}
                    {p.autopilot && (
                      <span className="rounded bg-[var(--bg-inset)] px-1 text-xs font-bold text-[var(--text-secondary)]">
                        {t("autopilotBadge")}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-[var(--text-muted)]">
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
                  onClick={() => onSendAction({ action: "kick", userId: p.userId })}
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
        <h3 className="mb-2 text-xs font-bold text-[var(--text-secondary)]">
          {t("pickPawn")}
        </h3>
        <div className="flex flex-wrap gap-2">
          {PAWN_CHARACTERS.map((char) => {
            const isCurrent = myPlayer?.pawn === char;
            return (
              <button
                key={char}
                type="button"
                onClick={() => onSendAction({ action: "pawn", pawn: char })}
                className={`flex h-11 w-11 items-center justify-center rounded-lg border transition ${
                  isCurrent
                    ? "border-[var(--primary)] bg-[var(--primary)]/15 ring-2 ring-[var(--primary)]"
                    : "border-[var(--border-strong)] bg-[var(--bg-surface-raised)] hover:bg-[var(--bg-inset)]"
                }`}
                title={t(`char.${char}`)}
              >
                <PawnIcon
                  id={char}
                  color={LUDO_COLORS[0]!.main}
                  dark={LUDO_COLORS[0]!.dark}
                  size={24}
                />
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
              <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">
                {t("pawnsEach")}
              </label>
              <select
                value={pawnsSetting}
                onChange={(e) => onPawnsSettingChange(Number(e.target.value))}
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
              <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">
                {t("exitTitle")}
              </label>
              <select
                value={exitSetting}
                onChange={(e) => onExitSettingChange(e.target.value as ExitRule)}
                className="h-8 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-raised)] px-2 text-xs"
              >
                <option value="double">{t("exit.double")}</option>
                <option value="sixes">{t("exit.sixes")}</option>
                <option value="six">{t("exit.six")}</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">
                {t("goalTitle")}
              </label>
              <select
                value={goalSetting}
                onChange={(e) => onGoalSettingChange(Number(e.target.value))}
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
                onSendAction({
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
              onClick={() => onSendAction({ action: "respond", accept: true })}
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
  );
}
