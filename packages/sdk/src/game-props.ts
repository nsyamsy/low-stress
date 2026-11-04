/** Bahasa yang didukung aplikasi. */
export type Locale = "id" | "en";

/** Tema tampilan yang dipakai shell saat memuat game. */
export type Theme = "light" | "dark";

/** Ringkasan pengguna yang aman dibagikan ke klien game. */
export interface GameUser {
  id: string;
  username: string;
  displayName: string;
  locale: Locale;
}

/** Data mentah yang dikirim klien game ke server untuk dicatat. */
export interface GameRunSubmission {
  score: number;
  durationMs: number;
  meta?: Record<string, unknown>;
}

/** Props yang diterima komponen klien setiap game. */
export interface GameProps {
  gameId: string;
  user: GameUser;
  locale: Locale;
  theme: Theme;
  isMobile: boolean;
  /** Kirim hasil satu putaran. Server tetap memvalidasi kewajarannya. */
  onScore: (run: GameRunSubmission) => void | Promise<void>;
  /** Keluar dari game dan kembali ke beranda. */
  onExit: () => void;
}
