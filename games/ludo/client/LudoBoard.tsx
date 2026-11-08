/* eslint-disable low-stress/no-raw-design-values */
import React, { useEffect, useMemo, useState } from "react";
import {
  armAngle,
  geometry,
  LUDO_COLORS,
  pawnPoint,
  yardAngle,
  yardPoint,
  type LudoState,
  type PawnCharacter,
} from "../shared/engine";
import { PawnShape } from "./LudoPawn";

const IDLE = { main: "#B4B2A9", dark: "#888780" };
const S = 20; // pixels per cell in SVG units

const KEYFRAMES = `
@keyframes ludo-float { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(28px,-22px) scale(1.08); } }
@keyframes ludo-confetti { 0% { transform: translateY(-30px) rotate(0deg); opacity: 1; } 100% { transform: translateY(560px) rotate(720deg); opacity: 0.9; } }
@keyframes ludo-pop { 0% { transform: scale(0.8); opacity: 0; } 60% { transform: scale(1.06); } 100% { transform: scale(1); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .ludo-anim { animation: none !important; } }
.ludo-backdrop {
  background-color: #1e3a8a;
  background-image: radial-gradient(rgba(255,255,255,0.08) 1.5px, transparent 1.5px), linear-gradient(135deg, #1e3a8a 0%, #4338ca 55%, #0f766e 100%);
  background-size: 24px 24px, auto;
}
[data-theme="dark"] .ludo-backdrop {
  background-color: #0b1e3a;
  background-image: radial-gradient(rgba(255,255,255,0.07) 1.5px, transparent 1.5px), linear-gradient(135deg, #0b1e3a 0%, #1b2a56 55%, #0a2e29 100%);
  background-size: 24px 24px, auto;
}
`;

/**
 * Deep gradient backdrop with floating glows.
 */
