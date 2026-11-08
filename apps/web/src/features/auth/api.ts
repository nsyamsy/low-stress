import {
  apiFetch,
  clearCsrfToken,
  fetchCsrfToken,
  getCsrfToken,
  parseResponse,
  type ApiError,
} from "../../lib/apiFetch";
import type { Me, PublicConfig } from "./types";

export {
  apiFetch,
  clearCsrfToken,
  fetchCsrfToken,
  getCsrfToken,
  parseResponse,
  type ApiError,
};

export async function fetchPublicConfig(): Promise<PublicConfig> {
  return apiFetch<PublicConfig>("/api/public-config");
}

export interface CaptchaChallengeResponse {
  challenge: string;
  difficulty: number;
  expiresAt: number;
  signature: string;
}

export async function fetchCaptchaChallenge(): Promise<CaptchaChallengeResponse> {
  return apiFetch<CaptchaChallengeResponse>("/api/auth/captcha-challenge");
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

export async function registerApi(payload: {
  username: string;
  displayName: string;
  email: string;
  password: string;
  captcha?: { challenge: string; nonce: string; signature?: string };
}): Promise<{ status: "pending" | "active" }> {
  return apiFetch<{ status: "pending" | "active" }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function loginApi(payload: {
  username: string;
  password: string;
}): Promise<{ user: Me }> {
  return apiFetch<{ user: Me }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function logoutApi(): Promise<void> {
  return apiFetch<void>("/api/auth/logout", {
    method: "POST",
  });
}

export async function getMeApi(): Promise<Me> {
  return apiFetch<Me>("/api/me");
}

export async function updateProfileApi(payload: {
  displayName?: string;
  locale?: "auto" | "id" | "en";
  theme?: "system" | "light" | "dark";
  email?: string;
}): Promise<Me> {
  return apiFetch<Me>("/api/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function changePasswordApi(payload: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  return apiFetch<void>("/api/me/password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteAccountApi(payload: {
  password: string;
}): Promise<void> {
  return apiFetch<void>("/api/me", {
    method: "DELETE",
    body: JSON.stringify(payload),
  });
}
