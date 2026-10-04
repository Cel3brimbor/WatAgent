"use client";

type Props = {
  title: string;
  message: string;
  reason?: string | null;
  actionLabel?: string;
  onAction?: () => void;
};

export function AccountNotice({ title, message, reason, actionLabel, onAction }: Props) {
  return (
    <main className="login-shell login-shell--center">
      <section className="login-card">
        <h1>{title}</h1>
        <p className="login-error" role="alert">
          {message}
        </p>
        {reason ? <p className="login-error">Ban reason: {reason}</p> : null}
        {onAction ? (
          <button type="button" className="primary-btn login-btn" onClick={onAction}>
            {actionLabel ?? "Continue"}
          </button>
        ) : null}
      </section>
    </main>
  );
}
