import { useEffect, useRef, useState } from "react";
import { translate } from "@low-stress/i18n";
import type { GameProps } from "@low-stress/sdk";
import type { Socket } from "socket.io-client";

import en from "../locales/en.json";
import id from "../locales/id.json";
import {
  DEFAULT_MOCHI_CUSTOMIZATION,
  type RiotCharacterCustomization,
} from "../shared/character";
import type { RiotClientRoomView } from "../shared/protocol";
import type { PlayerRole } from "../shared/rules";
import { GameScene } from "./GameScene";
import { Lobby } from "./Lobby";
import { connectRiot, emitAck } from "./net";
import { sfx } from "./audio";

const MESSAGES = { id, en };
type Locale = keyof typeof MESSAGES;

export default function Game({ locale, onExit }: GameProps) {
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(locale, key, params ?? {}, MESSAGES[locale]);

  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [view, setView] = useState<RiotClientRoomView | null>(null);
  const [role, setRole] = useState<PlayerRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [character, setCharacter] = useState<RiotCharacterCustomization>({
    ...DEFAULT_MOCHI_CUSTOMIZATION,
  });
  const [showCredits, setShowCredits] = useState(false);
  const viewRef = useRef<RiotClientRoomView | null>(null);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    const s = connectRiot();

    s.on("connect", () => {
      setSocket(s);
      setConnected(true);
      // Sambil menyambung kembali setelah putus/hidrasi server: kembalikan
      // ke room yang sama bila klien masih memegang view-nya.
      const v = viewRef.current;
      if (v?.roomId) {
        void emitAck<{ success?: boolean; room?: RiotClientRoomView }>(
          s,
          "player:reconnect",
          { roomId: v.roomId },
        )
          .then((res) => {
            if (res?.success && res.room) setView(res.room);
          })
          .catch(() => undefined);
      }
    });
    s.on("disconnect", () => setConnected(false));
    s.on("connect_error", () => setError("lobbyExtra.errorGeneric"));
    s.on("room:view", (v: RiotClientRoomView) => {
      setView(v);
      setError(null);
    });
    s.on("role", (d: { role: PlayerRole }) => setRole(d.role));
    s.on("room:kicked", () => {
      setView(null);
      setError("lobbyExtra.errorGeneric");
    });
    s.on("meeting:started", () => sfx.meetingStart());
    s.on("voting:result", (res: { ejectedId: string | null }) => {
      if (res.ejectedId) sfx.ejected();
    });
    s.on("game:finished", (res: { winner?: string }) => {
      if (res.winner === "crew") sfx.win();
      else sfx.lose();
    });

    return () => {
      s.disconnect();
    };
  }, []);

  // Role hanya relevan selama pertandingan; di lobi selalu null.
  const effectiveRole = view !== null && view.phase !== "lobby" ? role : null;

  const inGame = view !== null && view.phase !== "lobby";

  return (
    <div className="ls-stack w-full">
      {inGame && socket ? (
        <GameScene
          socket={socket}
          view={view}
          role={effectiveRole}
          locale={locale as Locale}
          t={t}
          onExit={onExit}
        />
      ) : (
        <Lobby
          socket={socket}
          connected={connected}
          view={view}
          character={character}
          onCharacterChange={setCharacter}
          error={error}
          t={t}
        />
      )}

      {/* Credit layar (RT-44) — selalu bisa dibuka dari lobi */}
      {!inGame ? (
        <div className="flex justify-center">
          <button
            type="button"
            className="ls-text-secondary text-xs underline"
            onClick={() => setShowCredits((v) => !v)}
          >
            {t("lobbyExtra.credits")}
          </button>
        </div>
      ) : null}

      {showCredits && !inGame ? <Credits locale={locale as Locale} t={t} /> : null}
    </div>
  );
}

function Credits({ locale, t }: { locale: Locale; t: (k: string) => string }) {
  void locale;
  return (
    <div className="ls-card ls-stack text-sm">
      <h2 className="ls-heading-3">{t("lobbyExtra.credits")}</h2>
      <p>
        <strong>Uproar on the Silent Station</strong> — game orisinal Low Stress.
      </p>
      <p>
        Karakter Mochi dihasilkan secara prosedural oleh engine game ini.
        Karakter Humanoid menggunakan aset "Mini Characters" oleh Kenney
        (CC0, kenney.nl). Musik &amp; efek suara disintesis orisinal via
        WebAudio. Tidak ada aset pihak ketiga yang dibatasi pakai.
      </p>
      <p className="ls-text-secondary">
        Detail lisensi lengkap ada di games/riot/assets/LICENSES.md.
      </p>
    </div>
  );
}
