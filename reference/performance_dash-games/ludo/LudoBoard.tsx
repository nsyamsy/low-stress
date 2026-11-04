"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as E from "@/lib/ludo-engine";
import { cn } from "@/lib/utils";
import { PawnShape } from "@/components/commercial/LudoPawn";

// One colour per arm: the four classic ones first, so a 2 to 4 player game looks like the usual board.
export const LUDO_COLORS: { main: string; dark: string }[] = [
  { main: "#E8383D", dark: "#A32226" },
  { main: "#3FA535", dark: "#27701F" },
  { main: "#F9C910", dark: "#A8860A" },
  { main: "#2D7FE0", dark: "#1A57A3" },
  { main: "#F58220", dark: "#B35C10" },
  { main: "#8E44AD", dark: "#5E2C73" },
  { main: "#E5589A", dark: "#A1386B" },
  { main: "#17A2A2", dark: "#0F6E6E" },
  { main: "#8D5B3A", dark: "#5E3B24" },
  { main: "#5C6BC0", dark: "#3A4488" },
];
const IDLE = { main: "#B4B2A9", dark: "#888780" };
const S = 20; // pixels per cell in the SVG's own units

const KEYFRAMES = `
@keyframes ludo-float { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(28px,-22px) scale(1.08); } }
@keyframes ludo-confetti { 0% { transform: translateY(-30px) rotate(0deg); opacity: 1; } 100% { transform: translateY(560px) rotate(720deg); opacity: 0.9; } }
@keyframes ludo-pop { 0% { transform: scale(0.8); opacity: 0; } 60% { transform: scale(1.06); } 100% { transform: scale(1); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .ludo-anim { animation: none !important; } }
`;

/**
 * Page background for the games: a deep gradient with a dot pattern and slowly drifting glows, so the
 * board never sits on a bare surface and the page is not dead still.
 */
export function LudoBackdrop({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-[16px] p-3 md:p-5 shadow-sm", className)}
      style={{
        backgroundColor: "#1e3a8a",
        backgroundImage: [
          "radial-gradient(rgba(255,255,255,0.08) 1.5px, transparent 1.5px)",
          "linear-gradient(135deg, #1e3a8a 0%, #4338ca 55%, #0f766e 100%)",
        ].join(", "),
        backgroundSize: "24px 24px, auto",
      }}
    >
      <style>{KEYFRAMES}</style>
      <span
        aria-hidden="true"
        className="ludo-anim pointer-events-none absolute -left-16 -top-16 h-72 w-72 rounded-full"
        style={{ background: "rgba(255,255,255,0.16)", filter: "blur(40px)", animation: "ludo-float 11s ease-in-out infinite" }}
      />
      <span
        aria-hidden="true"
        className="ludo-anim pointer-events-none absolute -bottom-20 -right-12 h-80 w-80 rounded-full"
        style={{ background: "rgba(45,212,191,0.28)", filter: "blur(44px)", animation: "ludo-float 14s ease-in-out -4s infinite" }}
      />
      <span
        aria-hidden="true"
        className="ludo-anim pointer-events-none absolute right-1/4 top-1/3 h-40 w-40 rounded-full"
        style={{ background: "rgba(251,191,36,0.14)", filter: "blur(36px)", animation: "ludo-float 17s ease-in-out -8s infinite" }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/** Confetti that falls over its parent once; used when somebody wins. */
export function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => {
        const r = (n: number) => {
          const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
          return x - Math.floor(x);
        };
        return {
          left: `${Math.round(r(1) * 100)}%`,
          delay: `${(r(2) * 1.2).toFixed(2)}s`,
          duration: `${(2.2 + r(3) * 1.6).toFixed(2)}s`,
          color: LUDO_COLORS[Math.floor(r(4) * 10)].main,
          size: 6 + Math.round(r(5) * 6),
        };
      }),
    []
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[14px]" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="ludo-anim absolute top-0 block"
          style={{
            left: p.left,
            width: p.size,
            height: p.size * 0.55,
            background: p.color,
            opacity: 0,
            animation: `ludo-confetti ${p.duration} ${p.delay} ease-in forwards`,
          }}
        />
      ))}
    </div>
  );
}

/** Where a pawn is drawn: its progress as shown (it walks towards the real one), and how it gets there. */
interface Shown {
  p: number;
  /** Milliseconds the move to this square takes. */
  dur: number;
  /** Counts up with every step of a walk; a new value replays the hop. */
  tick: number;
  walking: boolean;
}

