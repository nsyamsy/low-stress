"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  RotateCcw,
  Trophy,
  Volume2,
  VolumeX,
  Sparkles,
  Timer,
  Zap,
  Target,
  Rocket,
  Diamond,
  Crown,
  Star,
  Clover,
  Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCommercialT } from "@/lib/commercial-i18n";

const BEST_KEY = "cbr-memorymatch-best";

export interface RunResult {
  score: number;
  durationMs: number;
  moves: number;
  timeSeconds: number;
}

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeBest(score: number) {
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // ignore
  }
}

// 8 Unique Card Pairs
const CARD_DEFS = [
  { id: "rocket", label: "Rocket", icon: Rocket, color: "from-violet-500 to-purple-600", textCol: "text-violet-400" },
  { id: "diamond", label: "Diamond", icon: Diamond, color: "from-cyan-400 to-blue-500", textCol: "text-cyan-400" },
  { id: "lightning", label: "Lightning", icon: Zap, color: "from-amber-400 to-orange-500", textCol: "text-amber-400" },
  { id: "target", label: "Target", icon: Target, color: "from-rose-500 to-red-600", textCol: "text-rose-400" },
  { id: "star", label: "Star", icon: Star, color: "from-yellow-400 to-amber-500", textCol: "text-yellow-400" },
  { id: "clover", label: "Clover", icon: Clover, color: "from-emerald-400 to-green-600", textCol: "text-emerald-400" },
  { id: "crown", label: "Crown", icon: Crown, color: "from-amber-300 to-yellow-500", textCol: "text-amber-300" },
  { id: "flame", label: "Flame", icon: Flame, color: "from-orange-500 to-red-500", textCol: "text-orange-400" },
];

interface CardState {
  uid: number; // unique key in grid (0-15)
  defId: string;
  isFlipped: boolean;
  isMatched: boolean;
}

function generateShuffledDeck(): CardState[] {
  const cards: { uid: number; defId: string }[] = [];
  CARD_DEFS.forEach((def) => {
    cards.push({ uid: 0, defId: def.id });
    cards.push({ uid: 0, defId: def.id });
  });

  // Fisher-Yates shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  return cards.map((c, index) => ({
    uid: index,
    defId: c.defId,
    isFlipped: false,
    isMatched: false,
  }));
}

// Built-in Synthesizer
class SoundEngine {
  private ctx: AudioContext | null = null;
  public enabled = true;

  private init() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  flip() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;
    osc.type = "sine";
    osc.frequency.setValueAtTime(360, t);
    osc.frequency.exponentialRampToValueAtTime(720, t + 0.08);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.09);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  match() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const chord = [523.25, 659.25, 783.99, 1046.5]; // C Major
    chord.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = this.ctx.currentTime + idx * 0.05;
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.008, t + 0.22);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  }

  misMatch() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.linearRampToValueAtTime(120, t + 0.16);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  victory() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = this.ctx.currentTime + idx * 0.08;
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.005, t + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.35);
    });
  }
}

const sounds = new SoundEngine();

