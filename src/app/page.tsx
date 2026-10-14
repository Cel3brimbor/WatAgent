"use client";

import { useCallback, useEffect, useState } from "react";
import { AccessError, onAccessError } from "@/auth/access";
import { onAuthExpired } from "@/auth/auth-expired";
import { AccountNotice } from "@/auth/account-notice";
import { LoginScreen } from "@/auth/login-screen";
import type { OnboardingAnswers } from "@/auth/onboarding";
import { OnboardingScreen } from "@/auth/onboarding-screen";
import { restoreSession, signIn, signOut } from "@/auth/session";
import { forgetUser, lockdownActive, readApiHealth, rememberUser, rememberedUser } from "@/shared/lockdown";
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
  const [sessionExpired, setSessionExpired] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingState>({ status: "loading" });
  const [localMode, setLocalMode] = useState(false);
  const [lockdownSignIn, setLockdownSignIn] = useState(false);
  const [hold, setHold] = useState<string | null>(null);
  const userId = auth.status === "signed-in" ? auth.user.id : null;

  useEffect(() => {
    if (auth.status === "signed-in" && !localMode) rememberUser(auth.user);
  }, [auth, localMode]);

  useEffect(() => {
    if (!userId) return;
    if (localMode) {
      setOnboarding({ status: "done", advancedView: null });
      return;
    }
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
  }, [localMode, userId]);

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
    const stopExpired = onAuthExpired(() => {
      if (!cancelled) setSessionExpired(true);
    });
    restoreSession()
      .then((user) => {
        if (cancelled) return;
        if (user) {
          rememberUser(user);
          setAuth({ status: "signed-in", user });
          return;
        }
        if (lockdownActive()) {
          const remembered = rememberedUser();
          if (remembered) {
            setLocalMode(true);
            setOnboarding({ status: "done", advancedView: null });
            setAuth({ status: "signed-in", user: remembered });
            return;
          }
          setLockdownSignIn(true);
        }
        setAuth({ status: "signed-out" });
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
      stopExpired();
    };
  }, []);

  useEffect(() => {
    if (!localMode && !lockdownSignIn) return;
    let stop = false;
    const look = async () => {
      const locked = await readApiHealth();
      if (stop || locked !== false) return;
      const user = await restoreSession();
      if (stop) return;
      setHold(null);
      setLockdownSignIn(false);
      setLocalMode(false);
      if (user) {
        rememberUser(user);
        setOnboarding({ status: "loading" });
        setAuth({ status: "signed-in", user });
      } else {
        setAuth({ status: "signed-out" });
      }
    };
    const timer = window.setInterval(() => void look(), 15_000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [localMode, lockdownSignIn]);

  const handleSignIn = useCallback(async () => {
    if (lockdownActive()) return;
    const user = await signIn();
    if (user) {
      setSessionExpired(false);
      setLockdownSignIn(false);
      setAuth({ status: "signed-in", user });
    }
  }, []);

  const handleSignOut = useCallback(() => {
    if (lockdownActive() || localMode) {
      setHold("Sign-out waits until the API is open. Your calendar stays on this device.");
      return;
    }
    forgetUser();
    void signOut().finally(() => setAuth({ status: "signed-out" }));
  }, [localMode]);

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
    return (
      <LoginScreen
        paused={
          lockdownSignIn
            ? "The API is in lockdown, so sign-in is paused. A browser that already used WatAgent here keeps its calendar on this device."
            : null
        }
        onSignIn={handleSignIn}
      />
    );
  }

  if (onboarding.status !== "done") {
    return <OnboardingScreen onDone={finishOnboarding} onSkip={() => finishOnboarding(null)} />;
  }

  return (
    <>
      {hold ? (
        <div className="session-expired-banner" role="status">
          <span>{hold}</span>
        </div>
      ) : null}
      {sessionExpired ? (
        <div className="session-expired-banner" role="status">
          <span>Session expired —</span>
          <button type="button" onClick={() => void handleSignIn()}>
            Sign in again
          </button>
        </div>
      ) : null}
      <CalendarProvider key={auth.user.id} userId={auth.user.id}>
        <CalendarApp
          user={auth.user}
          onSignOut={handleSignOut}
          advancedView={onboarding.advancedView !== false}
          onAdvancedViewChange={changeAdvancedView}
        />
      </CalendarProvider>
    </>
  );
}
