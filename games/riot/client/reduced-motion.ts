import { useEffect, useState } from "react";

/**
 * RT-52: Dukungan `prefers-reduced-motion`.
 *
 * Di Riot, motion yang perlu dikurangi adalah goyangan idle karakter
 * (bob) dan kilat visual. Kamera sudah kaku (tanpa shake), jadi helper
 * ini cukup mengontrol animasi idle crowd.
 */

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Murni: tentukan reduced motion dari hasil matchMedia apa adanya. */
export function resolveReducedMotion(
  matches: boolean | null | undefined,
): boolean {
  return matches === true;
}

/** Baca preferensi saat ini (aman di SSR / tanpa window). */
export function readPrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return resolveReducedMotion(
    window.matchMedia(REDUCED_MOTION_QUERY).matches,
  );
}

/** Hook React: nilai live yang mengikuti perubahan preferensi OS. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    readPrefersReducedMotion(),
  );

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const mq = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setReduced(resolveReducedMotion(event.matches));
    };
    setReduced(resolveReducedMotion(mq.matches));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
