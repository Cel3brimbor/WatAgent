import type { CalendarView } from "@/calendar/types";

export function startOfLocalDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return startOfLocalDay(next);
}

export function addYears(date: Date, years: number): Date {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return startOfLocalDay(next);
}

export function localDayBounds(date: Date): { startDateUTC: number; endDateUTC: number } {
  const start = startOfLocalDay(date);
  return {
    startDateUTC: start.getTime(),
    endDateUTC: addDays(start, 1).getTime(),
  };
}

export function localeWeekStartsOn(): 0 | 1 {
  return 1;
}

export function startOfWeek(date: Date, weekStartsOn: 0 | 1): Date {
  const start = startOfLocalDay(date);
  const day = start.getDay();
  const offset = weekStartsOn === 1 ? (day === 0 ? 6 : day - 1) : day;
  return addDays(start, -offset);
}

export function startOfWorkWeek(date: Date): Date {
  const start = startOfLocalDay(date);
  const day = start.getDay();
  if (day === 6) return addDays(start, 2);
  if (day === 0) return addDays(start, 1);
  return addDays(start, 1 - day);
}

export function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(date: Date): boolean {
  return sameLocalDay(date, new Date());
}

export function shiftFocus(focus: Date, view: CalendarView, delta: number): Date {
  if (view === "day") return addDays(focus, delta);
  if (view === "week" || view === "workweek") return addDays(focus, delta * 7);
  if (view === "month") return addMonths(focus, delta);
  return addYears(focus, delta);
}

export function formatFocusLabel(focus: Date, view: CalendarView, weekStartsOn: 0 | 1): string {
  if (view === "day") {
    return focus.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  if (view === "week" || view === "workweek") {
    const start = view === "workweek" ? startOfWorkWeek(focus) : startOfWeek(focus, weekStartsOn);
    const end = addDays(start, view === "workweek" ? 4 : 6);
    const sameMonth = start.getMonth() === end.getMonth();
    const sameYear = start.getFullYear() === end.getFullYear();
    const startLabel = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const endLabel = end.toLocaleDateString(undefined, {
      month: sameMonth ? undefined : "short",
      day: "numeric",
      year: sameYear ? undefined : "numeric",
    });
    return `${startLabel} – ${endLabel}`;
  }
  if (view === "month") {
    return focus.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  return String(focus.getFullYear());
}

export function formatHourLabel(hour: number): string {
  const date = new Date();
  const minutes = Math.round(hour * 60);
  date.setHours(0, minutes, 0, 0);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    ...(minutes % 60 ? { minute: "2-digit" as const } : {}),
  });
}

function googleClock(date: Date): string {
  const hours24 = date.getHours();
  const suffix = hours24 >= 12 ? "pm" : "am";
  const hours = hours24 % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}${suffix}`;
}

function googleDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export function formatGoogleWhen(startUTC: number, endUTC: number, allDay: boolean): string {
  const start = new Date(startUTC);
  const end = new Date(endUTC);
  if (allDay) {
    const inclusiveEnd = new Date(endUTC - 1);
    if (sameLocalDay(start, inclusiveEnd) || endUTC <= startUTC) return googleDate(start);
    return `${googleDate(start)} – ${googleDate(inclusiveEnd)}`;
  }
  if (sameLocalDay(start, end)) {
    return `${googleDate(start)} · ${googleClock(start)} – ${googleClock(end)}`;
  }
  return `${googleDate(start)} · ${googleClock(start)} – ${googleDate(end)} · ${googleClock(end)}`;
}

export function formatDueWhen(startUTC: number): string {
  const start = new Date(startUTC);
  return `${googleDate(start)} · ${googleClock(start)}`;
}

export function formatTime(utc: number): string {
  return new Date(utc).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatDayHeading(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function formatMonthPopTitle(date: Date): string {
  const weekday = date.toLocaleDateString(undefined, { weekday: "long" });
  return `${weekday}, ${date.getDate()}`;
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function hourGridMs(dayStart: Date, hour: number, minute = 0): number {
  const next = new Date(dayStart);
  next.setHours(0, Math.round(hour * 60) + minute, 0, 0);
  return next.getTime();
}

export type MonthCell = {
  date: Date;
  inMonth: boolean;
};

export function monthCells(focus: Date, weekStartsOn: 0 | 1): MonthCell[] {
  const monthStart = new Date(focus.getFullYear(), focus.getMonth(), 1);
  const gridStart = startOfWeek(monthStart, weekStartsOn);
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = addDays(gridStart, i);
    cells.push({ date, inMonth: date.getMonth() === focus.getMonth() });
  }
  return cells;
}

export function weekdayLabels(weekStartsOn: 0 | 1): string[] {
  const start = startOfWeek(new Date(), weekStartsOn);
  return Array.from({ length: 7 }, (_, i) =>
    addDays(start, i).toLocaleDateString(undefined, { weekday: "short" }),
  );
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: "short" });
}
