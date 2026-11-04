/* eslint-disable low-stress/no-raw-design-values */
import React, { useEffect, useRef, useState } from "react";

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function Die({
  value,
  rollId,
}: {
  value: number | null;
  rollId: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef(rollId);
  const [face, setFace] = useState(value);

  useEffect(() => {
    if (rollId === seen.current) {
      setFace(value);
      return;
    }
    seen.current = rollId;
    let n = 0;
    const timer = setInterval(() => {
      n++;
      if (n >= 8) {
        clearInterval(timer);
        setFace(value);
      } else {
        setFace(1 + Math.floor(Math.random() * 6));
      }
    }, 60);

    ref.current?.animate(
      [
        { transform: "translateY(0) rotate(0deg) scale(1)" },
        { transform: "translateY(-14px) rotate(200deg) scale(1.2)", offset: 0.45 },
        { transform: "translateY(0) rotate(360deg) scale(1)" },
      ],
      { duration: 520, easing: "ease-out" },
    );
    return () => clearInterval(timer);
  }, [rollId, value]);

  return (
    <div
      ref={ref}
      className="grid h-12 w-12 shrink-0 grid-cols-3 grid-rows-3 gap-1 rounded-[12px] border-2 border-slate-700 bg-white p-2 shadow-sm"
      aria-label={face ? String(face) : "-"}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className={`rounded-full ${
            face && PIPS[face]?.includes(i) ? "bg-slate-800" : "bg-transparent"
          }`}
        />
      ))}
    </div>
  );
}
