import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

export type ChipTone = "success" | "warning" | "danger" | "neutral";

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
  children: ReactNode;
}

/**
 * Chip status Design_System §7.4. Status tidak boleh ditandai warna saja;
 * selalu sertakan label teks.
 */
export function Chip({ tone = "neutral", className, children, ...rest }: ChipProps) {
  return (
    <span {...rest} className={cn("ls-chip", `ls-chip--${tone}`, className)}>
      {children}
    </span>
  );
}
