"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AgentEffortButton } from "@/agent/agent-effort-button";
import type { AgentEffort } from "@/agent/agent-effort";
import { ArrowUpIcon, StopIcon } from "@/shared/icons";

const MAX_CHARS = 20_000;

type Props = {
  busy: boolean;
  error: string | null;
  effort: AgentEffort;
  onEffort: (effort: AgentEffort) => void;
  onSend: (payload: { text: string }) => void;
  onStop: () => void;
  onError: (message: string | null) => void;
};

export function ChatComposer({ busy, error, effort, onEffort, onSend, onStop, onError }: Props) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ready = text.trim().length > 0;

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    if (value.length > MAX_CHARS) {
      onError("That message is too long.");
      return;
    }
    onError(null);
    setText("");
    onSend({ text: value });
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      {error ? (
        <p className="composer-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="composer-box">
        <textarea
          ref={inputRef}
          className="composer-input"
          value={text}
          rows={2}
          maxLength={MAX_CHARS}
          placeholder="Ask about this day, or add an event…"
          aria-label="Message"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="composer-bar">
          <AgentEffortButton value={effort} onChange={onEffort} />
          {busy ? (
            <button type="button" className="composer-send is-stop" onClick={onStop} aria-label="Stop">
              <StopIcon />
            </button>
          ) : (
            <button
              type="submit"
              className={`composer-send${ready ? " is-ready" : ""}`}
              disabled={!ready}
              aria-label="Send"
            >
              <ArrowUpIcon />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
