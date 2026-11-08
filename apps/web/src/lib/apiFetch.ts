export interface ApiError {
  code: string;
  params?: Record<string, unknown>;
}

let cachedCsrfToken: string | null = null;

function readCsrfCookie(): string | null {
  if (typeof document === "undefined" || typeof document.cookie !== "string") {
    return null;
  }
  const entry = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("ls_csrf="));
  if (!entry) return null;
  const value = decodeURIComponent(entry.slice("ls_csrf=".length));
  return value || null;
}

export async function fetchCsrfToken(): Promise<string> {
  const res = await fetch("/api/csrf");
  if (!res.ok) throw new Error("CSRF_FETCH_FAILED");
  const data = (await res.json()) as { token: string };
  cachedCsrfToken = data.token;
  return data.token;
}

export function clearCsrfToken(): void {
  cachedCsrfToken = null;
  if (typeof document !== "undefined" && typeof document.cookie === "string") {
    try {
      document.cookie = "ls_csrf=; Max-Age=0; path=/";
    } catch {
      // Abaikan bila document.cookie hanya-baca di lingkungan tes
    }
  }
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

export async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let error: ApiError = { code: "INTERNAL" };
    try {
      const body = (await res.json()) as { error?: ApiError };
      if (body && body.error) {
        error = body.error;
      }
    } catch {
      // bukan JSON
    }
    const err = new Error(error.code) as Error & {
      apiError: ApiError;
      status: number;
    };
    err.apiError = error;
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  return res.json() as Promise<T>;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function mergeHeaders(
  base: HeadersInit | undefined,
  extra: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (base) {
    if (base instanceof Headers) {
      base.forEach((val, key) => {
        result[key] = val;
      });
    } else if (Array.isArray(base)) {
      for (const [key, val] of base) {
        result[key] = val;
      }
    } else {
      Object.assign(result, base);
    }
  }
  for (const [key, val] of Object.entries(extra)) {
    result[key] = val;
  }
  return result;
}

export async function apiFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const isMutating = MUTATING_METHODS.has(method);

  const buildInit = async (): Promise<RequestInit> => {
    if (!isMutating) {
      return init ?? { method: "GET" };
    }
    const csrf = await getCsrfToken();
    const extraHeaders: Record<string, string> = {
      "x-csrf-token": csrf,
    };
    if (init?.body !== undefined && init?.body !== null) {
      extraHeaders["Content-Type"] = "application/json";
    }
    return {
      ...init,
      method,
      headers: mergeHeaders(init?.headers, extraHeaders),
    };
  };

  const firstRes = await fetch(url, await buildInit());
  try {
    return await parseResponse<T>(firstRes);
  } catch (err: unknown) {
    const typedErr = err as { status?: number; apiError?: ApiError };
    if (
      isMutating &&
      typedErr.status === 403 &&
      typedErr.apiError?.code === "CSRF_INVALID"
    ) {
      clearCsrfToken();
      const freshCsrf = await fetchCsrfToken();
      const extraHeaders: Record<string, string> = {
        "x-csrf-token": freshCsrf,
      };
      if (init?.body !== undefined && init?.body !== null) {
        extraHeaders["Content-Type"] = "application/json";
      }
      const retryRes = await fetch(url, {
        ...init,
        method,
        headers: mergeHeaders(init?.headers, extraHeaders),
      });
      return parseResponse<T>(retryRes);
    }
    throw err;
  }
}
