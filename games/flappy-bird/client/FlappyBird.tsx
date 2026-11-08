import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  W,
  H,
  createState,
  flap,
  step,
  type GameState,
} from "../shared/engine";
import {
  CHARACTERS,
  drawCharacter,
  isCharacter,
  type CharacterId,
} from "./characters";
import { draw, type Labels } from "./render";
import { useFlappyTranslation } from "./i18n";

const BEST_KEY = "cbr-flappy-best";
const CHARACTER_KEY = "cbr-flappy-character";
const STEP = 1 / 120; // fixed physics step
const RESTART_LOCK_S = 0.45; // ignore taps right after dying so a late flap does not skip the result

function readBest(fallback = 0): number {
  try {
    const val = localStorage.getItem(BEST_KEY);
    if (val !== null) return Number(val) || 0;
  } catch {
    // storage diblokir
  }
  return fallback;
}

function writeBest(value: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // private mode / storage diblokir
  }
}

function readCharacter(): CharacterId {
  try {
    const saved = localStorage.getItem(CHARACTER_KEY);
    if (isCharacter(saved)) return saved;
  } catch {
    // storage diblokir
  }
  return "yellow";
}

function writeCharacter(id: CharacterId): void {
  try {
    localStorage.setItem(CHARACTER_KEY, id);
  } catch {
    // storage diblokir
  }
}

export interface RunResult {
  score: number;
  /** Durasi permainan dalam milidetik, dari flap pertama sampai tabrakan. */
  durationMs: number;
}

export function CharacterPreview({ id }: { id: CharacterId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = 44 * dpr;
    canvas.height = 34 * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(20, 17);
    ctx.scale(0.85, 0.85);
    drawCharacter(ctx, id, 0.3);
  }, [id]);
  return <canvas ref={ref} aria-hidden="true" className="ls-flappy-preview-canvas" />;
}

export interface FlappyBirdProps {
  className?: string;
  onRunEnd?: (result: RunResult) => void;
  defaultBest?: number;
  reducedMotion?: boolean;
}

/**
 * Flappy Bird Canvas 2D.
 * Kontrol sentuh/klik kanvas, Space, ArrowUp, atau W.
 */
export function FlappyBird({
  className,
  onRunEnd,
  defaultBest = 0,
  reducedMotion: propReducedMotion,
}: FlappyBirdProps) {
  const { t } = useFlappyTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(createState());
  const bestRef = useRef<number>(0);
  const newBestRef = useRef<boolean>(false);
  const labelsRef = useRef<Labels>({
    ready: "",
    tapToStart: "",
    gameOver: "",
    score: "",
    best: "",
    newBest: "",
    tapToRetry: "",
  });
  const characterRef = useRef<CharacterId>("yellow");
  const onRunEndRef = useRef(onRunEnd);

  const [best, setBest] = useState<number>(() =>
    Math.max(readBest(defaultBest), defaultBest),
  );
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [character, setCharacter] = useState<CharacterId>(() => readCharacter());
  const [systemReducedMotion, setSystemReducedMotion] = useState<boolean>(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return false;
  });
  const effectiveReducedMotion = propReducedMotion ?? systemReducedMotion;

  useEffect(() => {
    onRunEndRef.current = onRunEnd;
    bestRef.current = best;
    characterRef.current = character;
    labelsRef.current = {
      ready: t("ready"),
      tapToStart: t("tapToStart"),
      gameOver: t("gameOver"),
      score: t("score"),
      best: t("best"),
      newBest: t("newBest"),
      tapToRetry: t("tapToRetry"),
    };
  }, [onRunEnd, best, character, t]);

  useEffect(() => {
    if (propReducedMotion !== undefined) return;
    if (typeof window !== "undefined" && window.matchMedia) {
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      const listener = (e: MediaQueryListEvent) =>
        setSystemReducedMotion(e.matches);
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    }
  }, [propReducedMotion]);

  const pickCharacter = (id: CharacterId) => {
    characterRef.current = id;
    setCharacter(id);
    writeCharacter(id);
  };

  const act = useCallback(() => {
    const s = stateRef.current;
    if (s.phase === "over") {
      if (s.sinceOver < RESTART_LOCK_S) return;
      stateRef.current = createState();
      newBestRef.current = false;
      return;
    }
    flap(s);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let wasPlaying = false;
    let runStart = 0;

    const frame = (now: number) => {
      acc += Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = stateRef.current;
      while (acc >= STEP) {
        step(s, STEP);
        acc -= STEP;
      }

      if (!wasPlaying && s.phase === "playing") runStart = now;
      if (wasPlaying && s.phase === "over") {
        const duration = Math.round(now - runStart);
        onRunEndRef.current?.({ score: s.score, durationMs: duration });
        if (s.score > bestRef.current) {
          bestRef.current = s.score;
          newBestRef.current = true;
          writeBest(s.score);
          setBest(s.score);
        }
        setLastScore(s.score);
      }
      wasPlaying = s.phase === "playing";

      draw(
        ctx,
        s,
        bestRef.current,
        newBestRef.current,
        labelsRef.current,
        characterRef.current,
        effectiveReducedMotion,
      );
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
        e.preventDefault();
        act();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, [act, effectiveReducedMotion]);

  return (
    <div
      className={`flex w-full flex-col items-center gap-3 ${className ?? ""}`}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={t("title")}
        onPointerDown={(e) => {
          e.preventDefault();
          act();
        }}
        className="ls-flappy-canvas"
      />

      {/* 6 Pilihan Karakter (Porting_Guide §2) */}
      <div
        className="ls-flappy-controls"
        role="radiogroup"
        aria-label={t("character")}
      >
        {CHARACTERS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={character === id}
            title={t(`char.${id}`)}
            aria-label={t(`char.${id}`)}
            onClick={(e) => {
              pickCharacter(id);
              e.currentTarget.blur();
            }}
            className={`ls-flappy-char-btn ${
              character === id ? "ls-flappy-char-btn--active" : ""
            }`}
          >
            <CharacterPreview id={id} />
          </button>
        ))}
      </div>

      <div className="ls-flappy-scores-row">
        <span>
          {t("best")}: <b className="text-[var(--text-primary)]">{best}</b>
        </span>
        {lastScore !== null && (
          <span>
            {t("last")}: <b className="text-[var(--text-primary)]">{lastScore}</b>
          </span>
        )}
      </div>
    </div>
  );
}
