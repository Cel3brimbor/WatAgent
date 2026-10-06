"use client";

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
};

export function MobileCalendarToolbar(props: Props) {
  const { focus, view, weekStartsOn } = props;
  const week = startOfWeek(focus, weekStartsOn);
  return (
    <header className="mobile-calendar-toolbar">
      <div className="mobile-calendar-title-row">
        <h2 aria-live="polite">{focus.toLocaleDateString(undefined, view === "year" ? { year: "numeric" } : { month: "long", year: "numeric" })}</h2>
        <button type="button" className="mobile-calendar-agent" aria-pressed={props.agentOpen} onClick={props.onAgent}>Agent</button>
        <button type="button" className="icon-btn mobile-calendar-add" aria-label="New event" onClick={props.onCreate}><PlusIcon /></button>
      </div>
      <div className="mobile-calendar-controls">
        <div className="mobile-calendar-period">
          <button type="button" className="icon-btn" aria-label="Previous" onClick={props.onPrevious}><ChevronLeftIcon /></button>
          <button type="button" onClick={props.onToday}>Today</button>
          <button type="button" className="icon-btn" aria-label="Next" onClick={props.onNext}><ChevronRightIcon /></button>
        </div>
        <select aria-label="Calendar view" value={view} onChange={(event) => props.onView(event.target.value as CalendarView)}>
          <option value="day">Day</option>
          <option value="workweek">5 days</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
          <option value="year">Year</option>
        </select>
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
