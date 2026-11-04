import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Tampilkan indikator proses dan nonaktifkan tombol. */
  loading?: boolean;
  /** Label yang dibacakan saat loading; teks tombol diganti. */
  loadingLabel?: string;
  block?: boolean;
  children?: ReactNode;
}

/**
 * Tombol dasar Design_System §7.1. Satu tombol primary per tampilan.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      loading = false,
      loadingLabel,
      block = false,
      className,
      disabled,
      type = "button",
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        {...rest}
        ref={ref}
        type={type}
        className={cn(
          "ls-button",
          `ls-button--${variant}`,
          block && "ls-button--block",
          className,
        )}
        disabled={disabled ?? loading}
        aria-busy={loading || undefined}
      >
        {loading ? (
          <>
            <span className="ls-button__spinner" aria-hidden="true" />
            <span>{loadingLabel ?? children}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);
