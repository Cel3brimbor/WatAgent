import type { CalendarView } from "@/calendar/types";

const STORAGE_KEY = "waterflow.calendar.preferences.v1";
const VIEWS = new Set<CalendarView>(["day", "week", "month", "year"]);

export function readCalendarView(defaultView: CalendarView = "week"): CalendarView {
  if (typeof window === "undefined") return defaultView;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultView;
    const parsed = JSON.parse(raw) as { view?: unknown };
    if (typeof parsed.view === "string" && VIEWS.has(parsed.view as CalendarView)) {
      return parsed.view as CalendarView;
    }
  } catch {
    return defaultView;
  }
  return defaultView;
}

export function writeCalendarView(view: CalendarView): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ view }));
  } catch {
    return;
  }
}
