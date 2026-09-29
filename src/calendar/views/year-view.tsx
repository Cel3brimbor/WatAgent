"use client";

import { isToday, monthCells, monthLabel, weekdayLabels } from "@/calendar/date-utils";
import type { TimelineItem } from "@/calendar/types";

type Props = {
  focus: Date;
  weekStartsOn: 0 | 1;
  itemsForDay: (date: Date) => TimelineItem[];
  onSelectDay: (date: Date) => void;
};

export function CalendarYearView({
  focus,
  weekStartsOn,
  itemsForDay,
  onSelectDay,
}: Props) {
  const year = focus.getFullYear();
  const labels = weekdayLabels(weekStartsOn);

  return (
    <div className="calendar-year">
      {Array.from({ length: 12 }, (_, month) => {
        const monthFocus = new Date(year, month, 1);
        const cells = monthCells(monthFocus, weekStartsOn);
        return (
          <section key={month} className="calendar-year-month">
            <h3>{monthLabel(year, month)}</h3>
            <div className="calendar-year-weekdays">
              {labels.map((label, i) => (
                <span key={`${label}-${i}`}>{label.slice(0, 2)}</span>
              ))}
            </div>
            <div className="calendar-year-grid">
              {cells.map((cell) => {
                const items = cell.inMonth ? itemsForDay(cell.date) : [];
                return (
                  <button
                    key={cell.date.toISOString()}
                    type="button"
                    className={`calendar-year-day${cell.inMonth ? "" : " is-outside"}${isToday(cell.date) ? " is-today" : ""}`}
                    disabled={!cell.inMonth}
                    onClick={() => onSelectDay(cell.date)}
                  >
                    {cell.inMonth ? cell.date.getDate() : ""}
                    {items.length > 0 ? <span className="calendar-year-dot" /> : null}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