interface Props {
  state: E.LudoState;
  /** Pawn shape per player (index = seat); anything missing is the classic pin. */
  characters?: (E.PawnCharacter | undefined)[];
  /** Pawns of the player on turn that may be tapped. */
  movable?: number[];
  onPawn?: (pawn: number) => void;
  className?: string;
}

export function LudoBoard({ state, characters = [], movable = [], onPawn, className }: Props) {
  const g = useMemo(() => E.geometry(state.arms), [state.arms]);
  const total = Math.max(g.hub + g.length + 0.6, Math.hypot(g.yardRadius + g.yard / 2, g.yard / 2) + 0.4) * S;
  const seatOfArm = useMemo(() => new Map(state.seats.map((arm, seat) => [arm, seat])), [state.seats]);
  const colorOf = (arm: number) => (seatOfArm.has(arm) ? LUDO_COLORS[arm] : IDLE);
  const turnArm = state.winner === null ? state.seats[state.turn] : null;

  // Pawns walk square by square towards the state's value instead of jumping there.
  const shownRef = useRef<Shown[][]>(state.pawns.map((row) => row.map((p) => ({ p, dur: 0, tick: 0, walking: false }))));
  const [, redraw] = useState(0);
  const pawnKey = state.pawns.map((row) => row.join(",")).join("|");

  useEffect(() => {
    const cur = shownRef.current;
    const sameShape = cur.length === state.pawns.length && cur.every((row, i) => row.length === state.pawns[i].length);
    if (!sameShape) {
      shownRef.current = state.pawns.map((row) => row.map((p) => ({ p, dur: 0, tick: 0, walking: false })));
      redraw((n) => n + 1);
      return;
    }
    const timers: number[] = [];
    const set = (seat: number, pawn: number, v: Shown) => {
      shownRef.current[seat][pawn] = v;
      redraw((n) => n + 1);
    };
    state.pawns.forEach((row, seat) =>
      row.forEach((to, pawn) => {
        const from = cur[seat][pawn].p;
        if (from === to) return;
        if (from > 0 && to > from) {
          const steps = to - from;
          const dur = Math.max(50, Math.min(140, 1600 / steps));
          for (let k = 1; k <= steps; k++) {
            timers.push(window.setTimeout(() => set(seat, pawn, { p: from + k, dur, tick: cur[seat][pawn].tick + k, walking: true }), (k - 1) * dur));
          }
        } else {
          // leaving the yard, or sent back to it: one smooth flight
          set(seat, pawn, { p: to, dur: 520, tick: cur[seat][pawn].tick + 1, walking: false });
        }
      })
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
    // pawnKey stands for state.pawns
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pawnKey]);

  const pawns = (() => {
    const items: { seat: number; pawn: number; arm: number; x: number; y: number; sh: Shown }[] = [];
    state.pawns.forEach((row, seat) =>
      row.forEach((_, pawn) => {
        const sh = shownRef.current[seat]?.[pawn] ?? { p: state.pawns[seat][pawn], dur: 0, tick: 0, walking: false };
        const pt = E.pawnPoint(g, state.seats[seat], sh.p, pawn);
        items.push({ seat, pawn, arm: state.seats[seat], x: pt.x * S, y: pt.y * S, sh });
      })
    );
    // pawns standing on the same square are fanned out so each stays visible and tappable
    const groups = new Map<string, number[]>();
    items.forEach((it, i) => {
      const key = `${Math.round(it.x)},${Math.round(it.y)}`;
      groups.set(key, [...(groups.get(key) ?? []), i]);
    });
    groups.forEach((idx) => {
      if (idx.length < 2) return;
      idx.forEach((i, n) => {
        items[i].x += (n - (idx.length - 1) / 2) * 5;
      });
    });
    return items;
  })();

  const arms = Array.from({ length: g.arms }, (_, i) => i);
  const half = Math.min(g.theta / 2, 60) * (Math.PI / 180);
  const wedgeRadius = (g.hub / Math.cos(half)) * S;

  return (
    <svg
      viewBox={`${-total} ${-total} ${2 * total} ${2 * total}`}
      className={cn("block w-full select-none", className)}
      role="img"
      aria-label="Ludo board"
    >
      <rect x={-total} y={-total} width={2 * total} height={2 * total} rx={14} fill="#E8ECF4" />

      {arms.map((arm) => {
        const c = colorOf(arm);
        return (
          <g key={`arm${arm}`} transform={`rotate(${E.armAngle(g, arm)})`}>
            {Array.from({ length: g.length }, (_, row) =>
              [0, 1, 2].map((col) => {
                const home = col === 1 && row >= 1;
                const start = col === 2 && row === 1;
                return (
                  <rect
                    key={`${row}-${col}`}
                    x={(col - 1.5) * S}
                    y={-(g.hub + g.length) * S + row * S}
                    width={S}
                    height={S}
                    fill={home || start ? c.main : "#fff"}
                    stroke="#B4B2A9"
                    strokeWidth={0.6}
                  />
                );
              })
            )}
            <text x={-S} y={-(g.hub + g.length) * S + 2 * S + S * 0.72} textAnchor="middle" fontSize={13} fill="#888780">
              ★
            </text>
          </g>
        );
      })}

      {arms.map((arm) => {
        const c = colorOf(arm);
        const yp = E.yardPoint(g, arm);
        const side = g.yard * S;
        const mine = turnArm === arm;
        return (
          <g key={`yard${arm}`} transform={`translate(${yp.x * S} ${yp.y * S}) rotate(${E.yardAngle(g, arm)})`}>
            <rect x={-side / 2} y={-side / 2} width={side} height={side} fill={c.main} stroke={mine ? "#fff" : "none"} strokeWidth={mine ? 3 : 0}>
              {mine && <animate attributeName="stroke-opacity" values="1;0.25;1" dur="1.3s" repeatCount="indefinite" />}
            </rect>
            <rect x={-side * 0.36} y={-side * 0.36} width={side * 0.72} height={side * 0.72} rx={S * 0.9} fill="#fff" />
            {Array.from({ length: state.pawns[0]?.length ?? 4 }, (_, j) => j).map((j) => {
              const ox = (j % 2 === 0 ? -1 : 1) * g.yard * 0.19 * S;
              const oy = (j < 2 ? -1 : 1) * g.yard * 0.19 * S;
              return <circle key={j} cx={ox} cy={oy} r={0.62 * S} fill={c.main} fillOpacity={0.25} stroke={c.main} strokeWidth={1.5} />;
            })}
          </g>
        );
      })}

      {arms.map((arm) => {
        const a1 = ((E.armAngle(g, arm) - g.theta / 2) * Math.PI) / 180;
        const a2 = ((E.armAngle(g, arm) + g.theta / 2) * Math.PI) / 180;
        const pts = `0,0 ${wedgeRadius * Math.sin(a1)},${-wedgeRadius * Math.cos(a1)} ${wedgeRadius * Math.sin(a2)},${-wedgeRadius * Math.cos(a2)}`;
        return <polygon key={`hub${arm}`} points={pts} fill={colorOf(arm).main} stroke="#fff" strokeWidth={0.8} />;
      })}

      {[...pawns]
        .sort((a, b) => Number(movable.includes(a.pawn) && a.seat === state.turn) - Number(movable.includes(b.pawn) && b.seat === state.turn))
        .map((it) => {
          const c = LUDO_COLORS[it.arm];
          const canMove = it.seat === state.turn && movable.includes(it.pawn);
          return (
            <g
              key={`${it.seat}-${it.pawn}`}
              style={{ transform: `translate(${it.x}px, ${it.y}px)`, transition: it.sh.dur ? `transform ${it.sh.dur}ms ${it.sh.walking ? "linear" : "ease-in-out"}` : undefined }}
              className={canMove ? "cursor-pointer" : undefined}
              onClick={canMove ? () => onPawn?.(it.pawn) : undefined}
            >
              {canMove && (
                <circle r={12} fill="none" stroke="#fff" strokeWidth={2.5}>
                  <animate attributeName="r" values="11;14;11" dur="1s" repeatCount="indefinite" />
                  <animate attributeName="stroke-opacity" values="1;0.35;1" dur="1s" repeatCount="indefinite" />
                </circle>
              )}
              {/* a new key replays the little hop on every square of a walk */}
              <g key={it.sh.walking ? it.sh.tick : "still"}>
                {it.sh.walking && <animateTransform attributeName="transform" type="translate" values="0 0; 0 -7; 0 0" dur={`${Math.max(60, it.sh.dur)}ms`} />}
                <PawnShape id={characters[it.seat] ?? "pin"} color={c.main} dark={c.dark} />
              </g>
              {canMove && <circle r={13} fill="transparent" />}
            </g>
          );
        })}
    </svg>
  );
}
