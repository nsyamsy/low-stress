import { useState } from "react";
import type { Socket } from "socket.io-client";
import { Button, Chip } from "@low-stress/ui";
import {
  DEFAULT_HOST_OPTIONS,
  MIN_PLAYERS_TO_START,
  type RiotHostOptions,
} from "../shared/lobby";
import type { RiotCharacterCustomization } from "../shared/character";
import { CHARACTER_ACCESSORIES } from "../shared/character";
import type { RiotClientRoomView } from "../shared/protocol";
import { AvatarPreview } from "./AvatarPreview";
import { CharacterPicker, type TranslateFn } from "./CharacterPicker";
import { emitAck } from "./net";

interface LobbyProps {
  socket: Socket | null;
  connected: boolean;
  view: RiotClientRoomView | null;
  character: RiotCharacterCustomization;
  onCharacterChange: (c: RiotCharacterCustomization) => void;
  error: string | null;
  t: TranslateFn;
}

function accessoryLabel(acc: unknown, t: TranslateFn): string | null {
  if (typeof acc !== "string") return null;
  if (acc === "none" || acc === null) return null;
  if ((CHARACTER_ACCESSORIES as readonly string[]).includes(acc)) {
    return t(`characters.accessories.${acc}`);
  }
  return null;
}

const OPTION_FIELDS: Array<{ key: keyof RiotHostOptions; min: number; max: number; step: number }> = [
  { key: "infiltratorCount", min: 1, max: 3, step: 1 },
  { key: "tasksPerPlayer", min: 1, max: 5, step: 1 },
  { key: "playerSpeed", min: 0.5, max: 2.5, step: 0.1 },
  { key: "visionRadius", min: 4, max: 16, step: 0.5 },
  { key: "actionCooldownSeconds", min: 10, max: 60, step: 5 },
  { key: "discussionDurationSeconds", min: 15, max: 120, step: 5 },
  { key: "votingDurationSeconds", min: 15, max: 120, step: 5 },
  { key: "emergencyMeetingsPerPlayer", min: 1, max: 5, step: 1 },
];

const OPTION_LABEL_KEYS: Record<keyof RiotHostOptions, string> = {
  infiltratorCount: "lobbyExtra.infiltrators",
  tasksPerPlayer: "lobbyExtra.tasksPerPlayer",
  playerSpeed: "lobbyExtra.playerSpeed",
  visionRadius: "lobbyExtra.visionRadius",
  actionCooldownSeconds: "lobbyExtra.actionCooldown",
  discussionDurationSeconds: "lobbyExtra.discussionDuration",
  votingDurationSeconds: "lobbyExtra.votingDuration",
  emergencyMeetingsPerPlayer: "lobbyExtra.emergencyMeetings",
};

