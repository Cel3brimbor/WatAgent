"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { AgentEffortButton } from "@/agent/agent-effort-button";
import type { AgentEffort } from "@/agent/agent-effort";
import { CalendarBadge } from "@/agent/calendar-badge";
import {
  matchCalendars,
  mentionAtCaret,
  stripMention,
  type MentionCalendar,
} from "@/agent/calendar-mention";
import { HEX_COLOR } from "@/calendar/preferences";
import type { CalendarItemDoc } from "@/calendar/types";
import { ArrowUpIcon, StopIcon } from "@/shared/icons";

const MAX_CHARS = 20_000;
const MAX_ATTACHED = 8;

type MentionState = { start: number; query: string; index: number };

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
  const [text, setText] = useState("");
  const [attached, setAttached] = useState<MentionCalendar[]>([]);
  const [mention, setMention] = useState<MentionState | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const handledAttach = useRef<number | null>(null);

  useEffect(() => {
    if (!attachRequest || handledAttach.current === attachRequest.nonce) return;
    handledAttach.current = attachRequest.nonce;
    const calendar = calendars.find((row) => row.id === attachRequest.id);
    if (!calendar) return;
    setAttached((list) =>
      list.some((row) => row.id === calendar.id) || list.length >= MAX_ATTACHED ? list : [...list, calendar],
    );
    inputRef.current?.focus();
  }, [attachRequest, calendars]);
  const capped = attached.length >= MAX_ATTACHED;
  const matches =
    mention && !capped ? matchCalendars(calendars, mention.query, attached.map((calendar) => calendar.id)) : [];
  const active = matches.length ? Math.min(mention?.index ?? 0, matches.length - 1) : 0;
  const ready = text.trim().length > 0 || attached.length > 0;

  function syncMention(value: string, caret: number) {
    const found = mentionAtCaret(value, caret);
    setMention((current) => {
      if (!found) return null;
      if (current && current.start === found.start && current.query === found.query) return current;
      return { ...found, index: 0 };
    });
  }

  function accept(calendar: MentionCalendar) {
    if (!mention || attached.some((row) => row.id === calendar.id) || attached.length >= MAX_ATTACHED) return;
    const next = stripMention(text, mention.start, mention.query);
    const caret = mention.start;
    setAttached((list) => [...list, calendar]);
    setText(next);
    setMention(null);
    requestAnimationFrame(() => {
      const field = inputRef.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(caret, caret);
    });
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (restricted || busy) return;
    let value = text;
    let nextAttached = attached;
    const field = inputRef.current;
    const caret = field?.selectionStart ?? value.length;
    const live = mention ? mentionAtCaret(value, caret) : null;
    if (mention && live) {
      const picks = matchCalendars(calendars, live.query, attached.map((calendar) => calendar.id));
      const pick = picks[Math.min(mention?.index ?? 0, Math.max(0, picks.length - 1))];
      if (pick && nextAttached.length < MAX_ATTACHED) {
        value = stripMention(value, live.start, live.query);
        nextAttached = [...nextAttached, pick];
      }
    }
    value = value.trim();
    if (!value && nextAttached.length === 0) return;
    if (value.length > MAX_CHARS) {
      onError("That message is too long.");
      return;
    }
    onError(null);
    setText("");
    setAttached([]);
    setMention(null);
    onOpenBadge(null);
    onSend({ text: value, calendarIds: nextAttached.map((calendar) => calendar.id) });
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && matches.length > 0 && !event.nativeEvent.isComposing) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMention((current) => (current ? { ...current, index: (active + 1) % matches.length } : current));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMention((current) =>
          current ? { ...current, index: (active - 1 + matches.length) % matches.length } : current,
        );
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        event.preventDefault();
        //the top match stays highlighted until arrow keys move it
        accept(matches[active]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMention(null);
        return;
      }
    }
    if (event.key === "Backspace" && !mention && attached.length > 0) {
      const field = event.currentTarget;
      if (field.selectionStart === 0 && field.selectionEnd === 0) {
        event.preventDefault();
        setAttached((list) => list.slice(0, -1));
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form className={`composer${restricted ? " is-restricted" : ""}`} onSubmit={submit}>
      {error ? (
        <p className="composer-error" role="alert">
          {error}
        </p>
      ) : null}
      {mention ? (
        <div className="mention-menu" id="calendar-mention-list" role="listbox" aria-label="WatAgent calendars">
          {capped ? (
            <p className="mention-empty">You can attach up to 8 calendars</p>
          ) : matches.length === 0 ? (
            <p className="mention-empty">No matching calendars</p>
          ) : (
            matches.map((calendar, index) => (
              <button
                key={calendar.id}
                type="button"
                id={`mention-opt-${calendar.id}`}
                role="option"
                aria-selected={index === active}
                className={`mention-option${index === active ? " is-active" : ""}${calendar.readOnly ? " is-read-only" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setMention((current) => (current ? { ...current, index } : current))}
                onClick={() => accept(calendar)}
              >
                <span
                  className="cal-badge-dot"
                  style={HEX_COLOR.test(calendar.color) ? ({ "--cal": calendar.color } as CSSProperties) : undefined}
                  aria-hidden="true"
                />
                <span>
                  {calendar.readOnly ? (
                    <>
                      {calendar.name} <span className="mention-read-only">(read only)</span>
                    </>
                  ) : (
                    highlightName(calendar.name, mention.query)
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
      <div className="composer-box">
        {attached.length > 0 ? (
          <div className="composer-badges">
            {attached.map((calendar) => (
              <CalendarBadge
                key={calendar.id}
                calendar={calendar}
                items={items}
                open={openBadge === `composer:${calendar.id}`}
                onOpenChange={(next) => onOpenBadge(next ? `composer:${calendar.id}` : null)}
                onEditItem={onEditCalendarItem}
                onRemove={() => {
                  setAttached((list) => list.filter((row) => row.id !== calendar.id));
                  onOpenBadge(null);
                }}
              />
            ))}
          </div>
        ) : null}
        <textarea
          ref={inputRef}
          className="composer-input"
          value={text}
          rows={2}
          maxLength={MAX_CHARS}
          disabled={restricted}
          placeholder={
            restricted
              ? "AI features are restricted"
              : attached.length
                ? "Ask about the attached calendar…"
                : "Ask about this day, or add an event…"
          }
          aria-label="Message"
          aria-disabled={restricted || undefined}
          aria-autocomplete="list"
          aria-expanded={mention != null}
          aria-controls={mention ? "calendar-mention-list" : undefined}
          aria-activedescendant={mention && matches[active] ? `mention-opt-${matches[active].id}` : undefined}
          onChange={(event) => {
            setText(event.target.value);
            syncMention(event.target.value, event.target.selectionStart ?? event.target.value.length);
          }}
          onClick={(event) => syncMention(event.currentTarget.value, event.currentTarget.selectionStart ?? 0)}
          onKeyUp={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === "Tab") return;
            syncMention(event.currentTarget.value, event.currentTarget.selectionStart ?? 0);
          }}
          onKeyDown={onKeyDown}
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

function highlightName(name: string, query: string) {
  const needle = query.trim();
  if (!needle) return name;
  const index = name.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return name;
  return (
    <>
      {name.slice(0, index)}
      <mark>{name.slice(index, index + needle.length)}</mark>
      {name.slice(index + needle.length)}
    </>
  );
}
