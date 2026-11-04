import { useEffect } from "react";
import { cn } from "../lib/cn";

export type ToastTone = "neutral" | "success" | "warning" | "danger";

export interface ToastProps {
  open: boolean;
  message: string;
  tone?: ToastTone;
  onDismiss: () => void;
  /** Label aksesibel tombol tutup. */
  closeLabel: string;
  /** Durasi tampil; kesalahan bertahan sampai ditutup. */
  durationMs?: number;
}

/**
 * Toast Design_System §7.6: hilang otomatis 4 detik kecuali error.
 */
export function Toast({
  open,
  message,
  tone = "neutral",
  onDismiss,
  closeLabel,
  durationMs = 4000,
}: ToastProps) {
  useEffect(() => {
    if (!open || tone === "danger") return undefined;
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [open, tone, durationMs, onDismiss, message]);

  if (!open) return null;

  return (
    <div
      className={cn("ls-toast", `ls-toast--${tone}`)}
      role={tone === "danger" ? "alert" : "status"}
      aria-live={tone === "danger" ? "assertive" : "polite"}
    >
      <p className="ls-toast__message">{message}</p>
      <button
        type="button"
        className="ls-toast__close"
        onClick={onDismiss}
        aria-label={closeLabel}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
