import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  RotateCcw,
  Volume2,
  VolumeX,
  Sparkles,
  Timer,
  Trophy,
} from "lucide-react";
import { cn } from "@low-stress/ui";
import { SoundEngine } from "./sound";
import {
  CARD_DEFS,
  type CardState,
  type RunResult,
  generateShuffledDeck,
  useGameTranslation,
} from "./deck";

const sounds = new SoundEngine();
const BEST_KEY = "ls-memory-match-best";

function readBestScore(fallback = 0): number {
  try {
    const val = localStorage.getItem(BEST_KEY);
    if (val !== null) return Math.max(fallback, Number(val) || 0);
  } catch {
    // storage diblokir
  }
  return fallback;
}

function writeBestScore(value: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // storage diblokir
  }
}

export interface MemoryMatchProps {
  onRunEnd?: (res: RunResult) => void;
  initialBestScore?: number;
}

export function MemoryMatch({
  onRunEnd,
  initialBestScore = 0,
}: MemoryMatchProps) {
  const { t } = useGameTranslation();

  const [cards, setCards] = useState<CardState[]>(generateShuffledDeck);
  const [flippedUids, setFlippedUids] = useState<number[]>([]);
  const [moves, setMoves] = useState<number>(0);
  const [combos, setCombos] = useState<number>(0);
  const [matchedPairs, setMatchedPairs] = useState<number>(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [finalScore, setFinalScore] = useState<number>(0);
  const [bestScore, setBestScore] = useState<number>(() =>
    readBestScore(initialBestScore),
  );
  const [isNewBest, setIsNewBest] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const lockRef = useRef<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Jalankan timer saat game aktif
  useEffect(() => {
    if (startTime && !isGameOver) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
      }, 500);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startTime, isGameOver]);

  // Bersihkan flip timeout saat unmount
  useEffect(() => {
    return () => {
      if (flipTimeoutRef.current) {
        clearTimeout(flipTimeoutRef.current);
        flipTimeoutRef.current = null;
      }
    };
  }, []);

  const restartGame = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (flipTimeoutRef.current) {
      clearTimeout(flipTimeoutRef.current);
      flipTimeoutRef.current = null;
    }
    setCards(generateShuffledDeck());
    setFlippedUids([]);
    setMoves(0);
    setCombos(0);
    setMatchedPairs(0);
    setStartTime(null);
    setElapsedSeconds(0);
    setIsGameOver(false);
    setIsNewBest(false);
    lockRef.current = false;
  }, []);

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    sounds.setMuted(next);
  };

  const handleVictory = useCallback(
    (totalMoves: number, totalCombos: number) => {
      const durationMs = startTime
        ? Date.now() - startTime
        : elapsedSeconds * 1000;
      const totalSecs = Math.max(1, Math.floor(durationMs / 1000));

      // Rumus skor Porting_Guide §3:
      // totalSecs   = max(1, floor(durasi_ms / 1000))
      // timePenalty = floor(totalSecs * 25)
      // movePenalty = max(0, (moves - 8) * 45)
      // comboBonus  = combos * 150
      // score       = max(200, floor(5000 - timePenalty - movePenalty + comboBonus))
      const timePenalty = Math.floor(totalSecs * 25);
      const movePenalty = Math.max(0, (totalMoves - 8) * 45);
      const comboBonus = totalCombos * 150;
      const score = Math.max(
        200,
        Math.floor(5000 - timePenalty - movePenalty + comboBonus),
      );

      setFinalScore(score);
      setIsGameOver(true);
      sounds.victory();

      const isNew = score > bestScore;
      if (isNew) {
        setBestScore(score);
        writeBestScore(score);
        setIsNewBest(true);
      }

      if (onRunEnd) {
        onRunEnd({
          score,
          durationMs,
          moves: totalMoves,
          combos: totalCombos,
          timeSeconds: totalSecs,
        });
      }
    },
    [startTime, elapsedSeconds, bestScore, onRunEnd],
  );

  const handleCardClick = useCallback((uid: number) => {
    if (lockRef.current) return;
    const card = cards[uid];
    if (!card || card.isFlipped || card.isMatched) return;

    setStartTime((prev) => prev ?? Date.now());

    sounds.flip();

    // Flip kartu yang diklik
    const nextCards = cards.map((c) =>
      c.uid === uid ? { ...c, isFlipped: true } : c,
    );
    setCards(nextCards);

    const newFlipped = [...flippedUids, uid];
    setFlippedUids(newFlipped);

    if (newFlipped.length === 2) {
      const firstUid = newFlipped[0]!;
      const secondUid = newFlipped[1]!;
      const firstCard = cards[firstUid]!;
      const secondCard = cards[secondUid]!;

      const nextMoves = moves + 1;
      setMoves(nextMoves);
      lockRef.current = true;

      if (firstCard.defId === secondCard.defId) {
        // Cocok!
        flipTimeoutRef.current = setTimeout(() => {
          flipTimeoutRef.current = null;
          sounds.match();
          setCards((prev) =>
            prev.map((c) =>
              c.uid === firstUid || c.uid === secondUid
                ? { ...c, isMatched: true, isFlipped: true }
                : c,
            ),
          );
          setFlippedUids([]);
          const nextCombos = combos + 1;
          setCombos(nextCombos);

          const nextMatched = matchedPairs + 1;
          setMatchedPairs(nextMatched);
          lockRef.current = false;

          // Periksa kemenangan (8 pasangan cocok)
          if (nextMatched === CARD_DEFS.length) {
            handleVictory(nextMoves, nextCombos);
          }
        }, 200); // 200 ms match lock Porting_Guide §3
      } else {
        // Tidak cocok
        flipTimeoutRef.current = setTimeout(() => {
          flipTimeoutRef.current = null;
          sounds.misMatch();
          setCards((prev) =>
            prev.map((c) =>
              c.uid === firstUid || c.uid === secondUid
                ? { ...c, isFlipped: false }
                : c,
            ),
          );
          setFlippedUids([]);
          setCombos(0); // Combo reset saat salah
          lockRef.current = false;
        }, 450); // 450 ms misMatch flip delay Porting_Guide §3
      }
    }
  }, [cards, flippedUids, moves, combos, matchedPairs, handleVictory]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto">
      {/* Top Header Card */}
      <div className="flex flex-wrap w-full items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3 shadow-xs mb-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs">
            <Timer className="h-4 w-4 text-[var(--primary)]" />
            <span className="sr-only">{t("time")}</span>
            <span className="font-extrabold tabular-nums text-[var(--text-primary)]">
              {formatTime(elapsedSeconds)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-xs font-bold text-[var(--text-secondary)]">
              {t("moves")}:
            </span>
            <span className="font-extrabold tabular-nums text-[var(--text-primary)]">
              {moves}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-xs font-bold text-[var(--text-secondary)]">
              {t("pairs")}:
            </span>
            <span className="font-extrabold tabular-nums text-[var(--primary)]">
              {matchedPairs}/{CARD_DEFS.length}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleMute}
            className="flex h-11 w-11 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-inset)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            title={isMuted ? t("unmute") : t("mute")}
            aria-label={isMuted ? t("unmute") : t("mute")}
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={restartGame}
            className="flex h-11 w-11 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-inset)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            title={t("reset")}
            aria-label={t("reset")}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main 4x4 Grid Board */}
      <div className="relative w-full aspect-square rounded-2xl border-2 border-[var(--border)] bg-[var(--bg-inset)] p-3 shadow-lg">
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
                  "relative flex items-center justify-center rounded-xl transition-all duration-300 transform select-none cursor-pointer active:scale-95",
                  isFlipped
                    ? "rotate-y-0 shadow-md"
                    : "hover:border-[var(--primary)] shadow-xs",
                  card.isMatched
                    ? "bg-emerald-500/10 border-2 border-emerald-500/40 ring-1 ring-emerald-500/20"
                    : isFlipped
                      ? "bg-[var(--bg-surface)] border-2 border-[var(--primary)]"
                      : "bg-[var(--bg-surface)] border-2 border-[var(--border)] hover:bg-[var(--bg-inset)]",
                )}
                aria-label={isFlipped ? t(`card.${def.id}`) : t("hiddenCard")}
              >
                {isFlipped ? (
                  <div className="flex flex-col items-center justify-center animate-in zoom-in-75 duration-200">
                    <div
                      className={cn(
                        "p-2 rounded-xl bg-gradient-to-br shadow-xs",
                        def.color,
                      )}
                    >
                      <Icon className="h-5 w-5 md:h-6 md:w-6 text-white stroke-[2.5]" />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center text-[var(--text-secondary)]">
                    <Sparkles className="h-4 w-4" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Victory Celebration Modal */}
        {isGameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/75 backdrop-blur-sm p-6 text-center animate-in fade-in zoom-in-95 duration-200 z-10">
            {isNewBest && (
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-0.5 text-xs font-black uppercase text-amber-950 shadow-lg animate-pulse">
                <Trophy className="h-3.5 w-3.5 inline-block mr-1" />
                {t("newRecord")}
              </div>
            )}
            <h3 className="text-2xl font-black uppercase text-emerald-400 drop-shadow-md">
              {t("allMatched")}
            </h3>
            <p className="mt-1 text-xs text-white/80">
              {t("completedDesc", {
                time: formatTime(elapsedSeconds),
                moves,
              })}
            </p>

            <div className="mt-4 w-full max-w-xs rounded-xl border border-white/10 bg-white/10 p-3 backdrop-blur-md">
              <div className="text-xs font-bold uppercase tracking-wider text-white/60">
                {t("finalScore")}
              </div>
              <div className="text-3xl font-black text-amber-400 tabular-nums">
                {finalScore}
              </div>
              <div className="mt-1 text-xs text-white/60">
                {t("best")}: {bestScore}
              </div>
            </div>

            <button
              type="button"
              onClick={restartGame}
              className="mt-5 flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-2.5 font-bold text-xs text-white shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              {t("playAgain")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
