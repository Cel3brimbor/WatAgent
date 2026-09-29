"use client";

import { useCallback, useEffect, useState } from "react";
import { LoginScreen } from "@/auth/login-screen";
import { signIn } from "@/auth/session";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "signin") setError("Sign-in failed. Please try again.");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const handleSignIn = useCallback(async () => {
    const user = await signIn();
    if (user) window.location.replace("/");
  }, []);

  return <LoginScreen error={error} onSignIn={handleSignIn} />;
}
