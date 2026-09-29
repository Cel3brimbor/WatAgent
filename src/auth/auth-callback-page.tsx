"use client";

import { useEffect } from "react";

export default function AuthCallbackPage() {
  useEffect(() => {
    window.location.replace("/");
  }, []);

  return (
    <main className="login-shell">
      <p className="calendar-empty">Signing you in…</p>
    </main>
  );
}
