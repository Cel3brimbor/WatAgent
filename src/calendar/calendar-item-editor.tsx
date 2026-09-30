"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CalendarItemKind, CalendarItemMeta, TimelineItem } from "@/calendar/types";
import { hourGridMs, startOfLocalDay } from "@/calendar/date-utils";
import { SegmentedControl, type SegmentOption } from "@/shared/segmented-control";
import { Switch } from "@/shared/switch";
import { useDialog } from "@/shared/use-dialog";

export type GoogleDraftTarget = {
  calendarId: string;
  eventId: string;
  calendarName?: string;
  deletable: boolean;
};

export type CalendarDraft = {
  id?: string;
  title: string;
  kind: CalendarItemKind;
  startUTC: number;
  endUTC: number;
  allDay: boolean;
  completed?: boolean;
  google?: GoogleDraftTarget;
};

type Props = {
  draft: CalendarDraft;
  //false while the exit transition plays
  open?: boolean;
  onChange: (draft: CalendarDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toLocalInputValue(utc: number): string {
  const date = new Date(utc);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toDateInputValue(utc: number): string {
  const date = new Date(utc);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const KIND_OPTIONS: SegmentOption<CalendarItemKind>[] = [
  { value: "event", label: "Event" },
  { value: "task", label: "Task" },
];

export function CalendarItemEditor({ draft, open = true, onChange, onSave, onCancel, onDelete }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const allDayId = useId();
  useDialog(ref, { open, onEscape: onCancel });

  return (
    <div className="calendar-editor-overlay" data-state={open ? "open" : "closed"} inert={!open}>
      <div
        ref={ref}
        className="calendar-editor"
        role="dialog"
        aria-modal="true"
        aria-label={draft.id || draft.google ? "Edit item" : "New item"}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onSave();
          }
        }}
      >
        {draft.google ? (
          <p className="calendar-editor-source">
            Changes save to {draft.google.calendarName || "your Google calendar"} in Google Calendar.
          </p>
        ) : null}
        <input
          className="calendar-editor-title"
          value={draft.title}
          maxLength={200}
          aria-label="Title"
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              onSave();
            }
          }}
          placeholder={draft.kind === "task" ? "New task" : "New event"}
          autoFocus
        />
        <div className="calendar-editor-row">
          {draft.google ? null : (
            <SegmentedControl
              label="Item type"
              value={draft.kind}
              options={KIND_OPTIONS}
              onChange={(kind) =>
                onChange(
                  kind === "task"
                    ? { ...draft, kind, completed: Boolean(draft.completed) }
                    : { ...draft, kind, completed: undefined },
                )
              }
            />
          )}
          <div className="calendar-editor-toggle">
            <label htmlFor={allDayId}>All-day</label>
            <Switch id={allDayId} checked={draft.allDay} onChange={(allDay) => onChange({ ...draft, allDay })} />
          </div>
        </div>
        {draft.allDay ? (
          <label className="calendar-editor-field">
            Date
            <input
              type="date"
              className="calendar-editor-input"
              value={toDateInputValue(draft.startUTC)}
              onChange={(event) => {
                const [y, m, d] = event.target.value.split("-").map(Number);
                const start = new Date(y, m - 1, d).getTime();
                if (!Number.isFinite(start)) return;
                const days = Math.max(1, Math.round((draft.endUTC - draft.startUTC) / DAY_MS));
                onChange({ ...draft, startUTC: start, endUTC: new Date(y, m - 1, d + days).getTime() });
              }}
            />
          </label>
        ) : (
          <div className="calendar-editor-row">
            <label className="calendar-editor-field">
              Start
              <input
                type="datetime-local"
                className="calendar-editor-input"
                value={toLocalInputValue(draft.startUTC)}
                onChange={(event) => {
                  const startUTC = new Date(event.target.value).getTime();
                  if (!Number.isFinite(startUTC)) return;
                  const duration = Math.max(15 * 60 * 1000, draft.endUTC - draft.startUTC);
                  onChange({ ...draft, startUTC, endUTC: startUTC + duration });
                }}
              />
            </label>
            <label className="calendar-editor-field">
              End
              <input
                type="datetime-local"
                className="calendar-editor-input"
                value={toLocalInputValue(draft.endUTC)}
                onChange={(event) => {
                  const endUTC = new Date(event.target.value).getTime();
                  if (!Number.isFinite(endUTC)) return;
                  onChange({ ...draft, endUTC });
                }}
              />
            </label>
          </div>
        )}
        <div className="calendar-editor-actions">
          {onDelete ? (
            <button type="button" className="ghost-btn calendar-editor-danger" onClick={onDelete}>
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="calendar-editor-actions-right">
            <button type="button" className="ghost-btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="primary-btn" onClick={onSave}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function useNowMs(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function defaultTimedDraft(day: Date, hour: number, minute = 0, endHour?: number): CalendarDraft {
  const startUTC = hourGridMs(startOfLocalDay(day), hour, minute);
  const hours = endHour != null && endHour >= hour ? endHour - hour + 1 : 1;
  return {
    title: "",
    kind: "event",
    startUTC,
    endUTC: startUTC + hours * 60 * 60 * 1000,
    allDay: false,
  };
}

export function defaultAllDayDraft(day: Date): CalendarDraft {
  const start = startOfLocalDay(day);
  return {
    title: "",
    kind: "event",
    startUTC: start.getTime(),
    endUTC: start.getTime() + DAY_MS,
    allDay: true,
  };
}

export function draftFromGoogle(item: TimelineItem): CalendarDraft | null {
  const google = item.google;
  if (!google?.calendarId || !google.eventId || !google.editable) return null;
  return {
    title: item.title,
    kind: "event",
    startUTC: item.startUTC,
    endUTC: item.endUTC,
    allDay: item.allDay,
    google: {
      calendarId: google.calendarId,
      eventId: google.eventId,
      calendarName: google.calendarName,
      deletable: Boolean(google.deletable),
    },
  };
}

export function draftFromMeta(id: string, title: string, calendar: CalendarItemMeta): CalendarDraft {
  return {
    id,
    title,
    kind: calendar.kind,
    startUTC: calendar.startUTC,
    endUTC: calendar.endUTC,
    allDay: calendar.allDay,
    completed: calendar.completed,
  };
}
