"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useCommercialT } from "@/lib/commercial-i18n";
import {
  CONFIG,
  GROUND_H,
  H,
  PLAY_H,
  W,
  createState,
  flap,
  medalFor,
  step,
  type GameState,
  type Medal,
} from "@/lib/flappy-engine";
import { CHARACTERS, drawCharacter, isCharacter, type CharacterId } from "@/lib/flappy-characters";

const BEST_KEY = "cbr-flappy-best";
const CHARACTER_KEY = "cbr-flappy-character";
const STEP = 1 / 120; // fixed physics step
const RESTART_LOCK_S = 0.45; // ignore taps right after dying so a late flap does not skip the result

const MEDAL_COLORS: Record<Exclude<Medal, null>, [string, string]> = {
  bronze: ["#cd7f32", "#8a5522"],
  silver: ["#d7dde2", "#8b959c"],
  gold: ["#ffd23f", "#c99700"],
};

function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}
function writeBest(value: number) {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // private mode or blocked storage: the best score just lasts for this visit
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function outlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill = "#fff") {
  ctx.font = `800 ${size}px "Inter", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(3, size / 7);
  ctx.strokeStyle = "#3b2f1b";
  ctx.lineJoin = "round";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

interface Labels {
  ready: string;
  tapToStart: string;
  gameOver: string;
  score: string;
  best: string;
  newBest: string;
  tapToRetry: string;
}

function draw(ctx: CanvasRenderingContext2D, s: GameState, best: number, isNewBest: boolean, labels: Labels, character: CharacterId) {
  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, PLAY_H);
  sky.addColorStop(0, "#4ec0ca");
  sky.addColorStop(1, "#b6ecf2");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // clouds drift slowly, independent of the pipes
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  for (let i = 0; i < 4; i++) {
    const cx = (((i * 140 - s.time * 14) % (W + 120)) + (W + 120)) % (W + 120) - 60;
    const cy = 70 + ((i * 53) % 150);
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.arc(cx + 22, cy + 6, 16, 0, Math.PI * 2);
    ctx.arc(cx - 22, cy + 8, 14, 0, Math.PI * 2);
    ctx.arc(cx + 4, cy - 10, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  // far hills
  ctx.fillStyle = "#9bd9a3";
  ctx.beginPath();
  ctx.moveTo(0, PLAY_H);
  for (let x = 0; x <= W; x += 10) ctx.lineTo(x, PLAY_H - 36 - Math.sin((x + s.time * 6) / 38) * 14 - Math.sin(x / 90) * 10);
  ctx.lineTo(W, PLAY_H);
  ctx.closePath();
  ctx.fill();

  // pipes
  for (const p of s.pipes) {
    const gapTop = p.gapY - CONFIG.gap / 2;
    const gapBottom = p.gapY + CONFIG.gap / 2;
    const drawPipe = (y: number, h: number, capY: number) => {
      const body = ctx.createLinearGradient(p.x, 0, p.x + CONFIG.pipeWidth, 0);
      body.addColorStop(0, "#5aa02c");
      body.addColorStop(0.35, "#8fd14f");
      body.addColorStop(1, "#4d8a24");
      ctx.fillStyle = body;
      ctx.fillRect(p.x, y, CONFIG.pipeWidth, h);
      ctx.strokeStyle = "#3b6a1a";
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x + 1, y + 1, CONFIG.pipeWidth - 2, h - 2);
      // cap
      ctx.fillStyle = body;
      ctx.fillRect(p.x - 4, capY, CONFIG.pipeWidth + 8, 24);
      ctx.strokeRect(p.x - 3, capY + 1, CONFIG.pipeWidth + 6, 22);
    };
    drawPipe(0, gapTop, gapTop - 24);
    drawPipe(gapBottom, PLAY_H - gapBottom, gapBottom);
  }

  // ground
  ctx.fillStyle = "#ded895";
  ctx.fillRect(0, PLAY_H, W, GROUND_H);
  ctx.fillStyle = "#73bf2e";
  ctx.fillRect(0, PLAY_H, W, 14);
  ctx.fillStyle = "#9be04a";
  for (let x = -24; x < W + 24; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x - s.groundX, PLAY_H);
    ctx.lineTo(x - s.groundX + 12, PLAY_H);
    ctx.lineTo(x - s.groundX + 2, PLAY_H + 14);
    ctx.lineTo(x - s.groundX - 10, PLAY_H + 14);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "#558022";
  ctx.fillRect(0, PLAY_H + 14, W, 3);
  ctx.fillStyle = "#d0c874";
  ctx.fillRect(0, PLAY_H + 17, W, 4);

  // bird
  ctx.save();
  ctx.translate(CONFIG.birdX, s.birdY);
  ctx.rotate(s.birdRot);
  const flapAngle = s.phase === "over" ? 0.5 : Math.sin(s.time * (s.phase === "ready" ? 16 : 22)) * 0.6;
  drawCharacter(ctx, character, flapAngle);
  ctx.restore();

  // score while playing
  if (s.phase === "playing") outlinedText(ctx, String(s.score), W / 2, 70, 46);

  if (s.phase === "ready") {
    outlinedText(ctx, labels.ready, W / 2, 150, 34);
    ctx.globalAlpha = 0.65 + Math.sin(s.time * 4) * 0.35;
    outlinedText(ctx, labels.tapToStart, W / 2, 360, 17);
    ctx.globalAlpha = 1;
  }

  if (s.phase === "over") {
    // white flash on impact
    if (s.sinceOver < 0.25) {
      ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - s.sinceOver / 0.25)})`;
      ctx.fillRect(0, 0, W, H);
    }
    // result panel slides up after a beat
    const t = Math.min(1, Math.max(0, (s.sinceOver - 0.3) / 0.35));
    const ease = 1 - Math.pow(1 - t, 3);
    ctx.globalAlpha = ease;
    outlinedText(ctx, labels.gameOver, W / 2, 120, 38, "#ffb02e");

    const px = 50;
    const pw = W - 100;
    const py = 190 + (1 - ease) * 40;
    const ph = 160;
    ctx.fillStyle = "#ded895";
    roundRect(ctx, px, py, pw, ph, 12);
    ctx.fill();
    ctx.strokeStyle = "#3b2f1b";
    ctx.lineWidth = 3;
    ctx.stroke();

    const medal = medalFor(s.score);
    // medal slot
    ctx.fillStyle = "#c9c18a";
    ctx.beginPath();
    ctx.arc(px + 52, py + ph / 2, 30, 0, Math.PI * 2);
    ctx.fill();
    if (medal) {
      const [light, dark] = MEDAL_COLORS[medal];
      const g = ctx.createRadialGradient(px + 46, py + ph / 2 - 6, 4, px + 52, py + ph / 2, 28);
      g.addColorStop(0, light);
      g.addColorStop(1, dark);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px + 52, py + ph / 2, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#3b2f1b";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "800 20px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("★", px + 52, py + ph / 2 + 1);
    }

    // labels and numbers share one centre line so they read as two stacked pairs
    const colX = px + pw - 62;
    ctx.textAlign = "center";
    ctx.fillStyle = "#8a5a12";
    ctx.font = "800 13px system-ui, sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(labels.score.toUpperCase(), colX, py + 38);
    ctx.fillText(labels.best.toUpperCase(), colX, py + 100);
    outlinedText(ctx, String(s.score), colX, py + 62, 32);
    outlinedText(ctx, String(best), colX, py + 124, 32);
    if (isNewBest) {
      ctx.save();
      ctx.translate(px + 100, py + 26);
      ctx.rotate(-0.12);
      ctx.fillStyle = "#e5483a";
      roundRect(ctx, -2, -11, 62, 20, 5);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "800 11px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(labels.newBest, 5, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    if (s.sinceOver > 0.9) {
      ctx.globalAlpha = 0.65 + Math.sin(s.time * 4) * 0.35;
      outlinedText(ctx, labels.tapToRetry, W / 2, 400, 17);
      ctx.globalAlpha = 1;
    }
  }
}

