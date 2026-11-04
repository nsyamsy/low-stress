import { cn } from "../lib/cn";

export type LogoVariant = "full" | "horizontal" | "icon";

export interface LogoProps {
  variant?: LogoVariant;
  /** Tinggi dalam pixel; lebar mengikuti rasio asli. */
  height?: number;
  className?: string;
  /** Teks alternatif; kosongkan bila logo murni dekoratif. */
  title?: string;
}

/**
 * Logo Low Stress (Design_System §2). Burung selalu koral; wordmark mengikuti
 * `currentColor` sehingga otomatis krem di mode gelap.
 */
export function Logo({
  variant = "horizontal",
  height = 32,
  className,
  title = "Low Stress",
}: LogoProps) {
  const label = title ? { role: "img", "aria-label": title } : { "aria-hidden": true };
  const common = { className: cn("ls-logo", className), ...label };

  if (variant === "icon") {
    return (
      <svg viewBox="0 0 64 64" height={height} width={height} {...common}>
        <Bird />
      </svg>
    );
  }

  if (variant === "horizontal") {
    return (
      <svg viewBox="0 0 200 48" height={height} width={(height / 48) * 200} {...common}>
        <Bird transform="translate(0 8) scale(0.5)" />
        <text
          x="40"
          y="31"
          fill="currentColor"
          fontFamily="Nunito, ui-rounded, system-ui, sans-serif"
          fontSize="22"
          fontWeight="500"
          letterSpacing="-0.5"
        >
          low stress
        </text>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 200 168" height={height} width={(height / 168) * 200} {...common}>
      <Bird transform="translate(56 4) scale(1.375)" />
      <text
        x="100"
        y="114"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="Nunito, ui-rounded, system-ui, sans-serif"
        fontSize="28"
        fontWeight="500"
        letterSpacing="-0.6"
      >
        low stress
      </text>
      <path
        d="M44 136c12-8 24-8 36 0s24 8 36 0 24-8 36 0"
        fill="none"
        stroke="#7FA88B"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Bird({ transform }: { transform?: string }) {
  return (
    <g transform={transform}>
      <path
        d="M10 34c0-12 9-21 21-21 6 0 12 3 16 7 4-1 8 0 11 2-2 3-5 5-8 6 2 4 3 8 3 12 0 1 0 3-1 4H20c-6 0-10-4-10-10Z"
        fill="#F2735B"
      />
      <path d="M10 33c-4-3-8-3-10-1 2 5 6 8 11 8Z" fill="#F2735B" />
      <path d="M47 25l9 4-9 4Z" fill="#F2B84B" />
      <circle cx="39" cy="27" r="2.4" fill="#16211F" />
      <path
        d="M22 40c4 2 9 2 13 0"
        fill="none"
        stroke="#16211F"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.35"
      />
    </g>
  );
}
