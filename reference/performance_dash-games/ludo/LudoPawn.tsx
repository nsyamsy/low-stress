import React from "react";
import type { PawnCharacter } from "@/lib/ludo-engine";

// The pawn shapes, drawn around (0, 0) in a box of about 20 by 20 so every one fits a board square.
// The player's colour fills the shape; the character only changes the silhouette.

const star = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 9.5 : 4.2;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
})();

export function PawnShape({ id, color, dark }: { id: PawnCharacter; color: string; dark: string }) {
  const line = { stroke: "#fff", strokeWidth: 2, strokeLinejoin: "round" as const };
  const shadow = <ellipse cx={0} cy={7} rx={7.5} ry={3} fill={dark} fillOpacity={0.5} />;
  const eyes = (y: number) => (
    <>
      <circle cx={-2.6} cy={y} r={1.3} fill="#1f2937" />
      <circle cx={2.6} cy={y} r={1.3} fill="#1f2937" />
    </>
  );
  switch (id) {
    case "crown":
      return (
        <>
          {shadow}
          <path d="M-8 6 L-8.5 -4 L-4 0 L0 -8 L4 0 L8.5 -4 L8 6 Z" fill={color} {...line} />
          <circle cx={0} cy={-8} r={1.6} fill="#fff" />
          <rect x={-6} y={2.5} width={12} height={1.6} fill="#fff" fillOpacity={0.6} />
        </>
      );
    case "star":
      return (
        <>
          {shadow}
          <polygon points={star} fill={color} {...line} />
        </>
      );
    case "cat":
      return (
        <>
          {shadow}
          <polygon points="-7.5,-1 -6.5,-9 -1,-5" fill={color} {...line} />
          <polygon points="7.5,-1 6.5,-9 1,-5" fill={color} {...line} />
          <circle cx={0} cy={1} r={7.5} fill={color} {...line} />
          {eyes(0)}
          <path d="M-1.5 3 L0 4.4 L1.5 3 Z" fill="#fff" />
        </>
      );
    case "robot":
      return (
        <>
          {shadow}
          <line x1={0} y1={-5} x2={0} y2={-9} stroke={dark} strokeWidth={1.6} />
          <circle cx={0} cy={-9.5} r={1.8} fill="#fff" stroke={dark} strokeWidth={1} />
          <rect x={-7.5} y={-5} width={15} height={12.5} rx={3.5} fill={color} {...line} />
          <rect x={-4.8} y={-2} width={3.2} height={3.2} rx={0.8} fill="#fff" />
          <rect x={1.6} y={-2} width={3.2} height={3.2} rx={0.8} fill="#fff" />
          <rect x={-3.5} y={3.5} width={7} height={1.6} rx={0.8} fill="#fff" fillOpacity={0.7} />
        </>
      );
    case "heart":
      return (
        <>
          {shadow}
          <path d="M0 7.5 C-11 0 -8 -9 0 -4 C8 -9 11 0 0 7.5 Z" fill={color} {...line} />
          <ellipse cx={-3.5} cy={-3.5} rx={1.8} ry={1.2} fill="#fff" fillOpacity={0.6} />
        </>
      );
    case "ghost":
      return (
        <>
          {shadow}
          <path d="M-7.5 7 V-1 A7.5 7.5 0 0 1 7.5 -1 V7 L5 5 L2.5 7 L0 5 L-2.5 7 L-5 5 Z" fill={color} {...line} />
          {eyes(-1.5)}
        </>
      );
    case "rocket":
      return (
        <>
          {shadow}
          <polygon points="-4.5,2 -8.5,7 -3.5,5.5" fill={dark} {...line} strokeWidth={1.4} />
          <polygon points="4.5,2 8.5,7 3.5,5.5" fill={dark} {...line} strokeWidth={1.4} />
          <path d="M0 -10 C6 -5 6 3 4 7 H-4 C-6 3 -6 -5 0 -10 Z" fill={color} {...line} />
          <circle cx={0} cy={-2} r={2.4} fill="#fff" stroke={dark} strokeWidth={1} />
        </>
      );
    default:
      return (
        <>
          {shadow}
          <circle cx={0} cy={-1} r={7.5} fill={color} {...line} />
          <circle cx={-2} cy={-3.5} r={2} fill="#fff" fillOpacity={0.6} />
        </>
      );
  }
}

/** A small standalone picture of a pawn, for the picker. */
export function PawnIcon({ id, color, dark, size = 28 }: { id: PawnCharacter; color: string; dark: string; size?: number }) {
  return (
    <svg viewBox="-12 -12 24 24" width={size} height={size} aria-hidden="true">
      <PawnShape id={id} color={color} dark={dark} />
    </svg>
  );
}
