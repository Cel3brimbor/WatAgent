"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarApp } from "@/calendar/calendar-app";
import { CalendarProvider } from "@/calendar/store";
import { LoginScreen } from "@/auth/login-screen";
import { restoreSession, signIn, signOut } from "@/auth/session";
import type { AuthUser } from "@/auth/types";

type AuthState = { status: "loading" } | { status: "signed-out" } | { status: "signed-in"; user: AuthUser };

export default function Home() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    restoreSession()
      .then((user) => {
        if (!cancelled) setAuth(user ? { status: "signed-in", user } : { status: "signed-out" });
      })
      .catch(() => {
        if (!cancelled) setAuth({ status: "signed-out" });
      });
    return () => {
      cancelled = true;
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

  if (auth.status === "signed-out") {
    return <LoginScreen onSignIn={handleSignIn} />;
  }

  return (
    <CalendarProvider key={auth.user.id}>
      <CalendarApp user={auth.user} onSignOut={handleSignOut} />
    </CalendarProvider>
  );
}
