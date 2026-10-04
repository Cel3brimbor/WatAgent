import { accessErrorFrom, reportAccessError } from "@/auth/access";
import { authUserOf, type AuthDriver, type AuthUser } from "@/auth/types";
import { API_BASE_URL } from "@/shared/config";

type MemorySession = { accessToken: string; expiresAt: number; user: AuthUser };

const REFRESH_MARGIN_MS = 60_000;

let session: MemorySession | null = null;
let inflight: Promise<MemorySession | null> | null = null;

async function refresh(): Promise<MemorySession | null> {
  const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "X-WF-CSRF": "1" },
  }).catch(() => null);
  if (res && res.status === 403) {
    const access = accessErrorFrom(await res.json().catch(() => null), 403);
    session = null;
    if (access) {
      reportAccessError(access);
      throw access;
    }
    return null;
  }
  if (!res || !res.ok) {
    session = null;
    return null;
  }
  const payload = (await res.json().catch(() => null)) as {
    accessToken?: unknown;
    expiresAt?: unknown;
    user?: unknown;
  } | null;
  const user = authUserOf(payload?.user);
  if (
    !payload ||
    typeof payload.accessToken !== "string" ||
    !payload.accessToken ||
    typeof payload.expiresAt !== "number" ||
    !user
  ) {
    session = null;
    return null;
  }
  session = { accessToken: payload.accessToken, expiresAt: payload.expiresAt, user };
  return session;
}

function refreshOnce(): Promise<MemorySession | null> {
  if (!inflight) {
    inflight = refresh().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export const webAuthDriver: AuthDriver = {
  async restore() {
    const next = await refreshOnce();
    return next?.user ?? null;
  },
  async accessToken(force = false) {
    if (!force && session && session.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
      return session.accessToken;
    }
    const next = await refreshOnce();
    return next?.accessToken ?? null;
  },
  async signIn() {
    window.location.assign(`${API_BASE_URL}/api/auth/login?provider=google`);
    return null;
  },
  async signOut() {
    session = null;
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { "X-WF-CSRF": "1" },
    }).catch(() => undefined);
  },
};