export function MemoryMatch({ onRunEnd }: { onRunEnd?: (res: RunResult) => void }) {
  const { tt } = useCommercialT();
  const [cards, setCards] = useState<CardState[]>(() => generateShuffledDeck());
  const [flippedUids, setFlippedUids] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [bestScore, setBestScore] = useState<number>(readBest());
  const [finalScore, setFinalScore] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const [combos, setCombos] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const lockRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Timer effect
  useEffect(() => {
    if (startTime && !isGameOver) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
      }, 500);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startTime, isGameOver]);

  const restartGame = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCards(generateShuffledDeck());
    setFlippedUids([]);
    setMoves(0);
    setMatchedPairs(0);
    setStartTime(null);
    setElapsedSeconds(0);
    setIsGameOver(false);
    setIsNewBest(false);
    setCombos(0);
    lockRef.current = false;
  }, []);

  const handleCardClick = (uid: number) => {
    if (lockRef.current) return;
    const card = cards[uid];
    if (card.isFlipped || card.isMatched) return;

    if (!startTime) {
      setStartTime(Date.now());
    }

    sounds.flip();

    // Flip this card
    const nextCards = cards.map((c) => (c.uid === uid ? { ...c, isFlipped: true } : c));
    setCards(nextCards);

    const newFlipped = [...flippedUids, uid];
    setFlippedUids(newFlipped);

    if (newFlipped.length === 2) {
      setMoves((m) => m + 1);
      lockRef.current = true;
      const [firstUid, secondUid] = newFlipped;
      const firstCard = nextCards[firstUid];
      const secondCard = nextCards[secondUid];

      if (firstCard.defId === secondCard.defId) {
        // MATCH!
        sounds.match();
        setCombos((prev) => prev + 1);
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c) =>
              c.uid === firstUid || c.uid === secondUid ? { ...c, isMatched: true, isFlipped: true } : c
            )
          );
          setFlippedUids([]);
          setMatchedPairs((p) => {
            const nextPairs = p + 1;
            if (nextPairs === CARD_DEFS.length) {
              // ALL MATCHED - VICTORY!
              handleVictory(moves + 1);
            }
            return nextPairs;
          });
          lockRef.current = false;
        }, 200);
      } else {
        // MISMATCH
        sounds.misMatch();
        setCombos(0);
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c) =>
              c.uid === firstUid || c.uid === secondUid ? { ...c, isFlipped: false } : c
            )
          );
          setFlippedUids([]);
          lockRef.current = false;
        }, 450);
      }
    }
  };

  const handleVictory = (finalMoves: number) => {
    sounds.victory();
    const duration = startTime ? Date.now() - startTime : elapsedSeconds * 1000;
    const totalSecs = Math.max(1, Math.floor(duration / 1000));

    // Score Calculation:
    // Base 5000 pts. Faster completion & fewer moves = higher score.
    const timePenalty = Math.floor(totalSecs * 25);
    const movePenalty = Math.max(0, (finalMoves - 8) * 45);
    const comboBonus = combos * 150;
    const score = Math.max(200, Math.floor(5000 - timePenalty - movePenalty + comboBonus));

    setFinalScore(score);
    setIsGameOver(true);

    const prevBest = bestScore;
    const isNew = score > prevBest;
    if (isNew) {
      setIsNewBest(true);
      writeBest(score);
      setBestScore(score);
    }

    if (onRunEnd) {
      onRunEnd({
        score,
        durationMs: Math.max(2000, duration),
        moves: finalMoves,
        timeSeconds: totalSecs,
      });
    }
  };

  const toggleMute = () => {
    sounds.enabled = !sounds.enabled;
    setIsMuted(!sounds.enabled);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto">
      {/* Top Header Card */}
      <div className="flex w-full items-center justify-between rounded-[12px] border border-outline-variant/15 bg-surface-container-lowest p-3 shadow-xs mb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <Timer className="h-4 w-4 text-primary" />
            <span className="sr-only">{tt("games.memory.time")}</span>
            <span className="font-extrabold tabular-nums text-on-surface">{formatTime(elapsedSeconds)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[11px] font-bold text-on-surface-variant">{tt("games.memory.moves")}:</span>
            <span className="font-extrabold tabular-nums text-on-surface">{moves}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[11px] font-bold text-on-surface-variant">{tt("games.memory.pairs")}:</span>
            <span className="font-extrabold tabular-nums text-primary">{matchedPairs}/{CARD_DEFS.length}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleMute}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-outline-variant/20 bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors"
            title={isMuted ? tt("games.memory.unmute") : tt("games.memory.mute")}
          >
            {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={restartGame}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-outline-variant/20 bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors"
            title={tt("games.memory.reset")}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Main 4x4 Grid Board */}
      <div className="relative w-full aspect-square rounded-[16px] border-2 border-outline-variant/15 bg-surface-container-low/40 p-3 shadow-lg">
        <div className="grid grid-cols-4 grid-rows-4 gap-2.5 h-full w-full">
          {cards.map((card) => {
            const def = CARD_DEFS.find((d) => d.id === card.defId)!;
            const Icon = def.icon;
            const isFlipped = card.isFlipped || card.isMatched;

            return (
              <button
                key={card.uid}
                type="button"
                onClick={() => handleCardClick(card.uid)}
                disabled={card.isMatched || isGameOver}
                className={cn(
                  "relative flex items-center justify-center rounded-[12px] transition-all duration-300 transform select-none cursor-pointer active:scale-95",
                  isFlipped ? "rotate-y-0 shadow-md" : "hover:border-primary/40 shadow-xs",
                  card.isMatched
                    ? "bg-emerald-500/10 border-2 border-emerald-500/40 ring-1 ring-emerald-500/20"
                    : isFlipped
                    ? "bg-surface-container-lowest border-2 border-primary/40 ring-1 ring-primary/20"
                    : "bg-gradient-to-br from-surface-container-high to-surface-container-highest border-2 border-outline-variant/30 hover:bg-surface-container-highest"
                )}
                aria-label={isFlipped ? def.label : "Hidden Card"}
              >
                {isFlipped ? (
                  <div className="flex flex-col items-center justify-center animate-in zoom-in-75 duration-200">
                    <div className={cn("p-2 rounded-xl bg-gradient-to-br shadow-xs", def.color)}>
                      <Icon className="h-5 w-5 md:h-6 md:w-6 text-white stroke-[2.5]" />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center text-outline-variant/70">
                    <Sparkles className="h-4 w-4" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Victory Celebration Modal */}
        {isGameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[16px] bg-black/75 backdrop-blur-sm p-6 text-center animate-in fade-in zoom-in-95 duration-200 z-10">
            {isNewBest && (
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-0.5 text-[10px] font-black uppercase text-amber-950 shadow-lg animate-pulse">
                🏆 {tt("games.memory.newRecord")}
              </div>
            )}
            <h3 className="text-2xl font-black uppercase text-emerald-400 drop-shadow-md">
              {tt("games.memory.allMatched")}
            </h3>
            <p className="mt-1 text-xs text-white/80">
              {tt("games.memory.completedDesc", { time: formatTime(elapsedSeconds), moves })}
            </p>

            <div className="mt-4 w-full max-w-[240px] rounded-[12px] border border-white/10 bg-white/10 p-3 backdrop-blur-md">
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">{tt("games.memory.finalScore")}</div>
              <div className="text-3xl font-black text-amber-400 tabular-nums">{finalScore}</div>
              <div className="mt-1 text-[10px] text-white/60">{tt("games.memory.best")}: {bestScore}</div>
            </div>

            <button
              type="button"
              onClick={restartGame}
              className="mt-5 flex items-center gap-2 rounded-[10px] bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-2.5 font-bold text-xs text-white shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              {tt("games.memory.playAgain")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
