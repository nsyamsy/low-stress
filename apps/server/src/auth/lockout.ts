import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import type { Database } from "@low-stress/db";
import { loginAttempts } from "@low-stress/db";
import { AppError } from "../errors";

export const MAX_ATTEMPTS = 5;
export const WINDOW_MS = 10 * 60 * 1000; // 10 menit
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 menit
export const STALE_ATTEMPT_TTL_MS = 24 * 60 * 60 * 1000; // 24 jam

export function makeLockoutKey(username: string, ip = "127.0.0.1"): string {
  return `${username.toLowerCase().trim()}:${ip.trim()}`;
}

export async function checkLockout(
  db: Database,
  key: string,
  now: Date = new Date(),
): Promise<void> {
  const [attempt] = await db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.key, key))
    .limit(1);

  if (!attempt) return;

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
  now: Date = new Date(),
): Promise<void> {
  const [existing] = await db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.key, key))
    .limit(1);

  const nowMs = now.getTime();
  // Kunci yang sudah kedaluwarsa atau kegagalan terakhir di luar jendela 10 menit
  // dimulai dari nol; tanpa ini kegagalan yang tersebar berhari-hari tetap mengunci.
  const lockExpired = Boolean(
    existing?.lockedUntil && existing.lockedUntil.getTime() <= nowMs,
  );
  const windowExpired = Boolean(
    existing?.lastFailedAt &&
      nowMs - existing.lastFailedAt.getTime() > WINDOW_MS,
  );
  const previousCount =
    lockExpired || windowExpired ? 0 : (existing?.count ?? 0);
  const nextCount = previousCount + 1;
  const shouldLock = nextCount >= MAX_ATTEMPTS;
  const lockedUntil = shouldLock
    ? new Date(nowMs + LOCKOUT_DURATION_MS)
    : null;
  const lastFailedAt = new Date(nowMs);

  await db
    .insert(loginAttempts)
    .values({
      key,
      count: nextCount,
      lockedUntil,
      lastFailedAt,
    })
    .onConflictDoUpdate({
      target: loginAttempts.key,
      set: {
        count: nextCount,
        lockedUntil: shouldLock
          ? lockedUntil
          : lockExpired || windowExpired
            ? null
            : (existing?.lockedUntil ?? null),
        lastFailedAt,
      },
    });
}

export async function clearLockout(
  db: Database,
  key: string,
): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
}

export async function purgeStaleLoginAttempts(
  db: Database,
  now: Date = new Date(),
): Promise<number> {
  const staleCutoff = new Date(now.getTime() - STALE_ATTEMPT_TTL_MS);
  const deleted = await db
    .delete(loginAttempts)
    .where(
      or(
        and(
          isNotNull(loginAttempts.lockedUntil),
          lt(loginAttempts.lockedUntil, now),
        ),
        and(
          isNull(loginAttempts.lockedUntil),
          lt(loginAttempts.lastFailedAt, staleCutoff),
        ),
      ),
    )
    .returning({ key: loginAttempts.key });

  return deleted.length;
}