export function LudoBackdrop({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`ludo-backdrop relative overflow-hidden rounded-[16px] p-3 md:p-5 shadow-sm ${className}`}
    >
      <style>{KEYFRAMES}</style>
      <span
        aria-hidden="true"
        className="ludo-anim pointer-events-none absolute -left-16 -top-16 h-72 w-72 rounded-full"
        style={{
          background: "rgba(255,255,255,0.16)",
          filter: "blur(40px)",
          animation: "ludo-float 11s ease-in-out infinite",
        }}
      />
      <span
        aria-hidden="true"
        className="ludo-anim pointer-events-none absolute -bottom-20 -right-12 h-80 w-80 rounded-full"
        style={{
          background: "rgba(45,212,191,0.28)",
          filter: "blur(44px)",
          animation: "ludo-float 14s ease-in-out -4s infinite",
        }}
      />
      <span
        aria-hidden="true"
        className="ludo-anim pointer-events-none absolute right-1/4 top-1/3 h-40 w-40 rounded-full"
        style={{
          background: "rgba(251,191,36,0.14)",
          filter: "blur(36px)",
          animation: "ludo-float 17s ease-in-out -8s infinite",
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/** Confetti overlay when game is won. */
export function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => {
        const r = (n: number) => {
          const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
          return x - Math.floor(x);
        };
        const colorIdx = Math.floor(r(4) * LUDO_COLORS.length);
        const col = LUDO_COLORS[colorIdx]?.main ?? "#E8383D";
        return {
          left: `${Math.round(r(1) * 100)}%`,
          delay: `${(r(2) * 1.2).toFixed(2)}s`,
          duration: `${(2.2 + r(3) * 1.6).toFixed(2)}s`,
          color: col,
          size: 6 + Math.round(r(5) * 6),
        };
      }),
    [],
  );

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[14px]"
      aria-hidden="true"
    >
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

interface Shown {
  p: number;
  dur: number;
  tick: number;
  walking: boolean;
}

interface BoardProps {
  state: LudoState;
  characters?: (PawnCharacter | undefined)[];
  movable?: number[];
  onPawn?: (pawn: number) => void;
  className?: string;
}

export function LudoBoard({
  state,
  characters = [],
  movable = [],
  onPawn,
  className = "",
}: BoardProps) {
  const g = useMemo(() => geometry(state.arms), [state.arms]);
  const total =
    Math.max(
      g.hub + g.length + 0.6,
      Math.hypot(g.yardRadius + g.yard / 2, g.yard / 2) + 0.4,
    ) * S;

  const seatOfArm = useMemo(
    () => new Map(state.seats.map((arm, seat) => [arm, seat])),
    [state.seats],
  );

  const colorOf = (arm: number) =>
    seatOfArm.has(arm) && LUDO_COLORS[arm] ? LUDO_COLORS[arm]! : IDLE;

  const turnArm =
    state.winner === null && state.turn < state.seats.length
      ? (state.seats[state.turn] ?? null)
      : null;

  const [shown, setShown] = useState<Shown[][]>(() =>
    state.pawns.map((row) =>
      row.map((p) => ({ p, dur: 0, tick: 0, walking: false })),
    ),
  );

  useEffect(() => {
    const timers: number[] = [];

    timers.push(
      window.setTimeout(() => {
        setShown((cur) => {
          const sameShape =
            cur.length === state.pawns.length &&
            cur.every((row, i) => row.length === (state.pawns[i]?.length ?? 0));

          if (!sameShape) {
            return state.pawns.map((row) =>
              row.map((p) => ({ p, dur: 0, tick: 0, walking: false })),
            );
          }
          return cur;
        });

        state.pawns.forEach((row, seat) =>
          row.forEach((to, pawn) => {
            setShown((cur) => {
              const from = cur[seat]?.[pawn]?.p ?? to;
              if (from === to) return cur;

              if (from > 0 && to > from) {
                const steps = to - from;
                const dur = Math.max(50, Math.min(140, 1600 / steps));
                for (let k = 1; k <= steps; k++) {
                  timers.push(
                    window.setTimeout(() => {
                      setShown((latest) => {
                        const next = latest.map((r) => [...r]);
                        const currentTick = next[seat]?.[pawn]?.tick ?? 0;
                        if (next[seat]) {
                          next[seat]![pawn] = {
                            p: from + k,
                            dur,
                            tick: currentTick + k,
                            walking: true,
                          };
                        }
                        return next;
                      });
                    }, (k - 1) * dur),
                  );
                }
              } else {
                timers.push(
                  window.setTimeout(() => {
                    setShown((latest) => {
                      const next = latest.map((r) => [...r]);
                      const currentTick = next[seat]?.[pawn]?.tick ?? 0;
                      if (next[seat]) {
                        next[seat]![pawn] = {
                          p: to,
                          dur: 520,
                          tick: currentTick + 1,
                          walking: false,
                        };
                      }
                      return next;
                    });
                  }, 10),
                );
              }
              return cur;
            });
          }),
        );
      }, 0),
    );

    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [state.pawns]);

  const pawns = (() => {
    const items: {
      seat: number;
      pawn: number;
      arm: number;
      x: number;
      y: number;
      sh: Shown;
    }[] = [];

    state.pawns.forEach((row, seat) =>
      row.forEach((_, pawn) => {
        const sh = shown[seat]?.[pawn] ?? {
          p: state.pawns[seat]?.[pawn] ?? 0,
          dur: 0,
          tick: 0,
          walking: false,
        };
        const arm = state.seats[seat] ?? 0;
        const pt = pawnPoint(g, arm, sh.p, pawn);
        items.push({ seat, pawn, arm, x: pt.x * S, y: pt.y * S, sh });
      }),
    );

    const groups = new Map<string, number[]>();
    items.forEach((it, i) => {
      const key = `${Math.round(it.x)},${Math.round(it.y)}`;
      groups.set(key, [...(groups.get(key) ?? []), i]);
    });

    groups.forEach((idx) => {
      if (idx.length < 2) return;
      idx.forEach((i, n) => {
        const item = items[i];
        if (item) {
          item.x += (n - (idx.length - 1) / 2) * 5;
        }
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
      className={`block w-full select-none ${className}`}
      role="img"
      aria-label="Ludo board"
      style={{ touchAction: "manipulation" }}
    >
      <rect
        x={-total}
        y={-total}
        width={2 * total}
        height={2 * total}
        rx={14}
        fill="#E8ECF4"
      />

      {arms.map((arm) => {
        const c = colorOf(arm);
        return (
          <g key={`arm${arm}`} transform={`rotate(${armAngle(g, arm)})`}>
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
              }),
            )}
            <text
              x={-S}
              y={-(g.hub + g.length) * S + 2 * S + S * 0.72}
              textAnchor="middle"
              fontSize={13}
              fill="#888780"
            >
              ★
            </text>
          </g>
        );
      })}

      {arms.map((arm) => {
        const c = colorOf(arm);
        const yp = yardPoint(g, arm);
        const side = g.yard * S;
        const mine = turnArm === arm;
        return (
          <g
            key={`yard${arm}`}
            transform={`translate(${yp.x * S} ${yp.y * S}) rotate(${yardAngle(g, arm)})`}
          >
            <rect
              x={-side / 2}
              y={-side / 2}
              width={side}
              height={side}
              fill={c.main}
              stroke={mine ? "#fff" : "none"}
              strokeWidth={mine ? 3 : 0}
            >
              {mine && (
                <animate
                  attributeName="stroke-opacity"
                  values="1;0.25;1"
                  dur="1.3s"
                  repeatCount="indefinite"
                />
              )}
            </rect>
            <rect
              x={-side * 0.36}
              y={-side * 0.36}
              width={side * 0.72}
              height={side * 0.72}
              rx={S * 0.9}
              fill="#fff"
            />
            {Array.from({ length: state.pawns[0]?.length ?? 4 }, (_, j) => j).map(
              (j) => {
                const ox = (j % 2 === 0 ? -1 : 1) * g.yard * 0.19 * S;
                const oy = (j < 2 ? -1 : 1) * g.yard * 0.19 * S;
                return (
                  <circle
                    key={j}
                    cx={ox}
                    cy={oy}
                    r={0.62 * S}
                    fill={c.main}
                    fillOpacity={0.25}
                    stroke={c.main}
                    strokeWidth={1.5}
                  />
                );
              },
            )}
          </g>
        );
      })}

      {arms.map((arm) => {
        const a1 = ((armAngle(g, arm) - g.theta / 2) * Math.PI) / 180;
        const a2 = ((armAngle(g, arm) + g.theta / 2) * Math.PI) / 180;
        const pts = `0,0 ${wedgeRadius * Math.sin(a1)},${-wedgeRadius * Math.cos(a1)} ${wedgeRadius * Math.sin(a2)},${-wedgeRadius * Math.cos(a2)}`;
        return (
          <polygon
            key={`hub${arm}`}
            points={pts}
            fill={colorOf(arm).main}
            stroke="#fff"
            strokeWidth={0.8}
          />
        );
      })}

      {[...pawns]
        .sort(
          (a, b) =>
            Number(movable.includes(a.pawn) && a.seat === state.turn) -
            Number(movable.includes(b.pawn) && b.seat === state.turn),
        )
        .map((it) => {
          const c = LUDO_COLORS[it.arm] ?? IDLE;
          const canMove = it.seat === state.turn && movable.includes(it.pawn);
          return (
            <g
              key={`${it.seat}-${it.pawn}`}
              style={{
                transform: `translate(${it.x}px, ${it.y}px)`,
                transition: it.sh.dur
                  ? `transform ${it.sh.dur}ms ${it.sh.walking ? "linear" : "ease-in-out"}`
                  : undefined,
              }}
              role={canMove ? "button" : undefined}
              tabIndex={canMove ? 0 : undefined}
              aria-label={canMove ? `Pion ${it.pawn + 1}` : undefined}
              className={canMove ? "cursor-pointer" : undefined}
              onClick={canMove ? () => onPawn?.(it.pawn) : undefined}
              onKeyDown={
                canMove
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onPawn?.(it.pawn);
                      }
                    }
                  : undefined
              }
            >
              {canMove && (
                <circle r={12} fill="none" stroke="#fff" strokeWidth={2.5}>
                  <animate
                    attributeName="r"
                    values="11;14;11"
                    dur="1s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="stroke-opacity"
                    values="1;0.35;1"
                    dur="1s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              <g key={it.sh.walking ? it.sh.tick : "still"}>
                {it.sh.walking && (
                  <animateTransform
                    attributeName="transform"
                    type="translate"
                    values="0 0; 0 -7; 0 0"
                    dur={`${Math.max(60, it.sh.dur)}ms`}
                  />
                )}
                <PawnShape
                  id={characters[it.seat] ?? "pin"}
                  color={c.main}
                  dark={c.dark}
                />
              </g>
              {/* Hit area for accessibility and touch targets (>= 44px) */}
              <circle
                r={22}
                fill="transparent"
                style={{ pointerEvents: canMove ? "auto" : "none" }}
              />
            </g>
          );
        })}
    </svg>
  );
}
