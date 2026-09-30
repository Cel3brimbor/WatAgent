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

export type CalendarSourceFilter = {
  events: boolean;
  tasks: boolean;
  google: boolean;
  /** Google calendars unchecked in the sidebar (hidden from the grid only). */
  mutedGoogleIds: string[];
  /** Calendars moved to the Hidden calendars section. */
  hiddenIds: string[];
};

export const ALL_SOURCES: CalendarSourceFilter = {
  events: true,
  tasks: true,
  google: true,
  mutedGoogleIds: [],
  hiddenIds: [],
};

export function isSidebarHidden(filter: CalendarSourceFilter, id: string): boolean {
  return filter.hiddenIds.includes(id);
}

function idList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 1024).slice(0, 200);
}

export function readSourceFilter(): CalendarSourceFilter {
  if (typeof window === "undefined") return ALL_SOURCES;
  try {
    const raw = window.localStorage.getItem(SOURCES_KEY);
    if (!raw) return ALL_SOURCES;
    const parsed = JSON.parse(raw) as {
      app?: unknown;
      events?: unknown;
      tasks?: unknown;
      google?: unknown;
      hiddenGoogleIds?: unknown;
      mutedGoogleIds?: unknown;
      hiddenIds?: unknown;
    };
    const legacyApp = parsed.app !== false;
    const legacyMuted = idList(parsed.hiddenGoogleIds);
    return {
      events: typeof parsed.events === "boolean" ? parsed.events : legacyApp,
      tasks: typeof parsed.tasks === "boolean" ? parsed.tasks : legacyApp,
      google: parsed.google !== false,
      mutedGoogleIds: idList(parsed.mutedGoogleIds).length > 0 ? idList(parsed.mutedGoogleIds) : legacyMuted,
      hiddenIds: idList(parsed.hiddenIds),
    };
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

const OVERRIDES_KEY = "watagent.calendar.colorOverrides.v1";

export function readColorOverrides(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (key.length > 1024 || !HEX_COLOR.test(String(value))) continue;
      next[key] = String(value).toLowerCase();
    }
    return next;
  } catch {
    return {};
  }
}

export function writeColorOverrides(overrides: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
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
