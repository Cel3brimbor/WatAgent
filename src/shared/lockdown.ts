import { API_BASE_URL } from "@/shared/config";

const DEVICE_USER = "watagent.device.user.v1";
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RememberedUser = { id: string; email: string | null };

type Listener = (on: boolean) => void;

let on = false;
const listeners = new Set<Listener>();

export function lockdownActive(): boolean {
  return on;
}

export function noteLockdown(next: boolean): void {
  if (on === next) return;
  on = next;
  for (const listener of listeners) listener(next);
}

export function subscribeLockdown(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function storage(): Storage | null {
  try {
    if (typeof globalThis.localStorage?.getItem !== "function") return null;
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function rememberUser(user: RememberedUser): void {
  const box = storage();
  if (!box || !USER_ID.test(user.id)) return;
  const email = typeof user.email === "string" ? user.email.slice(0, 320) : null;
  try {
    box.setItem(DEVICE_USER, JSON.stringify({ id: user.id, email }));
  } catch {
    return;
  }
}

export function rememberedUser(): RememberedUser | null {
  const box = storage();
  if (!box) return null;
  try {
    const raw = box.getItem(DEVICE_USER);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: unknown; email?: unknown };
    if (typeof parsed.id !== "string" || !USER_ID.test(parsed.id)) return null;
    const email = typeof parsed.email === "string" ? parsed.email.slice(0, 320) : null;
    return { id: parsed.id, email };
  } catch {
    return null;
  }
}

export function forgetUser(): void {
  const box = storage();
  if (!box) return;
  try {
    box.removeItem(DEVICE_USER);
  } catch {
    return;
  }
}

//null means the process could not be reached. false means the api is open.
export async function readApiHealth(): Promise<boolean | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { ok?: unknown; lockdown?: unknown } | null;
    if (!body || body.ok !== true || typeof body.lockdown !== "boolean") return null;
    noteLockdown(body.lockdown);
    return body.lockdown;
  } catch {
    return null;
  }
}
