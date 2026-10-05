"use client";

import { useCallback, useEffect, useState } from "react";
import { AccessError, onAccessError } from "@/auth/access";
import { AccountNotice } from "@/auth/account-notice";
import { LoginScreen } from "@/auth/login-screen";
import type { OnboardingAnswers } from "@/auth/onboarding";
import { OnboardingScreen } from "@/auth/onboarding-screen";
import { restoreSession, signIn, signOut } from "@/auth/session";
import type { AuthUser } from "@/auth/types";
import { getCalendarSettings, patchCalendarSettings } from "@/calendar/approval-client";
import { CalendarApp } from "@/calendar/calendar-app";
import { CalendarProvider } from "@/calendar/store";

type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: AuthUser }
  | { status: "banned"; message: string; reason: string | null };

//advancedView null means the user never chose, which keeps every section visible
type OnboardingState = { status: "loading" } | { status: "needed" } | { status: "done"; advancedView: boolean | null };

export default function Home() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [onboarding, setOnboarding] = useState<OnboardingState>({ status: "loading" });
  const userId = auth.status === "signed-in" ? auth.user.id : null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setOnboarding({ status: "loading" });
    getCalendarSettings()
      .then((settings) => {
        if (cancelled) return;
        setOnboarding(
          settings.onboarded ? { status: "done", advancedView: settings.advancedView } : { status: "needed" },
        );
      })
      .catch(() => {
        //never block the app on a settings error
        if (!cancelled) setOnboarding({ status: "done", advancedView: null });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const finishOnboarding = useCallback(async (answers: OnboardingAnswers | null) => {
    await patchCalendarSettings({ onboarded: true, ...(answers ?? {}) });
    setOnboarding({ status: "done", advancedView: answers ? answers.advancedView : null });
  }, []);

  const changeAdvancedView = useCallback((advancedView: boolean) => {
    setOnboarding({ status: "done", advancedView });
    void patchCalendarSettings({ advancedView }).catch(() => undefined);
  }, []);

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

  if (auth.status === "loading" || (auth.status === "signed-in" && onboarding.status === "loading")) {
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

  if (onboarding.status !== "done") {
    return <OnboardingScreen onDone={finishOnboarding} onSkip={() => finishOnboarding(null)} />;
  }

  return (
    <CalendarProvider key={auth.user.id}>
      <CalendarApp
        user={auth.user}
        onSignOut={handleSignOut}
        advancedView={onboarding.advancedView !== false}
        onAdvancedViewChange={changeAdvancedView}
      />
    </CalendarProvider>
  );
}
