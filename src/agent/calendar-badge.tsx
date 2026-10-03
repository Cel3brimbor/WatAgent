"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  addDays,
  formatDayHeading,
  formatFocusLabel,
  formatTime,
  isToday,
  localeWeekStartsOn,
  shiftFocus,
  startOfLocalDay,
  startOfWeek,
} from "@/calendar/date-utils";
import { localCalendarIdOf } from "@/calendar/local-calendars";
import { HEX_COLOR } from "@/calendar/preferences";
import type { CalendarItemDoc, CalendarView } from "@/calendar/types";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "@/shared/icons";
import type { MentionCalendar } from "@/agent/calendar-mention";

type PopView = Extract<CalendarView, "day" | "week" | "month">;

const VIEWS: { id: PopView; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

type Props = {
  calendar: MentionCalendar;
  items: CalendarItemDoc[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove?: () => void;
  onEditItem?: (item: CalendarItemDoc) => void;
};

function badgeStyle(color: string): CSSProperties | undefined {
  return HEX_COLOR.test(color) ? ({ "--cal": color } as CSSProperties) : undefined;
}

function rangeOf(focus: Date, view: PopView): { start: number; end: number } {
  if (view === "day") {
    const start = startOfLocalDay(focus);
    return { start: start.getTime(), end: addDays(start, 1).getTime() };
  }
  if (view === "week") {
    const start = startOfWeek(focus, localeWeekStartsOn());
    return { start: start.getTime(), end: addDays(start, 7).getTime() };
  }
  const start = new Date(focus.getFullYear(), focus.getMonth(), 1);
  const end = new Date(focus.getFullYear(), focus.getMonth() + 1, 1);
  return { start: start.getTime(), end: end.getTime() };
}

function eventsInRange(items: CalendarItemDoc[], calendarId: string, start: number, end: number): CalendarItemDoc[] {
  return items
    .filter((item) => {
      if (item.editorDraft || item.pendingAction === "delete") return false;
      if (localCalendarIdOf(item.calendar) !== calendarId) return false;
      return item.calendar.endUTC > start && item.calendar.startUTC < end;
    })
    .sort((a, b) => a.calendar.startUTC - b.calendar.startUTC || a.title.localeCompare(b.title));
}

function whenLabel(item: CalendarItemDoc): string {
  if (item.calendar.allDay) return "All day";
  return `${formatTime(item.calendar.startUTC)} – ${formatTime(item.calendar.endUTC)}`;
}

function EditIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="glyph">
      <path
        d="M5 19h3.2L18.4 8.8a1.9 1.9 0 0 0 0-2.7l-.5-.5a1.9 1.9 0 0 0-2.7 0L5 15.8V19z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M13.8 7l3.2 3.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function CalendarBadge({ calendar, items, open, onOpenChange, onRemove, onEditItem }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const label = `${calendar.name} calendar`;

  return (
    <span className="cal-badge-wrap" style={badgeStyle(calendar.color)}>
      <button
        ref={buttonRef}
        type="button"
        className={`cal-badge${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        onClick={() => onOpenChange(!open)}
      >
        <span className="cal-badge-dot" aria-hidden="true" />
        <span className="cal-badge-name">
          {calendar.name}
          {calendar.readOnly ? <span className="cal-badge-read-only"> (read only)</span> : null}
        </span>
      </button>
      {onRemove ? (
        <button type="button" className="cal-badge-remove" aria-label={`Remove ${calendar.name}`} onClick={onRemove}>
          <CloseIcon />
        </button>
      ) : null}
      {open ? (
        <CalendarBadgePopover
          calendar={calendar}
          items={items}
          anchor={buttonRef}
          onClose={() => onOpenChange(false)}
          onEditItem={calendar.readOnly ? undefined : onEditItem}
        />
      ) : null}
    </span>
  );
}

function CalendarBadgePopover({
  calendar,
  items,
  anchor,
  onClose,
  onEditItem,
}: {
  calendar: MentionCalendar;
  items: CalendarItemDoc[];
  anchor: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onEditItem?: (item: CalendarItemDoc) => void;
}) {
  const titleId = useId();
  const popRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<PopView>("day");
  const [focus, setFocus] = useState(() => startOfLocalDay(new Date()));
  const [active, setActive] = useState(0);
  const [box, setBox] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number } | null>(null);
  const weekStartsOn = localeWeekStartsOn();
  const range = rangeOf(focus, view);
  const events = eventsInRange(items, calendar.id, range.start, range.end);
  const groups = new Map<number, CalendarItemDoc[]>();
  for (const item of events) {
    const day = startOfLocalDay(new Date(Math.max(item.calendar.startUTC, range.start))).getTime();
    const list = groups.get(day);
    if (list) list.push(item);
    else groups.set(day, [item]);
  }

  useEffect(() => {
    const node = anchor.current;
    function place() {
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 16);
      let left = rect.left;
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
      const roomBelow = window.innerHeight - rect.bottom;
      const openUp = roomBelow < 220 && rect.top > roomBelow;
      const maxHeight = Math.min(360, Math.max(160, (openUp ? rect.top : roomBelow) - 16));
      setBox({
        left,
        width,
        maxHeight,
        top: openUp ? undefined : rect.bottom + 6,
        bottom: openUp ? window.innerHeight - rect.top + 6 : undefined,
      });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);

  useEffect(() => {
    popRef.current?.focus();
  }, []);

  useEffect(() => {
    function onPointer(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (popRef.current?.contains(target) || anchor.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [anchor, onClose]);

  useEffect(() => {
    const row = popRef.current?.querySelector<HTMLElement>(`[data-event-index="${active}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [active, view, focus]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      anchor.current?.focus();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setActive(0);
      setFocus((current) => shiftFocus(current, view, -1));
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setActive(0);
      setFocus((current) => shiftFocus(current, view, 1));
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (events.length === 0) return;
      setActive((index) => Math.min(events.length - 1, index + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (events.length === 0) return;
      setActive((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActive(Math.max(0, events.length - 1));
    }
  }

  if (!box || typeof document === "undefined") return null;
  let eventIndex = 0;

  return createPortal(
    <div
      ref={popRef}
      className="cal-pop"
      role="dialog"
      tabIndex={-1}
      aria-labelledby={titleId}
      data-calendar-popover=""
      style={{
        left: box.left,
        width: box.width,
        maxHeight: box.maxHeight,
        top: box.top,
        bottom: box.bottom,
      }}
      onKeyDown={onKeyDown}
    >
      <div className="cal-pop-head">
        <p id={titleId} className="cal-pop-title">
          <span className="cal-badge-dot" style={badgeStyle(calendar.color)} aria-hidden="true" />
          {calendar.name}
        </p>
        <div className="cal-pop-nav">
          <button type="button" className="cal-pop-icon" aria-label="Previous" onClick={() => { setActive(0); setFocus((current) => shiftFocus(current, view, -1)); }}>
            <ChevronLeftIcon />
          </button>
          <p className="cal-pop-label">{formatFocusLabel(focus, view, weekStartsOn)}</p>
          <button type="button" className="cal-pop-icon" aria-label="Next" onClick={() => { setActive(0); setFocus((current) => shiftFocus(current, view, 1)); }}>
            <ChevronRightIcon />
          </button>
        </div>
        <div className="cal-pop-views" role="radiogroup" aria-label="Event list range">
          {VIEWS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={view === option.id}
              className={`cal-pop-view${view === option.id ? " is-on" : ""}`}
              onClick={() => {
                setView(option.id);
                setActive(0);
              }}
            >
              {option.label}
            </button>
          ))}
          {isToday(focus) ? null : (
            <button type="button" className="cal-pop-today" onClick={() => { setActive(0); setFocus(startOfLocalDay(new Date())); }}>
              Today
            </button>
          )}
        </div>
      </div>
      <div className="cal-pop-list" role="list">
        {events.length === 0 ? (
          <p className="cal-pop-empty">Nothing in this {view}.</p>
        ) : (
          [...groups.entries()].map(([day, rows]) => (
            <section key={day} className="cal-pop-day">
              <h3>{formatDayHeading(new Date(day))}</h3>
              <ul>
                {rows.map((item) => {
                  const index = eventIndex;
                  eventIndex += 1;
                  return (
                    <li key={item.id}>
                      <div
                        className={`cal-pop-event${index === active ? " is-active" : ""}${item.calendar.completed ? " is-done" : ""}`}
                        data-event-index={index}
                        role="listitem"
                      >
                        <span className="cal-pop-when">{whenLabel(item)}</span>
                        <span className="cal-pop-name">{item.title}</span>
                        {onEditItem ? (
                          <button
                            type="button"
                            className="cal-pop-edit"
                            aria-label={`Edit ${item.title}`}
                            onClick={() => {
                              onEditItem(item);
                              onClose();
                            }}
                          >
                            <EditIcon />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}
