"use client";

import { useCallback, useEffect, useState } from "react";
import { bannedLoginMessage, plainReason } from "@/auth/access";
import { AccountNotice } from "@/auth/account-notice";
import { LoginScreen } from "@/auth/login-screen";
import { signIn } from "@/auth/session";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [banned, setBanned] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "banned") {
      setBanned(bannedLoginMessage(params.get("appeal")));
      setReason(plainReason(params.get("reason")) || null);
    } else if (params.get("error") === "signin") setError("Sign-in failed. Please try again.");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const handleSignIn = useCallback(async () => {
    const user = await signIn();
    if (user) window.location.replace("/");
  }, []);

  if (banned) {
    return (
      <AccountNotice
        title="Account banned"
        message={banned}
        actionLabel="Use a different account"
        onAction={() => {
          setBanned(null);
          setReason(null);
        }}
        reason={reason}
      />
    );
  }

  return <LoginScreen error={error} onSignIn={handleSignIn} />;
}