export function Lobby({
  socket,
  connected,
  view,
  character,
  onCharacterChange,
  error,
  t,
}: LobbyProps) {
  const [joinId, setJoinId] = useState("");
  const [busy, setBusy] = useState(false);

  const createRoom = async () => {
    if (!socket) return;
    setBusy(true);
    try {
      await emitAck(socket, "room:create", { character });
    } catch {
      /* view akan diisi lewat room:view; error koneksi ditangani induk */
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = async () => {
    const roomId = joinId.trim();
    if (!socket || !roomId) return;
    setBusy(true);
    try {
      await emitAck(socket, "room:join", { roomId, character });
    } catch {
      /* sama */
    } finally {
      setBusy(false);
    }
  };

  const leaveRoom = () => {
    if (!socket) return;
    void emitAck(socket, "room:leave").catch(() => undefined);
  };

  const updateOption = (key: keyof RiotHostOptions, raw: string) => {
    if (!socket || !view) return;
    const num = Number(raw);
    if (!Number.isFinite(num)) return;
    void emitAck(socket, "room:options", {
      options: { [key]: num },
    }).catch(() => undefined);
  };

  const startGame = () => {
    if (!socket) return;
    void emitAck(socket, "game:start").catch(() => undefined);
  };

  const isHost = view !== null && view.hostId === view.viewerId;

  return (
    <div className="ls-card ls-stack w-full max-w-md mx-auto">
      <div className="ls-row">
        <h1 className="ls-heading-2">{t("title")}</h1>
        <Chip tone={connected ? "success" : "neutral"}>
          {connected ? "Online" : "Offline"}
        </Chip>
      </div>
      <p className="ls-text-secondary">{t("subtitle")}</p>

      {error && <p className="text-sm text-danger">{t(error)}</p>}

      {view === null ? (
        <div className="ls-stack">
          <Button onClick={() => void createRoom()} disabled={!connected || busy}>
            {t("createRoom")}
          </Button>

          <div className="ls-stack">
            <label className="ls-text-secondary text-sm" htmlFor="riot-join-id">
              {t("lobbyExtra.joinById")}
            </label>
            <div className="ls-row">
              <input
                id="riot-join-id"
                value={joinId}
                onChange={(e) => setJoinId(e.target.value)}
                placeholder={t("lobbyExtra.joinByIdPlaceholder")}
                className="ls-input flex-1"
                autoCapitalize="off"
                autoCorrect="off"
              />
              <Button variant="secondary" onClick={() => void joinRoom()} disabled={!connected || busy || !joinId.trim()}>
                {t("joinRoom")}
              </Button>
            </div>
          </div>

          <fieldset className="ls-stack">
            <legend className="ls-text-secondary text-sm">{t("lobbyExtra.characterTitle")}</legend>
            <CharacterPicker value={character} onChange={onCharacterChange} t={t} />
          </fieldset>
        </div>
      ) : (
        <div className="ls-stack">
          <div className="ls-row">
            <h2 className="ls-heading-3">{t("lobby")}</h2>
            <Chip tone="neutral">{view.roomId.slice(-6).toUpperCase()}</Chip>
          </div>

          <ul className="ls-stack" aria-label={t("lobbyExtra.playerList")}>
            {view.players.map((p) => {
              const acc = accessoryLabel(
                (p.character as { accessory?: unknown } | undefined)?.accessory,
                t,
              );
              return (
                <li key={p.id} className="ls-row items-center gap-2">
                  {p.character ? (
                    <AvatarPreview custom={p.character as RiotCharacterCustomization} size={40} />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {p.displayName}
                      {p.id === view.viewerId ? ` (${t("lobbyExtra.you")})` : ""}
                      {p.id === view.hostId ? ` · ${t("lobbyExtra.host")}` : ""}
                      {p.status === "ghost" ? ` · ${t("lobbyExtra.statusGhost")}` : ""}
                      {!p.connected ? ` · ${t("lobbyExtra.statusDisconnected")}` : ""}
                    </p>
                    {acc ? <p className="ls-text-secondary text-xs">{t("lobbyExtra.accessoryTag", { item: acc })}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>

          <fieldset className="ls-stack">
            <legend className="ls-text-secondary text-sm">{t("lobbyExtra.characterTitle")}</legend>
            <CharacterPicker
              value={character}
              onChange={(c) => {
                onCharacterChange(c);
                void emitAck(socket!, "character:update", { character: c }).catch(() => undefined);
              }}
              t={t}
            />
          </fieldset>

          {isHost ? (
            <fieldset className="ls-stack">
              <legend className="ls-text-secondary text-sm">{t("lobbyExtra.optionsTitle")}</legend>
              <div className="grid grid-cols-2 gap-2">
                {OPTION_FIELDS.map(({ key, min, max, step }) => (
                  <label key={key} className="ls-stack text-xs">
                    <span className="ls-text-secondary">{t(OPTION_LABEL_KEYS[key])}</span>
                    <input
                      type="number"
                      min={min}
                      max={max}
                      step={step}
                      defaultValue={view.options[key] ?? DEFAULT_HOST_OPTIONS[key]}
                      onChange={(e) => updateOption(key, e.target.value)}
                      className="ls-input"
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div className="ls-row">
            {isHost ? (
              <Button
                onClick={startGame}
                disabled={view.players.filter((p) => p.connected).length < MIN_PLAYERS_TO_START}
              >
                {t("start")}
              </Button>
            ) : (
              <p className="ls-text-secondary text-sm">{t("lobbyExtra.errorMinPlayers")}</p>
            )}
            <Button variant="ghost" onClick={leaveRoom}>
              {t("leaveRoom")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
