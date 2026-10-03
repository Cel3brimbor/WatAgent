import { calendarLinksOf, calendarNamesOf, calendarPriorityOrderOf, showDuplicateEventsOf } from "@/calendar/calendar-priority";
import type { CalendarLinks, CalendarNames, CalendarPriorityOrder, CalendarView } from "@/calendar/types";

const STORAGE_KEY = "watagent.calendar.preferences.v1";
const VIEWS = new Set<CalendarView>(["day", "workweek", "week", "month", "year"]);

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

export type CalendarGroups = {
  watagent: boolean;
  external: boolean;
  other: boolean;
  smartTags: boolean;
  /** True shows hidden calendars on the grid and leaves the Hidden list as it was. */
  hidden: boolean;
};

export type CalendarSourceFilter = {
  events: boolean;
  tasks: boolean;
  google: boolean;
  /** Google and imported calendars unchecked in the sidebar (hidden from the grid only). */
  mutedGoogleIds: string[];
  /** Calendars moved to the Hidden calendars section. */
  hiddenIds: string[];
  /** Non-Google calendars the user marked read-only (no structural edits; tasks can still be checked off). */
  readOnlyCalendarIds: string[];
  /** False hides a whole sidebar group without rewriting each calendar's own check. */
  groups?: CalendarGroups;
};

export function calendarGroupsOf(raw: unknown): CalendarGroups {
  const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    watagent: rec.watagent !== false,
    external: rec.external !== false,
    other: rec.other !== false,
    smartTags: rec.smartTags !== false,
    hidden: rec.hidden === true,
  };
}

export const ALL_SOURCES: CalendarSourceFilter = {
  events: true,
  tasks: true,
  google: true,
  mutedGoogleIds: [],
  hiddenIds: [],
  readOnlyCalendarIds: [],
};

export function isCalendarReadOnly(filter: CalendarSourceFilter, id: string): boolean {
  return filter.readOnlyCalendarIds.includes(id);
}

export function setCalendarReadOnly(filter: CalendarSourceFilter, id: string, readOnly: boolean): CalendarSourceFilter {
  const ids = new Set(filter.readOnlyCalendarIds);
  if (readOnly) ids.add(id);
  else ids.delete(id);
  return { ...filter, readOnlyCalendarIds: [...ids] };
}

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
      readOnlyCalendarIds?: unknown;
      groups?: unknown;
    };
    const legacyApp = parsed.app !== false;
    const legacyMuted = idList(parsed.hiddenGoogleIds);
    return {
      events: typeof parsed.events === "boolean" ? parsed.events : legacyApp,
      tasks: typeof parsed.tasks === "boolean" ? parsed.tasks : legacyApp,
      google: parsed.google !== false,
      mutedGoogleIds: idList(parsed.mutedGoogleIds).length > 0 ? idList(parsed.mutedGoogleIds) : legacyMuted,
      hiddenIds: idList(parsed.hiddenIds),
      readOnlyCalendarIds: idList(parsed.readOnlyCalendarIds),
      ...(parsed.groups && typeof parsed.groups === "object" ? { groups: calendarGroupsOf(parsed.groups) } : {}),
    };
  } catch {
    return ALL_SOURCES;
  }
}

const COLORS_KEY = "watagent.calendar.colors.v1";
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const CALENDAR_PALETTE = [
  "#ac725e",
  "#d06b64",
  "#f83a22",
  "#fa573c",
  "#ff7537",
  "#ffad46",
  "#42d692",
  "#16a765",
  "#7bd148",
  "#b3dc6c",
  "#fbe983",
  "#fad165",
  "#92e1c0",
  "#9fe1e7",
  "#9fc6e7",
  "#4986e7",
  "#9a9cff",
  "#b99aff",
  "#c2c2c2",
  "#cabdbf",
  "#cca6ac",
  "#f691b2",
  "#cd74e6",
  "#a47ae2",
];

export type CalendarColors = {
  event: string;
  task: string;
  google: string;
  useGoogleColors: boolean;
};

