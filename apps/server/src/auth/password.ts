import { hash, verify } from "@node-rs/argon2";

// Algorithm.Argon2id memiliki nilai 2 pada @node-rs/argon2 (dan merupakan bawaan)
export const ARGON2ID_ALGORITHM = 2;

export const ARGON2_OPTIONS = {
  algorithm: ARGON2ID_ALGORITHM,
  memoryCost: 19456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

/**
 * Hash password menggunakan argon2id sesuai rekomendasi OWASP dan Architecture §7.
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/**
 * Verifikasi password terhadap hash argon2id.
 */
export async function verifyPassword(
  hashedPassword: string,
  plainPassword: string,
): Promise<boolean> {
  try {
    return await verify(hashedPassword, plainPassword, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}
