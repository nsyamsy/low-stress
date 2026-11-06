import { eq } from "drizzle-orm";
import type { Database } from "@low-stress/db";
import { loginAttempts } from "@low-stress/db";
import { AppError } from "../errors";

export const MAX_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 menit

export function makeLockoutKey(username: string, ip = "127.0.0.1"): string {
  return `${username.toLowerCase().trim()}:${ip.trim()}`;
}

export async function checkLockout(
  db: Database,
  key: string,
): Promise<void> {
  const [attempt] = await db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.key, key))
    .limit(1);

  if (!attempt) return;

  const now = new Date();
  if (attempt.lockedUntil && attempt.lockedUntil > now) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((attempt.lockedUntil.getTime() - now.getTime()) / 1000),
    );
    throw new AppError("AUTH_LOCKED", 429, { retryAfterSec });
  }
}

export async function recordFailedAttempt(
  db: Database,
  key: string,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.key, key))
    .limit(1);

  const now = new Date();
  // Kunci yang sudah kedaluwarsa dimulai dari nol; tanpa ini satu kegagalan
  // setelah kunci berakhir langsung mengunci lagi karena hitungan masih 5.
  const lockExpired = Boolean(existing?.lockedUntil && existing.lockedUntil <= now);
  const previousCount = lockExpired ? 0 : (existing?.count ?? 0);
  const nextCount = previousCount + 1;
  const shouldLock = nextCount >= MAX_ATTEMPTS;
  const lockedUntil = shouldLock
    ? new Date(now.getTime() + LOCKOUT_DURATION_MS)
    : null;

  await db
    .insert(loginAttempts)
    .values({
      key,
      count: nextCount,
      lockedUntil,
    })
    .onConflictDoUpdate({
      target: loginAttempts.key,
      set: {
        count: nextCount,
        lockedUntil: shouldLock ? lockedUntil : lockExpired ? null : (existing?.lockedUntil ?? null),
      },
    });
}

export async function clearLockout(
  db: Database,
  key: string,
): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
}
