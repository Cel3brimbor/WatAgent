import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import {
  APP_URL_SCHEME,
  NATIVE_AUTH_REDIRECT,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from "@/shared/config";
import { startNativeOAuth } from "@/auth/native-oauth";
import { clearNativeSession, loadRefreshToken, storeRefreshToken } from "@/security/secure-store";
import { authUserOf, type AuthDriver, type AuthUser } from "@/auth/types";

let client: SupabaseClient | null = null;
let lastStoredToken: string | null = null;

function persistToken(sessionValue: Session | null) {
  const token = sessionValue?.refresh_token ?? null;
  if (token === lastStoredToken) return;
  lastStoredToken = token;
  if (token) void storeRefreshToken(token).catch(() => undefined);
  else void clearNativeSession().catch(() => undefined);
}

function supabase(): SupabaseClient {
  if (client) return client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Sign-in is not configured.");
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      flowType: "pkce",
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  client.auth.onAuthStateChange((_event, next) => persistToken(next));
  return client;
}

function userOf(sessionValue: Session | null): AuthUser | null {
  return authUserOf(sessionValue?.user);
}

export const nativeAuthDriver: AuthDriver = {
  async restore() {
    const auth = supabase().auth;
    const current = (await auth.getSession()).data.session;
    if (current) return userOf(current);
    const stored = await loadRefreshToken().catch(() => null);
    if (!stored) return null;
    lastStoredToken = stored;
    const { data, error } = await auth.refreshSession({ refresh_token: stored });
    if (error || !data.session) {
      lastStoredToken = null;
      await clearNativeSession().catch(() => undefined);
      return null;
    }
    return userOf(data.session);
  },
  async accessToken(force = false) {
    const auth = supabase().auth;
    if (force) {
      const { data } = await auth.refreshSession();
      return data.session?.access_token ?? null;
    }
    return (await auth.getSession()).data.session?.access_token ?? null;
  },
  async signIn() {
    const auth = supabase().auth;
    const { data, error } = await auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: NATIVE_AUTH_REDIRECT, skipBrowserRedirect: true },
    });
    if (error || !data?.url) throw new Error("Unable to start sign-in.");
    const code = await startNativeOAuth(data.url, APP_URL_SCHEME);
    const exchanged = await auth.exchangeCodeForSession(code);
    if (exchanged.error || !exchanged.data.session) throw new Error("Unable to complete sign-in.");
    return userOf(exchanged.data.session);
  },
  async signOut() {
    await supabase()
      .auth.signOut({ scope: "local" })
      .catch(() => undefined);
    lastStoredToken = null;
    await clearNativeSession().catch(() => undefined);
  },
};
