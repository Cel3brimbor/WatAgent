"use client";

import { useState } from "react";
import { AccessError } from "@/auth/access";

type Props = {
  error?: string | null;
  onSignIn: () => Promise<void>;
};

export function LoginScreen({ error, onSignIn }: Props) {
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const message = failure ?? error ?? null;

  return (
    <main className="login-shell">
      <section className="login-intro" aria-hidden="true">
        <p className="login-mark">WatAgent</p>
        <p className="login-headline">
          Your days, <em>thoughtfully</em> planned.
        </p>
        <span className="login-rule" />
      </section>
      <section className="login-card">
        <h1>Welcome</h1>
        <p className="login-subtitle">Your calendar, with an assistant that can plan it for you.</p>
        {message ? (
          <p className="login-error" role="alert">
            {message}
          </p>
        ) : null}
        <button
          type="button"
          className="primary-btn login-btn"
          disabled={working}
          onClick={async () => {
            setWorking(true);
            setFailure(null);
            try {
              await onSignIn();
            } catch (err) {
              if (err instanceof AccessError) return;
              setFailure("Sign-in failed. Please try again.");
            } finally {
              setWorking(false);
            }
          }}
        >
          {working ? "Signing in…" : "Continue with Google"}
        </button>
      </section>
    </main>
  );
}
