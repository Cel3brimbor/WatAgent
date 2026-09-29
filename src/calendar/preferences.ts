import type { CalendarView } from "@/calendar/types";

const STORAGE_KEY = "watagent.calendar.preferences.v1";
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

const SOURCES_KEY = "watagent.calendar.sources.v1";

export type CalendarSourceFilter = { app: boolean; google: boolean };

export const ALL_SOURCES: CalendarSourceFilter = { app: true, google: true };

export function readSourceFilter(): CalendarSourceFilter {
  if (typeof window === "undefined") return ALL_SOURCES;
  try {
    const raw = window.localStorage.getItem(SOURCES_KEY);
    if (!raw) return ALL_SOURCES;
    const parsed = JSON.parse(raw) as { app?: unknown; google?: unknown };
    return { app: parsed.app !== false, google: parsed.google !== false };
  } catch {
    return ALL_SOURCES;
  }
}

const COLORS_KEY = "watagent.calendar.colors.v1";
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export type CalendarColors = {
  event: string;
  task: string;
  google: string;
  useGoogleColors: boolean;
};

export const DEFAULT_COLORS: CalendarColors = {
  event: "#8ab4ff",
  task: "#81c995",
  google: "#039be5",
  useGoogleColors: true,
};

function hexOr(raw: unknown, fallback: string): string {
  return typeof raw === "string" && HEX_COLOR.test(raw) ? raw.toLowerCase() : fallback;
}

export function readCalendarColors(): CalendarColors {
  if (typeof window === "undefined") return DEFAULT_COLORS;
  try {
    const raw = window.localStorage.getItem(COLORS_KEY);
    if (!raw) return DEFAULT_COLORS;
    const parsed = JSON.parse(raw) as Partial<Record<keyof CalendarColors, unknown>>;
    return {
      event: hexOr(parsed.event, DEFAULT_COLORS.event),
      task: hexOr(parsed.task, DEFAULT_COLORS.task),
      google: hexOr(parsed.google, DEFAULT_COLORS.google),
      useGoogleColors: parsed.useGoogleColors !== false,
    };
  } catch {
    return DEFAULT_COLORS;
  }
}

export function writeCalendarColors(colors: CalendarColors): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLORS_KEY, JSON.stringify(colors));
  } catch {
    return;
  }
}

export function writeSourceFilter(filter: CalendarSourceFilter): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SOURCES_KEY, JSON.stringify(filter));
  } catch {
    return;
  }
}
