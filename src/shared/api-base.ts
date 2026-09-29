import { API_BASE_URL } from "@/shared/config";
import { getAccessToken } from "@/auth/session";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function send(path: string, init: RequestInit, token: string | null): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("X-WF-CSRF", "1");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  else headers.delete("Authorization");
  return fetch(`${API_BASE_URL}${path}`, { ...init, headers, credentials: "include" });
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!path.startsWith("/api/")) throw new Error("Invalid API path.");
  const token = await getAccessToken();
  const res = await send(path, init, token);
  if (res.status !== 401 || init.signal?.aborted) return res;
  const fresh = await getAccessToken(true);
  if (!fresh || fresh === token) return res;
  return send(path, init, fresh);
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await apiFetch(path, { ...init, headers });
  const payload = (await res.json().catch(() => null)) as T | { error?: unknown } | null;
  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "An unexpected error occurred";
    throw new ApiError(message, res.status);
  }
  return payload as T;
}
