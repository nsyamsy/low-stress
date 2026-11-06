import type { Me, PublicConfig } from "./types";

let cachedCsrfToken: string | null = null;

export async function fetchCsrfToken(): Promise<string> {
  const res = await fetch("/api/csrf");
  if (!res.ok) throw new Error("Gagal mengambil token CSRF.");
  const data = (await res.json()) as { token: string };
  cachedCsrfToken = data.token;
  return data.token;
}

/**
 * Cookie `ls_csrf` dibagi oleh semua tab. Token yang disimpan di memori bisa
 * basi bila tab lain mengambil token baru, jadi nilai cookie saat ini
 * didahulukan; permintaan ke server hanya bila cookie belum ada.
 */
function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const entry = document.cookie.split("; ").find((c) => c.startsWith("ls_csrf="));
  if (!entry) return null;
  const value = decodeURIComponent(entry.slice("ls_csrf=".length));
  return value || null;
}

export async function getCsrfToken(): Promise<string> {
  const fromCookie = readCsrfCookie();
  if (fromCookie) {
    cachedCsrfToken = fromCookie;
    return fromCookie;
  }
  if (cachedCsrfToken) return cachedCsrfToken;
  return fetchCsrfToken();
}

export async function fetchPublicConfig(): Promise<PublicConfig> {
  const res = await fetch("/api/public-config");
  if (!res.ok) throw new Error("Gagal mengambil konfigurasi publik.");
  return res.json() as Promise<PublicConfig>;
}

export interface CaptchaChallengeResponse {
  challenge: string;
  difficulty: number;
  expiresAt: number;
  signature: string;
}

export async function fetchCaptchaChallenge(): Promise<CaptchaChallengeResponse> {
  const res = await fetch("/api/auth/captcha-challenge");
  if (!res.ok) throw new Error("Gagal mengambil tantangan CAPTCHA.");
  return res.json() as Promise<CaptchaChallengeResponse>;
}

async function sha256Hex(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function solveCaptcha(
  challenge: string,
  difficulty: number,
): Promise<string> {
  const targetPrefix = "0".repeat(difficulty);
  let nonce = 0;
  while (true) {
    const candidate = String(nonce);
    const hash = await sha256Hex(`${challenge}:${candidate}`);
    if (hash.startsWith(targetPrefix)) {
      return candidate;
    }
    nonce += 1;
  }
}

export interface ApiError {
  code: string;
  params?: Record<string, unknown>;
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let error: ApiError = { code: "INTERNAL" };
    try {
      const body = (await res.json()) as { error?: ApiError };
      if (body.error) {
        error = body.error;
      }
    } catch {
      // bukan JSON
    }
    const err = new Error(error.code);
    (err as Error & { apiError: ApiError; status: number }).apiError = error;
    (err as Error & { apiError: ApiError; status: number }).status = res.status;
    throw err;
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  return res.json() as Promise<T>;
}

export async function registerApi(payload: {
  username: string;
  displayName: string;
  email: string;
  password: string;
  captcha?: { challenge: string; nonce: string; signature?: string };
}): Promise<{ status: "pending" | "active" }> {
  const csrf = await getCsrfToken();
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrf,
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<{ status: "pending" | "active" }>(res);
}

export async function loginApi(payload: {
  username: string;
  password: string;
}): Promise<{ user: Me }> {
  const csrf = await getCsrfToken();
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrf,
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<{ user: Me }>(res);
}

export async function logoutApi(): Promise<void> {
  const csrf = await getCsrfToken();
  const res = await fetch("/api/auth/logout", {
    method: "POST",
    headers: {
      "x-csrf-token": csrf,
    },
  });
  return parseResponse<void>(res);
}

export async function getMeApi(): Promise<Me> {
  const res = await fetch("/api/me");
  return parseResponse<Me>(res);
}

export async function updateProfileApi(payload: {
  displayName?: string;
  locale?: "auto" | "id" | "en";
  theme?: "system" | "light" | "dark";
  email?: string;
}): Promise<Me> {
  const csrf = await getCsrfToken();
  const res = await fetch("/api/me", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrf,
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<Me>(res);
}

export async function changePasswordApi(payload: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const csrf = await getCsrfToken();
  const res = await fetch("/api/me/password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrf,
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<void>(res);
}

export async function deleteAccountApi(payload: {
  password: string;
}): Promise<void> {
  const csrf = await getCsrfToken();
  const res = await fetch("/api/me", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrf,
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<void>(res);
}
