"use client";

import { memo, useMemo } from "react";
import { monthCells, monthLabel, startOfLocalDay, weekdayLabels } from "@/calendar/date-utils";
import type { TimelineItem } from "@/calendar/types";
import { DayItemsOverride, useHasItemsOnDay } from "@/calendar/day-builder";
import { useStableCallback } from "@/shared/use-stable-callback";

type Props = {
  focus: Date;
  weekStartsOn: 0 | 1;
  itemsForDay?: (date: Date) => TimelineItem[];
  onSelectDay: (date: Date) => void;
};

type DayProps = {
  date: Date;
  inMonth: boolean;
  today: boolean;
  onSelectDay: (date: Date) => void;
};

function dayEqual(prev: DayProps, next: DayProps): boolean {
  return prev.date.getTime() === next.date.getTime()
    && prev.inMonth === next.inMonth
    && prev.today === next.today
    && prev.onSelectDay === next.onSelectDay;
}

const YearDay = memo(function YearDay({ date, inMonth, today, onSelectDay }: DayProps) {
  return (
    <button
      type="button"
      className={`calendar-year-day${inMonth ? "" : " is-outside"}${today ? " is-today" : ""}`}
      disabled={!inMonth}
      onClick={() => onSelectDay(date)}
    >
      {inMonth ? date.getDate() : ""}
      {inMonth ? <YearDot date={date} /> : null}
    </button>
  );
}, dayEqual);

const YearDot = memo(function YearDot({ date }: { date: Date }) {
  const hasItems = useHasItemsOnDay(date);
  if (!hasItems) return null;
  return <span className="calendar-year-dot" />;
});

type MonthProps = {
  year: number;
  month: number;
  weekStartsOn: 0 | 1;
  todayMs: number;
  onSelectDay: (date: Date) => void;
};

export const YearMonth = memo(function YearMonth({ year, month, weekStartsOn, todayMs, onSelectDay }: MonthProps) {
  const cells = useMemo(() => monthCells(new Date(year, month, 1), weekStartsOn), [year, month, weekStartsOn]);
  const labels = weekdayLabels(weekStartsOn);
  return (
    <section className="calendar-year-month">
      <h3>{monthLabel(year, month)}</h3>
      <div className="calendar-year-weekdays">
        {labels.map((label, i) => (
          <span key={`${label}-${i}`}>{label.slice(0, 2)}</span>
        ))}
      </div>
      <div className="calendar-year-grid">
        {cells.map((cell) => (
          <YearDay
            key={cell.date.toISOString()}
            date={cell.date}
            inMonth={cell.inMonth}
            today={startOfLocalDay(cell.date).getTime() === todayMs}
            onSelectDay={onSelectDay}
          />
        ))}
      </div>
    </section>
  );
});

function YearLayout({ focus, weekStartsOn, onSelectDay }: Omit<Props, "itemsForDay">) {
  const year = focus.getFullYear();
  const todayMs = startOfLocalDay(new Date()).getTime();
  const selectDay = useStableCallback(onSelectDay);
  return (
    <div className="calendar-year">
      {Array.from({ length: 12 }, (_, month) => (
        <YearMonth
          key={month}
          year={year}
          month={month}
          weekStartsOn={weekStartsOn}
          todayMs={todayMs}
          onSelectDay={selectDay}
        />
      ))}
    </div>
  );
}

//parent renders stay off the year grid; a dot still updates from its own day subscription
export const CalendarYearView = memo(function CalendarYearView({ itemsForDay, ...rest }: Props) {
  return (
    <DayItemsOverride itemsForDay={itemsForDay ?? null}>
      <YearLayout {...rest} />
    </DayItemsOverride>
  );
});