export const DEFAULT_COLORS: CalendarColors = {
  event: "#5b8a72",
  task: "#c99a3c",
  google: "#5f74a8",
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

const SIDE_PANEL_SECTIONS_KEY = "watagent.calendar.sidePanelSections.v1";

export type SidePanelSectionsOpen = {
  watagent: boolean;
  other: boolean;
  hidden: boolean;
  smartTags: boolean;
};

export const DEFAULT_SIDE_PANEL_SECTIONS: SidePanelSectionsOpen = {
  watagent: true,
  other: true,
  hidden: true,
  smartTags: true,
};

function sidePanelSectionBool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === "boolean" ? raw : fallback;
}

export function readSidePanelSections(): SidePanelSectionsOpen {
  if (typeof window === "undefined") return DEFAULT_SIDE_PANEL_SECTIONS;
  try {
    const raw = window.localStorage.getItem(SIDE_PANEL_SECTIONS_KEY);
    if (!raw) return DEFAULT_SIDE_PANEL_SECTIONS;
    const parsed = JSON.parse(raw) as Partial<SidePanelSectionsOpen>;
    return {
      watagent: sidePanelSectionBool(parsed.watagent, DEFAULT_SIDE_PANEL_SECTIONS.watagent),
      other: sidePanelSectionBool(parsed.other, DEFAULT_SIDE_PANEL_SECTIONS.other),
      hidden: sidePanelSectionBool(parsed.hidden, DEFAULT_SIDE_PANEL_SECTIONS.hidden),
      smartTags: sidePanelSectionBool(parsed.smartTags, DEFAULT_SIDE_PANEL_SECTIONS.smartTags),
    };
  } catch {
    return DEFAULT_SIDE_PANEL_SECTIONS;
  }
}

export function writeSidePanelSections(sections: SidePanelSectionsOpen): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIDE_PANEL_SECTIONS_KEY, JSON.stringify(sections));
  } catch {
    return;
  }
}

const LEGACY_DUPLICATE_PRIORITY_KEY = "watagent.calendar.duplicate-priority.v1";
const CALENDAR_PRIORITY_ORDER_KEY = "watagent.calendar.priority-order.v1";
const SHOW_DUPLICATE_EVENTS_KEY = "watagent.calendar.show-duplicates.v1";

export function readCalendarPriorityOrder(): CalendarPriorityOrder {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CALENDAR_PRIORITY_ORDER_KEY);
    const legacy = window.localStorage.getItem(LEGACY_DUPLICATE_PRIORITY_KEY);
    return calendarPriorityOrderOf(raw ? JSON.parse(raw) : undefined, legacy);
  } catch { return []; }
}

export function readShowDuplicateEvents(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(SHOW_DUPLICATE_EVENTS_KEY);
    return showDuplicateEventsOf(raw ? JSON.parse(raw) : undefined, window.localStorage.getItem(LEGACY_DUPLICATE_PRIORITY_KEY));
  } catch { return false; }
}

export function writeCalendarPriority(order: CalendarPriorityOrder, showDuplicates: boolean): void {
  try {
    window.localStorage.setItem(CALENDAR_PRIORITY_ORDER_KEY, JSON.stringify(order));
    window.localStorage.setItem(SHOW_DUPLICATE_EVENTS_KEY, JSON.stringify(showDuplicates));
  } catch { /* Cache is optional. */ }
}

export function readCalendarLinks(): CalendarLinks {
  try { return calendarLinksOf(JSON.parse(window.localStorage.getItem("watagent.calendar.links.v1") ?? "{}")); }
  catch { return {}; }
}

export function writeCalendarLinks(links: CalendarLinks): void {
  try { window.localStorage.setItem("watagent.calendar.links.v1", JSON.stringify(calendarLinksOf(links))); }
  catch { return; }
}

export function readCalendarNames(): CalendarNames {
  try { return calendarNamesOf(JSON.parse(window.localStorage.getItem("watagent.calendar.names.v1") ?? "{}")); }
  catch { return {}; }
}

export function writeCalendarNames(names: CalendarNames): void {
  try { window.localStorage.setItem("watagent.calendar.names.v1", JSON.stringify(calendarNamesOf(names))); }
  catch { return; }
}
