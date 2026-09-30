import {
  ALL_SOURCES,
  DEFAULT_COLORS,
  HEX_COLOR,
  readCalendarColors,
  readCalendarView,
  readColorOverrides,
  readSourceFilter,
  type CalendarColors,
  type CalendarSourceFilter,
} from "@/calendar/preferences";
import { parseSmartTagsFromUnknown, readSmartTags, type SmartTag } from "@/calendar/smart-tags";
import type { CalendarView } from "@/calendar/types";

export type UserCalendarPreferencesV1 = {
  version: 1;
  view: CalendarView;
  sources: CalendarSourceFilter;
  colors: CalendarColors;
  colorOverrides: Record<string, string>;
  smartTags: SmartTag[];
  navCollapsed: boolean;
};

const VIEWS = new Set<CalendarView>(["day", "week", "month", "year"]);

function idList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 1024).slice(0, 200);
}

function hexOr(raw: unknown, fallback: string): string {
  return typeof raw === "string" && HEX_COLOR.test(raw) ? raw.toLowerCase() : fallback;
}

function sourcesOf(raw: unknown): CalendarSourceFilter | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  return {
    events: rec.events !== false,
    tasks: rec.tasks !== false,
    google: rec.google !== false,
    mutedGoogleIds: idList(rec.mutedGoogleIds),
    hiddenIds: idList(rec.hiddenIds),
  };
}

function colorsOf(raw: unknown): CalendarColors | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  return {
    event: hexOr(rec.event, DEFAULT_COLORS.event),
    task: hexOr(rec.task, DEFAULT_COLORS.task),
    google: hexOr(rec.google, DEFAULT_COLORS.google),
    useGoogleColors: rec.useGoogleColors !== false,
  };
}

function overridesOf(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key.length > 1024 || !HEX_COLOR.test(String(value))) continue;
    next[key] = String(value).toLowerCase();
  }
  return next;
}

export function readLocalCalendarPreferences(): UserCalendarPreferencesV1 {
  let navCollapsed = false;
  try {
    navCollapsed = window.localStorage.getItem("watagent.nav.collapsed") === "1";
  } catch {
    navCollapsed = false;
  }
  return {
    version: 1,
    view: readCalendarView(),
    sources: readSourceFilter(),
    colors: readCalendarColors(),
    colorOverrides: readColorOverrides(),
    smartTags: readSmartTags(),
    navCollapsed,
  };
}

export function parseUserCalendarPreferencesDoc(
  raw: unknown,
  fallbacks: UserCalendarPreferencesV1 = readLocalCalendarPreferences(),
): UserCalendarPreferencesV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const view =
    typeof rec.view === "string" && VIEWS.has(rec.view as CalendarView)
      ? (rec.view as CalendarView)
      : fallbacks.view;
  const sources = sourcesOf(rec.sources) ?? fallbacks.sources;
  const colors = colorsOf(rec.colors) ?? fallbacks.colors;
  return {
    version: 1,
    view,
    sources,
    colors,
    colorOverrides: rec.colorOverrides !== undefined ? overridesOf(rec.colorOverrides) : fallbacks.colorOverrides,
    smartTags: rec.smartTags !== undefined ? parseSmartTagsFromUnknown(rec.smartTags) : fallbacks.smartTags,
    navCollapsed: typeof rec.navCollapsed === "boolean" ? rec.navCollapsed : fallbacks.navCollapsed,
  };
}

export function preferencesDocHasContent(doc: UserCalendarPreferencesV1): boolean {
  if (doc.smartTags.length > 0) return true;
  if (doc.navCollapsed) return true;
  if (doc.view !== "week") return true;
  if (JSON.stringify(doc.sources) !== JSON.stringify(ALL_SOURCES)) return true;
  if (JSON.stringify(doc.colors) !== JSON.stringify(DEFAULT_COLORS)) return true;
  if (Object.keys(doc.colorOverrides).length > 0) return true;
  return false;
}

export function serverPreferencesEmpty(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return true;
  const keys = Object.keys(raw as Record<string, unknown>).filter((key) => key !== "version");
  return keys.length === 0;
}
