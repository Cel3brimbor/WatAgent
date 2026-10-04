export const ACCESS_CODES = ["account_banned", "ai_restricted"] as const;

export type AccessCode = (typeof ACCESS_CODES)[number];

const FALLBACK: Record<AccessCode, string> = {
  account_banned: "Your account has been banned. If you believe this was a mistake, please appeal.",
  ai_restricted: "Your account is restricted from AI features. If you believe this was a mistake, please appeal.",
};

export class AccessError extends Error {
  readonly status = 403;

  constructor(
    readonly code: AccessCode,
    message: string,
    readonly reason: string | null = null,
  ) {
    super(message);
    this.name = "AccessError";
  }
}

//only these codes may surface a server-written sentence. anything else stays generic.
export function accessErrorFrom(payload: unknown, status: number): AccessError | null {
  if (status !== 403 || !payload || typeof payload !== "object") return null;
  const rec = payload as { code?: unknown; error?: unknown; reason?: unknown };
  if (rec.code !== "account_banned" && rec.code !== "ai_restricted") return null;
  const supplied = typeof rec.error === "string" ? rec.error.replace(/\s+/g, " ").trim().slice(0, 700) : "";
  const reason = plainReason(typeof rec.reason === "string" ? rec.reason : null);
  return new AccessError(rec.code, supplied || FALLBACK[rec.code], reason || null);
}

type Listener = (err: AccessError) => void;
let listener: Listener | null = null;

export function onAccessError(fn: Listener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

export function reportAccessError(err: AccessError): void {
  listener?.(err);
}

const APPEAL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function bannedLoginMessage(appeal: string | null): string {
  if (appeal && appeal.length <= 120 && APPEAL_RE.test(appeal)) {
    return `Your account has been banned. If you believe this was a mistake, please appeal at ${appeal}.`;
  }
  return FALLBACK.account_banned;
}

export function plainReason(reason: string | null): string {
  if (!reason) return "";
  const text = reason.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export function nativeBannedError(): AccessError {
  return new AccessError("account_banned", FALLBACK.account_banned);
}

export function isNativeBan(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if ((error.code ?? "").toLowerCase().replace(/-/g, "_") === "user_banned") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("user_banned") || /user[\s_-]+(?:is[\s_-]+)?banned/.test(message);
}
