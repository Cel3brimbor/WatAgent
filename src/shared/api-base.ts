import { accessErrorFrom, reportAccessError } from "@/auth/access";
import { getAccessToken } from "@/auth/session";
import { API_BASE_URL } from "@/shared/config";

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
  return fetch(`${API_BASE_URL}${path}`, { ...init, headers, credentials: "include" }).catch((err: unknown) => {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("Can't reach the WatAgent server. Check that it's running, then try again.", 0);
  });
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

export async function errorFromResponse(res: Response, fallback: string): Promise<Error> {
  const payload = (await res.json().catch(() => null)) as { error?: unknown } | null;
  const access = accessErrorFrom(payload, res.status);
  if (access) {
    reportAccessError(access);
    return access;
  }
  const message =
    payload && typeof payload.error === "string" && payload.error.length <= 300 ? payload.error : fallback;
  return new ApiError(message, res.status);
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await apiFetch(path, { ...init, headers });
  if (!res.ok) throw await errorFromResponse(res, "An unexpected error occurred");
  return (await res.json().catch(() => null)) as T;
}
