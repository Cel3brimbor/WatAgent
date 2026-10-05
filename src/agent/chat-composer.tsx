"use client";

import { useRef, useState, type FormEvent } from "react";
import { AgentEffortButton } from "@/agent/agent-effort-button";
import type { AgentEffort } from "@/agent/agent-effort";
import { MentionField, type MentionFieldHandle } from "@/agent/mention-field";
import type { MentionCalendar } from "@/agent/calendar-mention";
import type { CalendarItemDoc } from "@/calendar/types";
import { ArrowUpIcon, StopIcon } from "@/shared/icons";

const MAX_CHARS = 20_000;

type Props = {
  busy: boolean;
  restricted?: boolean;
  error: string | null;
  effort: AgentEffort;
  calendars: MentionCalendar[];
  items: CalendarItemDoc[];
  openBadge: string | null;
  onOpenBadge: (id: string | null) => void;
  onEffort: (effort: AgentEffort) => void;
  onSend: (payload: { text: string; calendarIds?: string[] }) => void;
  onStop: () => void;
  onError: (message: string | null) => void;
  onEditCalendarItem?: (item: CalendarItemDoc) => void;
  /** Attach a calendar from outside the composer, such as the map's Ask Agent. A new nonce attaches again. */
  attachRequest?: { id: string; nonce: number } | null;
};

export function ChatComposer({
  busy,
  restricted = false,
  error,
  effort,
  calendars,
  items,
  openBadge,
  onOpenBadge,
  onEffort,
  onSend,
  onStop,
  onError,
  onEditCalendarItem,
  attachRequest,
}: Props) {
  const fieldRef = useRef<MentionFieldHandle>(null);
  const [ready, setReady] = useState(false);
  const [hasChip, setHasChip] = useState(false);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (restricted || busy) return;
    const payload = fieldRef.current?.read() ?? { text: "", calendarIds: [] as string[] };
    const value = payload.text.trim();
    if (!value && payload.calendarIds.length === 0) return;
    if (value.length > MAX_CHARS) {
      onError("That message is too long.");
      return;
    }
    onError(null);
    fieldRef.current?.clear();
    setReady(false);
    setHasChip(false);
    onOpenBadge(null);
    onSend({ text: value, calendarIds: payload.calendarIds });
    fieldRef.current?.focus();
  }

  return (
    <form className={`composer${restricted ? " is-restricted" : ""}`} onSubmit={submit}>
      {error ? (
        <p className="composer-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="composer-box">
        <MentionField
          ref={fieldRef}
          className="composer-input"
          calendars={calendars}
          items={items}
          disabled={restricted}
          placeholder={
            restricted
              ? "AI features are restricted"
              : hasChip
                ? "Ask about the attached calendar…"
                : "Ask about this day, or add an event…"
          }
          openCalendarId={openBadge?.startsWith("composer:") ? openBadge.slice("composer:".length) : null}
          onOpenCalendar={(id) => onOpenBadge(id ? `composer:${id}` : null)}
          onEditItem={onEditCalendarItem}
          onChange={(value) => {
            setReady(value.text.trim().length > 0 || value.calendarIds.length > 0);
            setHasChip(value.calendarIds.length > 0);
          }}
          enterSends
          onEnter={() => submit()}
          attachRequest={attachRequest}
        />
        <div className="composer-bar">
          <AgentEffortButton value={effort} onChange={onEffort} disabled={restricted} />
          {busy ? (
            <button type="button" className="composer-send is-stop" onClick={onStop} aria-label="Stop" disabled={restricted}>
              <StopIcon />
            </button>
          ) : (
            <button
              type="submit"
              className={`composer-send${ready && !restricted ? " is-ready" : ""}`}
              disabled={!ready || restricted}
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
