import { createHmac, createHash, randomBytes } from "node:crypto";

export interface CaptchaChallenge {
  challenge: string;
  difficulty: number;
  expiresAt: number;
  signature: string;
}

export interface CaptchaSolution {
  challenge: string;
  nonce: string;
  signature?: string;
}

const DEFAULT_DIFFICULTY = 3; // 3 hex zeros ('000') takes ~10-50ms in browser/node
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function generateCaptchaChallenge(
  secret: string,
  difficulty = DEFAULT_DIFFICULTY,
): CaptchaChallenge {
  const salt = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const challenge = `${salt}:${expiresAt}:${difficulty}`;
  const signature = createHmac("sha256", secret).update(challenge).digest("hex");

  return {
    challenge,
    difficulty,
    expiresAt,
    signature,
  };
}

export function verifyCaptchaSolution(
  solution: CaptchaSolution,
  secret: string,
): boolean {
  const { challenge, nonce, signature } = solution;
  if (!challenge || !nonce) return false;

  const parts = challenge.split(":");
  if (parts.length !== 3) return false;

  const [, expiresAtStr, difficultyStr] = parts;
  const expiresAt = Number(expiresAtStr);
  const difficulty = Number(difficultyStr);

  if (!Number.isFinite(expiresAt) || !Number.isFinite(difficulty)) return false;
  if (Date.now() > expiresAt) return false;

  // Verify HMAC signature if provided
  if (signature) {
    const expectedSig = createHmac("sha256", secret).update(challenge).digest("hex");
    if (signature !== expectedSig) return false;
  }

  // Verify proof-of-work
  const targetPrefix = "0".repeat(difficulty);
  const hash = createHash("sha256")
    .update(`${challenge}:${nonce}`)
    .digest("hex");

  return hash.startsWith(targetPrefix);
}

/** Helper untuk menyelesaikan challenge PoW di sisi klien / tes. */
export function solveCaptchaChallenge(challenge: string, difficulty: number): string {
  const target = "0".repeat(difficulty);
  let nonce = 0;
  while (true) {
    const candidate = String(nonce);
    const hash = createHash("sha256")
      .update(`${challenge}:${candidate}`)
      .digest("hex");
    if (hash.startsWith(target)) {
      return candidate;
    }
    nonce += 1;
  }
}