export interface RunResult {
  score: number;
  /** How long the run lasted, from the first flap to the crash. */
  durationMs: number;
}

function CharacterPreview({ id }: { id: CharacterId }) {
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
  return <canvas ref={ref} aria-hidden="true" className="h-[34px] w-[44px]" />;
}

/** Flappy Bird on a canvas. Tap / click the game, or press Space, Up or W. `onRunEnd` fires once per crash. */
export function FlappyBird({ className, onRunEnd }: { className?: string; onRunEnd?: (result: RunResult) => void }) {
  const { tt } = useCommercialT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(createState());
  const bestRef = useRef(0);
  const newBestRef = useRef(false);
  const labelsRef = useRef<Labels>({} as Labels);
  const characterRef = useRef<CharacterId>("yellow");
  const onRunEndRef = useRef(onRunEnd);
  onRunEndRef.current = onRunEnd;
  const [best, setBest] = useState(0);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [character, setCharacter] = useState<CharacterId>("yellow");

  labelsRef.current = {
    ready: tt("games.flappy.ready"),
    tapToStart: tt("games.flappy.tapToStart"),
    gameOver: tt("games.flappy.gameOver"),
    score: tt("games.flappy.score"),
    best: tt("games.flappy.best"),
    newBest: tt("games.flappy.newBest"),
    tapToRetry: tt("games.flappy.tapToRetry"),
  };

  useEffect(() => {
    bestRef.current = readBest();
    setBest(bestRef.current);
    try {
      const saved = localStorage.getItem(CHARACTER_KEY);
      if (isCharacter(saved)) {
        characterRef.current = saved;
        setCharacter(saved);
      }
    } catch {
      // storage blocked: the default character is used
    }
  }, []);

  const pickCharacter = (id: CharacterId) => {
    characterRef.current = id;
    setCharacter(id);
    try {
      localStorage.setItem(CHARACTER_KEY, id);
    } catch {
      // not saved, lasts for this visit
    }
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
      // a long gap (tab was in the background) must not fast-forward the game
      acc += Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = stateRef.current;
      while (acc >= STEP) {
        step(s, STEP);
        acc -= STEP;
      }

      if (!wasPlaying && s.phase === "playing") runStart = now;
      if (wasPlaying && s.phase === "over") {
        onRunEndRef.current?.({ score: s.score, durationMs: now - runStart });
        if (s.score > bestRef.current) {
          bestRef.current = s.score;
          newBestRef.current = true;
          writeBest(s.score);
          setBest(s.score);
        }
        setLastScore(s.score);
      }
      wasPlaying = s.phase === "playing";

      draw(ctx, s, bestRef.current, newBestRef.current, labelsRef.current, characterRef.current);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
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
  }, [act]);

  return (
    <div className={cn("flex w-full flex-col items-center gap-3", className)}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={tt("games.flappy.title")}
        onPointerDown={(e) => {
          e.preventDefault();
          act();
        }}
        className="aspect-[360/560] w-full max-w-[360px] cursor-pointer touch-none select-none rounded-[12px] border border-outline-variant/20 shadow-lg"
      />
      <div className="flex w-full max-w-[360px] items-center justify-between gap-1.5" role="radiogroup" aria-label={tt("games.flappy.character")}>
        {CHARACTERS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={character === id}
            title={tt(`games.flappy.char.${id}`)}
            aria-label={tt(`games.flappy.char.${id}`)}
            // leave focus on the page, or the next Space press would also click this button
            onClick={(e) => {
              pickCharacter(id);
              e.currentTarget.blur();
            }}
            className={cn(
              "flex h-11 flex-1 cursor-pointer items-center justify-center rounded-[8px] border bg-surface-container-lowest",
              character === id ? "border-primary ring-2 ring-primary/40" : "border-outline-variant/20 hover:bg-surface-container-low"
            )}
          >
            <CharacterPreview id={id} />
          </button>
        ))}
      </div>
      <div className="flex w-full max-w-[360px] items-center justify-between text-xs text-on-surface-variant">
        <span>
          {tt("games.flappy.best")}: <b className="text-on-surface">{best}</b>
        </span>
        {lastScore !== null && (
          <span>
            {tt("games.flappy.last")}: <b className="text-on-surface">{lastScore}</b>
          </span>
        )}
      </div>
    </div>
  );
}
