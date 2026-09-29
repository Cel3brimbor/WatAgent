"use client";

import { useEffect, useState } from "react";

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M5 12.5 9.5 17 19 7" />
    </svg>
  );
}

function RegenerateIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4v5h-5" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" />
    </svg>
  );
}

function CopyButton({ content, disabled }: { content: string; disabled: boolean }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      className={`bubble-tool${copied ? " is-copied" : ""}`}
      aria-label={copied ? "Copied" : "Copy"}
      disabled={disabled}
      onClick={() => {
        void navigator.clipboard
          .writeText(content)
          .then(() => setCopied(true))
          .catch(() => setCopied(false));
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

export function ChatBubbleTools({
  role,
  content,
  busy,
  streaming,
  onRegenerate,
  onStartEdit,
}: {
  role: "user" | "assistant";
  content: string;
  busy: boolean;
  streaming: boolean;
  onRegenerate: () => void;
  onStartEdit: () => void;
}) {
  const hasContent = content.trim().length > 0;
  if (role === "assistant") {
    return (
      <div className="bubble-tools">
        <CopyButton content={content} disabled={!hasContent || busy} />
        <button
          type="button"
          className="bubble-tool"
          aria-label="Regenerate"
          disabled={!hasContent || busy}
          onClick={onRegenerate}
        >
          <RegenerateIcon />
        </button>
      </div>
    );
  }
  return (
    <div className="bubble-tools">
      <button
        type="button"
        className="bubble-tool"
        aria-label="Edit message"
        disabled={busy || streaming}
        onClick={onStartEdit}
      >
        <EditIcon />
      </button>
    </div>
  );
}

export function MessageModelHover({ model }: { model?: string }) {
  const label = model?.trim();
  if (!label) return null;
  return (
    <p className="bubble-model" title={label}>
      {label}
    </p>
  );
}
