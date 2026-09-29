export type AuthUser = { id: string; email: string | null };

export type AuthDriver = {
  restore: () => Promise<AuthUser | null>;
  accessToken: (force?: boolean) => Promise<string | null>;
  signIn: () => Promise<AuthUser | null>;
  signOut: () => Promise<void>;
};

export function authUserOf(raw: unknown): AuthUser | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as { id?: unknown; email?: unknown };
  if (typeof rec.id !== "string" || !/^[0-9a-f-]{36}$/i.test(rec.id)) return null;
  return { id: rec.id, email: typeof rec.email === "string" ? rec.email.slice(0, 320) : null };
}
