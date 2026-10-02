"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CalendarItemKind, CalendarItemMeta, TimelineItem } from "@/calendar/types";
import { hourGridMs, startOfLocalDay } from "@/calendar/date-utils";
import { SegmentedControl, type SegmentOption } from "@/shared/segmented-control";
import { Switch } from "@/shared/switch";
import { useDialog } from "@/shared/use-dialog";
import { LocationField } from "@/calendar/location-field";
import type { LocalCalendar } from "@/calendar/local-calendars";

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
  location?: string;
  description?: string;
  /** WatAgent calendar for events: "events" or a user-made cal-<uuid>; unset means the default. */
  calendarId?: string;
  /** Imported (LEARN/Portal/.ics) items stay in their feed, so no calendar picker. */
  imported?: boolean;
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
  /** Event calendars the picker offers. */
  calendars?: LocalCalendar[];
  defaultCalendarId?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateInputValue(utc: number): string {
  const date = new Date(utc);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeInputValue(utc: number): string {
  const date = new Date(utc);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

//moves utc onto the picked day, keeping its time of day
function withDate(utc: number, value: string): number | null {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(utc);
  date.setFullYear(y, m - 1, d);
  return date.getTime();
}

//moves utc to the picked time of day, keeping its date
function withTime(utc: number, value: string): number | null {
  const [h, min] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  const date = new Date(utc);
  date.setHours(h, min, 0, 0);
  return date.getTime();
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts = [days ? `${days} day${days === 1 ? "" : "s"}` : "", hours ? `${hours} hr` : "", mins ? `${mins} min` : ""];
  return parts.filter(Boolean).slice(0, 2).join(" ");
}

const MIN_DURATION_MS = 15 * 60 * 1000;

const CHIP_DATE = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const CHIP_DATE_YEAR = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const CHIP_TIME = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function chipText(type: "date" | "time", utc: number): string {
  if (type === "time") return CHIP_TIME.format(utc);
  return (new Date(utc).getFullYear() === new Date().getFullYear() ? CHIP_DATE : CHIP_DATE_YEAR).format(utc);
}

//a readable chip ("Fri, Oct 2", "6:00 AM") with the native input laid over it, so clicks and keys still reach the system picker
function PickerChip({ type, utc, label, invalid, describedBy, min, onPick }: {
  type: "date" | "time";
  utc: number;
  label: string;
  invalid?: boolean;
  describedBy?: string;
  min?: string;
  onPick: (value: string) => void;
}) {
  return (
    <span className="calendar-editor-pill" data-invalid={invalid || undefined}>
      <span aria-hidden="true">{chipText(type, utc)}</span>
      <input
        type={type}
        className="calendar-editor-pill-input"
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        min={min}
        step={type === "time" ? 300 : undefined}
        value={type === "date" ? toDateInputValue(utc) : toTimeInputValue(utc)}
        onClick={(event) => {
          try {
            event.currentTarget.showPicker?.();
          } catch {
            //not allowed or unsupported here; the field still takes keyboard input
          }
        }}
        onChange={(event) => {
          if (event.target.value) onPick(event.target.value);
        }}
      />
    </span>
  );
}

const KIND_OPTIONS: SegmentOption<CalendarItemKind>[] = [
  { value: "event", label: "Event" },
  { value: "task", label: "Task" },
];

export function CalendarItemEditor({ draft, open = true, onChange, onSave, onCancel, onDelete, calendars = [], defaultCalendarId = "events" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const allDayId = useId();
  const eventCalendars = calendars.filter((calendar) => calendar.kind === "event");
  const chosenCalendar = draft.calendarId ?? defaultCalendarId;
  const showCalendarPicker = !draft.google && !draft.imported && draft.kind === "event"
    && (eventCalendars.length > 1 || !eventCalendars.some((calendar) => calendar.id === chosenCalendar));
  const locationFieldId = useId();
  const startsId = useId();
  const endsId = useId();
  const durationId = useId();
  const duration = draft.endUTC - draft.startUTC;
  const endsBeforeStart = duration <= 0;
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
        <div className="calendar-editor-body">
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
          <div className="calendar-editor-toolbar">
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
          <section className="calendar-editor-section" aria-label="Schedule">
            <div className="calendar-editor-group">
              {draft.allDay ? (
                <div className="calendar-editor-cell">
                  <span className="calendar-editor-cell-label" aria-hidden="true">Date</span>
                  <span className="calendar-editor-when">
                    <PickerChip
                      type="date"
                      utc={draft.startUTC}
                      label="Date"
                      onPick={(value) => {
                        const [y, m, d] = value.split("-").map(Number);
                        const start = new Date(y, m - 1, d).getTime();
                        if (!Number.isFinite(start)) return;
                        const days = Math.max(1, Math.round((draft.endUTC - draft.startUTC) / DAY_MS));
                        onChange({ ...draft, startUTC: start, endUTC: new Date(y, m - 1, d + days).getTime() });
                      }}
                    />
                  </span>
                </div>
              ) : (
                <>
                  <div className="calendar-editor-cell" role="group" aria-labelledby={startsId}>
                    <span id={startsId} className="calendar-editor-cell-label">Starts</span>
                    <div className="calendar-editor-when">
                      <PickerChip
                        type="date"
                        utc={draft.startUTC}
                        label="Start date"
                        onPick={(value) => {
                          const startUTC = withDate(draft.startUTC, value);
                          if (startUTC == null) return;
                          onChange({ ...draft, startUTC, endUTC: startUTC + Math.max(MIN_DURATION_MS, duration) });
                        }}
                      />
                      <PickerChip
                        type="time"
                        utc={draft.startUTC}
                        label="Start time"
                        onPick={(value) => {
                          const startUTC = withTime(draft.startUTC, value);
                          if (startUTC == null) return;
                          onChange({ ...draft, startUTC, endUTC: startUTC + Math.max(MIN_DURATION_MS, duration) });
                        }}
                      />
                    </div>
                  </div>
                  <div className="calendar-editor-cell" role="group" aria-labelledby={endsId}>
                    <span id={endsId} className="calendar-editor-cell-label">Ends</span>
                    <div className="calendar-editor-when">
                      <PickerChip
                        type="date"
                        utc={draft.endUTC}
                        label="End date"
                        invalid={endsBeforeStart}
                        describedBy={durationId}
                        min={toDateInputValue(draft.startUTC)}
                        onPick={(value) => {
                          const endUTC = withDate(draft.endUTC, value);
                          if (endUTC != null) onChange({ ...draft, endUTC });
                        }}
                      />
                      <PickerChip
                        type="time"
                        utc={draft.endUTC}
                        label="End time"
                        invalid={endsBeforeStart}
                        describedBy={durationId}
                        onPick={(value) => {
                          const endUTC = withTime(draft.endUTC, value);
                          if (endUTC != null) onChange({ ...draft, endUTC });
                        }}
                      />
                      <span id={durationId} className="calendar-editor-duration" data-invalid={endsBeforeStart || undefined}
                        aria-live="polite">
                        {endsBeforeStart ? "Ends before it starts" : formatDuration(duration)}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>
          {draft.kind === "event" && !draft.google ? (
            <section className="calendar-editor-section" aria-label="Details">
              <div className="calendar-editor-group">
                {showCalendarPicker ? (
                  <label className="calendar-editor-cell">
                    <span className="calendar-editor-cell-label">Calendar</span>
                    <select
                      className="calendar-editor-input calendar-editor-input-inset calendar-editor-select"
                      value={chosenCalendar}
                      onChange={(event) => onChange({ ...draft, calendarId: event.target.value })}
                    >
                      {eventCalendars.some((calendar) => calendar.id === chosenCalendar) ? null : (
                        <option value={chosenCalendar}>WatAgent</option>
                      )}
                      {eventCalendars.map((calendar) => (
                        <option key={calendar.id} value={calendar.id}>
                          {calendar.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <LocationField
                  labelId={locationFieldId}
                  value={draft.location ?? ""}
                  onChange={(location) => onChange({ ...draft, location })}
                />
                <label className="calendar-editor-cell is-multiline">
                  <span className="calendar-editor-cell-label">Notes</span>
                  <textarea
                    className="calendar-editor-input calendar-editor-input-inset calendar-editor-area"
                    value={draft.description ?? ""}
                    maxLength={4000}
                    rows={3}
                    placeholder="Add a short description"
                    onChange={(event) => onChange({ ...draft, description: event.target.value })}
                  />
                </label>
              </div>
            </section>
          ) : null}
        </div>
        <footer className="calendar-editor-actions">
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
        </footer>
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
    location: calendar.location,
    description: calendar.description,
    calendarId: calendar.kind === "event" && !calendar.importSource ? calendar.calendarId ?? "events" : undefined,
    imported: Boolean(calendar.importSource),
  };
}
