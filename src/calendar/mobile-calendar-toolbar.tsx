"use client";

import { useEffect, useRef, useState } from "react";
import type { CalendarView } from "@/calendar/types";
import { addDays, isToday, sameLocalDay, startOfWeek } from "@/calendar/date-utils";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "@/shared/icons";

type Props = {
  focus: Date;
  view: CalendarView;
  weekStartsOn: 0 | 1;
  onDate: (date: Date) => void;
  onView: (view: CalendarView) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onCreate: () => void;
  onAgent: () => void;
  agentOpen: boolean;
  allowCreate?: boolean;
};

export function MobileCalendarToolbar(props: Props) {
  const { focus, view, weekStartsOn } = props;
  const week = startOfWeek(focus, weekStartsOn);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [menuOpen]);
  return (
    <header className="mobile-calendar-toolbar">
      <div className="mobile-calendar-title-row">
        <div className="mobile-calendar-date-menu" ref={menuRef}>
          <button ref={triggerRef} type="button" className="mobile-calendar-date-trigger" aria-expanded={menuOpen} aria-controls="mobile-calendar-options" onClick={() => setMenuOpen((open) => !open)}>
            <span aria-live="polite">{focus.toLocaleDateString(undefined, view === "year" ? { year: "numeric" } : { month: "short", year: "numeric" })}</span>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
          </button>
          {menuOpen ? <div id="mobile-calendar-options" className="mobile-calendar-options" role="group" aria-label="Calendar controls">
            <div className="mobile-calendar-period">
              <button type="button" className="icon-btn" aria-label="Previous" onClick={props.onPrevious}><ChevronLeftIcon /></button>
              <button type="button" onClick={() => { props.onToday(); setMenuOpen(false); }}>Today</button>
              <button type="button" className="icon-btn" aria-label="Next" onClick={props.onNext}><ChevronRightIcon /></button>
            </div>
            <label>View<select aria-label="Calendar view" value={view} onChange={(event) => { props.onView(event.target.value as CalendarView); setMenuOpen(false); }}>
              <option value="day">Day</option><option value="workweek">5 days</option><option value="week">Week</option><option value="month">Month</option><option value="year">Year</option>
            </select></label>
          </div> : null}
        </div>
        <button type="button" className="mobile-calendar-agent" aria-pressed={props.agentOpen} onClick={props.onAgent}>Agent</button>
        {props.allowCreate === false ? null : (
          <button type="button" className="icon-btn mobile-calendar-add" aria-label="Add event" onClick={props.onCreate}><PlusIcon /></button>
        )}
      </div>
      {view === "day" ? <div className="mobile-calendar-week-strip" aria-label="Choose a day">
        {Array.from({ length: 7 }, (_, index) => {
          const date = addDays(week, index);
          return <button type="button" key={date.toDateString()}
            className={`${sameLocalDay(date, focus) ? "is-selected" : ""}${isToday(date) ? " is-today" : ""}`}
            aria-label={date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            aria-pressed={sameLocalDay(date, focus)} aria-current={isToday(date) ? "date" : undefined}
            onClick={() => props.onDate(date)}>
            <span>{date.toLocaleDateString(undefined, { weekday: "narrow" })}</span><strong>{date.getDate()}</strong>
          </button>;
        })}
      </div> : null}
    </header>
  );
}
