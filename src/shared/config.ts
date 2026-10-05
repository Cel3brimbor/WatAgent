function httpOrigin(raw: string | undefined, fallback: string): string {
  const value = raw?.trim() || fallback;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallback;
    return url.origin;
  } catch {
    return fallback;
  }
}

// Hosted web builds can proxy /api through their own origin for session cookies.
// Native and local builds keep the explicit backend URL.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL === "same-origin"
  ? ""
  : httpOrigin(process.env.NEXT_PUBLIC_API_BASE_URL, "http://localhost:4000");

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";

export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

export const APP_URL_SCHEME = "com.standalone.calendar";

export const NATIVE_AUTH_REDIRECT = `${APP_URL_SCHEME}://auth/callback`;
