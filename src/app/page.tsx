"use client";

import { useCallback, useEffect, useState } from "react";
import { AccessError, onAccessError } from "@/auth/access";
import { AccountNotice } from "@/auth/account-notice";
import { LoginScreen } from "@/auth/login-screen";
import { restoreSession, signIn, signOut } from "@/auth/session";
import type { AuthUser } from "@/auth/types";
import { CalendarApp } from "@/calendar/calendar-app";
import { CalendarProvider } from "@/calendar/store";

type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: AuthUser }
  | { status: "banned"; message: string; reason: string | null };

export default function Home() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const stop = onAccessError((err) => {
      if (!cancelled && err.code === "account_banned") {
        setAuth({ status: "banned", message: err.message, reason: err.reason });
      }
    });
    restoreSession()
      .then((user) => {
        if (!cancelled) setAuth(user ? { status: "signed-in", user } : { status: "signed-out" });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof AccessError && err.code === "account_banned") {
          setAuth({ status: "banned", message: err.message, reason: err.reason });
          return;
        }
        setAuth({ status: "signed-out" });
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  const handleSignIn = useCallback(async () => {
    const user = await signIn();
    if (user) setAuth({ status: "signed-in", user });
  }, []);

  const handleSignOut = useCallback(() => {
    void signOut().finally(() => setAuth({ status: "signed-out" }));
  }, []);

  if (auth.status === "loading") {
    return (
      <main className="login-shell">
        <p className="calendar-empty">Loading…</p>
      </main>
    );
  }

  if (auth.status === "banned") {
    return <AccountNotice title="Account banned" message={auth.message} reason={auth.reason} actionLabel="Sign out" onAction={handleSignOut} />;
  }

  if (auth.status === "signed-out") {
    return <LoginScreen onSignIn={handleSignIn} />;
  }

  return (
    <CalendarProvider key={auth.user.id}>
      <CalendarApp user={auth.user} onSignOut={handleSignOut} />
    </CalendarProvider>
  );
}
