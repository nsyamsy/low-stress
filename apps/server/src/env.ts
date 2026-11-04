import { z } from "zod";

const booleanish = z.enum(["auto", "true", "false"]);

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DEPLOY_MODE: z.enum(["lan", "public"]).default("lan"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL wajib diisi"),
  APP_ORIGIN: z.string().url().default("http://localhost:5173"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET minimal 32 karakter"),
  COOKIE_SECURE: booleanish.default("auto"),
  TZ_APP: z.string().min(1).default("Asia/Jakarta"),
  DEFAULT_LOCALE: z.enum(["auto", "id", "en"]).default("auto"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SMTP_FROM: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Konfigurasi lingkungan tidak valid:\n- ${issues.join("\n- ")}`);
    this.name = "EnvError";
  }
}

/** Validasi environment dan kembalikan nilai yang sudah bertipe. */
export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => {
        const path = issue.path.join(".") || "(akar)";
        return `${path}: ${issue.message}`;
      }),
    );
  }
  return result.data;
}

/** Email hanya aktif bila seluruh nilai SMTP inti tersedia. */
export function smtpConfigured(env: Env): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_FROM);
}
