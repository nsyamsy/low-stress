import type { ComponentType } from "react";
import type { GameProps } from "./game-props";

/** Arah skor: makin besar makin baik, atau makin kecil makin baik. */
export type ScoreDirection = "higher" | "lower";

/** Aturan kewajaran skor yang dapat diisi per game lewat manifest. */
export interface PlausibilityRule {
  minScore?: number;
  maxScore?: number;
  /** Batas atas skor per detik bermain. */
  maxScorePerSecond?: number;
  minDurationMs?: number;
  maxDurationMs?: number;
}

export interface GameScoringConfig extends PlausibilityRule {
  direction: ScoreDirection;
  /**
   * Validasi tambahan milik game. Mengembalikan `false` bila run dianggap
   * tidak wajar. Server tetap dapat menandai run sebagai `flagged`.
   */
  validate?: (run: { score: number; durationMs: number }) => boolean;
  maxSubmitRatePerMin?: number;
}

export interface GameClientModule {
  default: ComponentType<GameProps>;
}

/** Konteks yang diberikan saat akun pemain dihapus. */
export interface GameUserDeletedContext {
  userId: string;
  /** Klien database yang hanya boleh menyentuh tabel berawalan id game. */
  db: unknown;
  logger?: unknown;
}

/** Definisi job berkala milik game. */
export interface GameJob {
  name: string;
  intervalMs: number;
  run: (ctx: GameServerContext) => Promise<void> | void;
  stop?: () => void;
}

/** Konteks lingkungan server yang diberikan saat modul server game diinisialisasi. */
export interface GameServerContext {
  db: unknown;
  io?: unknown;
  env?: unknown;
  logger?: unknown;
  options?: Record<string, unknown>;
  censorText?: (text: string) => string;
  checkGameGate?: (gameId: string) => Promise<unknown>;
  resolvePrincipal?: (cookieHeader?: string) => Promise<{
    kind: "user" | "admin" | "none";
    user?: { id: string; username: string; displayName: string; status: string };
    admin?: { id: string; username: string };
  }>;
  recordScore?: (params: {
    gameId: string;
    userId: string;
    score: number;
    durationMs?: number;
    flagged?: boolean;
    metadata?: Record<string, unknown>;
  }) => Promise<unknown>;
}

export interface GameServerModule {
  /** Daftarkan rute REST khusus game pada instance Fastify. */
  registerRoutes?: (app: unknown, ctx: GameServerContext) => void | Promise<void>;
  /** Daftarkan handler Socket.IO namespace per game. */
  registerRealtime?: (io: unknown, ctx: GameServerContext) => void | Promise<void>;
  /** Daftarkan background jobs berkala milik game. */
  registerJobs?: (ctx: GameServerContext) => GameJob[] | Promise<GameJob[]>;
  /** Bersihkan data milik pengguna yang menghapus akunnya. */
  onUserDeleted?: (context: GameUserDeletedContext) => void | Promise<void>;
  /** Hook moderasi admin opsional untuk mereset room ke lobi. */
  adminResetRoom?: (roomId: string) => void | Promise<void>;
  /** Hook moderasi admin opsional untuk mengeluarkan pemain dari room. */
  adminKickPlayer?: (roomId: string, userId: string) => void | Promise<void>;
  /** Hook moderasi admin opsional untuk menghapus room dari memori. */
  adminDeleteRoom?: (roomId: string) => void | Promise<void>;
  /** Cleanup saat server ditutup. */
  dispose?: () => void | Promise<void>;
}

/** Kontrak satu game. Satu-satunya titik masuk dari registry. */
export interface GameManifest {
  /** Slug unik; juga awalan tabel, rute, dan room realtime. */
  id: string;
  version: string;
  title: { id: string; en: string };
  description: { id: string; en: string };
  /** Path aset ikon di dalam folder game. */
  icon: string;
  mode: "solo" | "multiplayer";
  mobile: {
    supported: boolean;
    orientation?: "portrait" | "landscape" | "any";
  };
  scoring?: GameScoringConfig;
  /** Komponen klien dimuat lazy. */
  client: () => Promise<GameClientModule>;
  /** Modul server opsional, dimuat lazy saat boot. */
  server?: () => Promise<GameServerModule>;
  /** Path folder migrasi khusus game, relatif terhadap folder game. */
  migrations?: string;
  permissions?: Array<"scores" | "realtime" | "db">;
}

const GAME_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function isGameId(value: string): boolean {
  return GAME_ID_PATTERN.test(value);
}

/**
 * Validasi bentuk manifest saat registry memindai folder game.
 * Melempar `Error` dengan pesan yang menyebut field bermasalah.
 */
export function assertGameManifest(
  value: unknown,
  source = "manifest",
): asserts value is GameManifest {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${source}: manifest harus berupa objek`);
  }

  const candidate = value as Partial<GameManifest>;

  if (typeof candidate.id !== "string" || !isGameId(candidate.id)) {
    throw new Error(`${source}: id game tidak valid`);
  }
  if (typeof candidate.version !== "string" || candidate.version.length === 0) {
    throw new Error(`${source}: version wajib diisi`);
  }
  for (const field of ["title", "description"] as const) {
    const text = candidate[field];
    if (
      typeof text !== "object" ||
      text === null ||
      typeof text.id !== "string" ||
      typeof text.en !== "string"
    ) {
      throw new Error(`${source}: ${field} harus berisi teks id dan en`);
    }
  }
  if (typeof candidate.icon !== "string" || candidate.icon.length === 0) {
    throw new Error(`${source}: icon wajib diisi`);
  }
  if (candidate.mode !== "solo" && candidate.mode !== "multiplayer") {
    throw new Error(`${source}: mode harus "solo" atau "multiplayer"`);
  }
  if (
    typeof candidate.mobile !== "object" ||
    candidate.mobile === null ||
    typeof candidate.mobile.supported !== "boolean"
  ) {
    throw new Error(`${source}: mobile.supported wajib diisi`);
  }
  if (typeof candidate.client !== "function") {
    throw new Error(`${source}: client harus berupa fungsi lazy`);
  }
  if (candidate.scoring !== undefined) {
    if (
      candidate.scoring.direction !== "higher" &&
      candidate.scoring.direction !== "lower"
    ) {
      throw new Error(`${source}: scoring.direction tidak valid`);
    }
  }
}
