"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronRightIcon } from "@/shared/icons";
import { Disclosure } from "@/shared/disclosure";

function previewLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function thoughtLabel(seconds?: number): string {
  if (seconds == null) return "Thought";
  return seconds === 1 ? "Thought for 1 second" : `Thought for ${seconds} seconds`;
}

export function AgentReasoningBlock({
  text,
  live,
  seconds,
}: {
  text?: string;
  live: boolean;
  seconds?: number;
}) {
  const body = text?.trim() ?? "";
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLButtonElement>(null);
  const showPreview = live && !open && body.length > 0;
  const label = live ? "Thinking" : thoughtLabel(seconds);

  useEffect(() => {
    //follow the stream while the thought is open
    if (!open || !live) return;
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [body, open, live]);

  useEffect(() => {
    //keep the newest words in the one-line preview
    const el = previewRef.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    el.dataset.overflow = el.scrollWidth > el.clientWidth + 1 ? "true" : "false";
  }, [body, showPreview]);

  if (!body && !live) return null;

  return (
    <div className="agent-thinking-block agent-reasoning">
      <div className="agent-reasoning-head">
        <button
          type="button"
          className="agent-thinking-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            if (!body) return;
            setOpen((value) => !value);
          }}
        >
          <ChevronRightIcon className="agent-thinking-chevron" />
          <span className={live ? "agent-thinking-summary agent-activity-live" : "agent-thinking-summary"}>{label}</span>
        </button>
        {showPreview ? (
          <button
            ref={previewRef}
            type="button"
            className="agent-reasoning-preview"
            aria-expanded={false}
            aria-controls={panelId}
            aria-label="Expand thinking"
            onClick={() => setOpen(true)}
          >
            <span>{previewLine(body)}</span>
          </button>
        ) : null}
      </div>
      <Disclosure open={open} id={panelId}>
        {open ? (
          <div className="agent-reasoning-body" ref={bodyRef}>
            {body}
          </div>
        ) : null}
      </Disclosure>
    </div>
  );
}
