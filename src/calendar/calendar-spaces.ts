import { importedCalendarId, importedCalendarsOf } from "@/calendar/imported-calendars";
import { localCalendarIdOf } from "@/calendar/local-calendars";
import { CALENDAR_PALETTE, HEX_COLOR } from "@/calendar/preferences";
import { parseSmartTagsFromUnknown, type SmartTag } from "@/calendar/smart-tags";
import type { CalendarItemMeta, CalendarView, ImportedCalendar } from "@/calendar/types";

export const QUICK_DISPLAY_ICONS = [
  "layers",
  "sun",
  "moon",
  "book",
  "bolt",
  "heart",
  "star",
  "flag",
  "leaf",
  "bell",
  "pin",
  "compass",
] as const;

export type QuickDisplayIcon = (typeof QUICK_DISPLAY_ICONS)[number];

const QUICK_DISPLAY_ICON_SET = new Set<string>(QUICK_DISPLAY_ICONS);

//a named shortcut. its colors and smart tags never rewrite the main calendar
export type CalendarSpace = {
  id: string;
  name: string;
  icon: QuickDisplayIcon;
  color: string;
  view: CalendarView;
  importedCalendars: ImportedCalendar[];
  includedCalendarIds: string[];
  mutedIds: string[];
  colorOverrides: Record<string, string>;
  smartTags: SmartTag[];
};

export type SpaceCalendarChoice = {
  id: string;
  name: string;
  color: string;
  group: "WatAgent" | "Imported" | "UWaterloo Events" | "Google";
};

export const MAIN_CALENDAR_SPACE_ID = "main";
export const MAIN_CALENDAR_SPACE_NAME = "Main";
export const MAX_CALENDAR_SPACES = 12;

const STORAGE_KEY = "watagent.calendar.spaces.v1";
const SPACE_ID = /^space-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VIEWS = new Set<CalendarView>(["day", "workweek", "week", "month", "year"]);

export const SPACE_COLOR_CHOICES = [6, 16, 2, 5, 17, 22, 8, 15].map((index) => CALENDAR_PALETTE[index]);

export function isCalendarSpaceId(id: string): boolean {
  return SPACE_ID.test(id);
}

export function nextSpaceColor(spaces: CalendarSpace[]): string {
  const used = new Set(spaces.map((space) => space.color));
  return SPACE_COLOR_CHOICES.find((color) => !used.has(color)) ?? SPACE_COLOR_CHOICES[spaces.length % SPACE_COLOR_CHOICES.length];
}

export function spaceNameError(spaces: CalendarSpace[], name: string, ignoreId?: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Name this Quick Display.";
  if (trimmed.length > 40) return "Use 40 characters or fewer.";
  if (trimmed.toLowerCase() === MAIN_CALENDAR_SPACE_NAME.toLowerCase()) return "Main is your main calendar.";
  if (spaces.some((space) => space.id !== ignoreId && space.name.toLowerCase() === trimmed.toLowerCase())) {
    return "You already have a Quick Display with this name.";
  }
  return null;
}

export function quickDisplayIconOf(raw: unknown): QuickDisplayIcon {
  return typeof raw === "string" && QUICK_DISPLAY_ICON_SET.has(raw) ? (raw as QuickDisplayIcon) : "layers";
}

export function newCalendarSpace(name: string, color: string, view: CalendarView = "week"): CalendarSpace {
  const picked = HEX_COLOR.test(color) ? color.toLowerCase() : SPACE_COLOR_CHOICES[0];
  return {
    id: `space-${crypto.randomUUID()}`,
    name: name.trim().slice(0, 40),
    icon: "layers",
    color: picked,
    view: VIEWS.has(view) ? view : "week",
    importedCalendars: [],
    includedCalendarIds: [],
    mutedIds: [],
    colorOverrides: {},
    smartTags: [],
  };
}

export function newQuickDisplay(
  name: string,
  icon: QuickDisplayIcon,
  includedCalendarIds: string[],
  spaces: CalendarSpace[],
  view: CalendarView = "week",
): CalendarSpace {
  return {
    ...newCalendarSpace(name, nextSpaceColor(spaces), view),
    icon: quickDisplayIconOf(icon),
    includedCalendarIds: [...new Set(includedCalendarIds)].slice(0, 80),
  };
}

function idList(raw: unknown, limit: number): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 1024))].slice(0, limit);
}

function colorMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || key.length > 1024 || typeof value !== "string" || !HEX_COLOR.test(value)) continue;
    next[key] = value.toLowerCase();
    if (Object.keys(next).length >= 80) break;
  }
  return next;
}

/**feeds imported into a space keep their own ids, so they can't take a main calendar's feed*/
export function calendarSpacesOf(raw: unknown, reservedFeedIds: ReadonlySet<string> = new Set()): CalendarSpace[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const feeds = new Set<string>(reservedFeedIds);
  const list: CalendarSpace[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id : "";
    const name = typeof rec.name === "string" ? rec.name.trim().slice(0, 40) : "";
    const color = typeof rec.color === "string" && HEX_COLOR.test(rec.color) ? rec.color.toLowerCase() : "";
    const view = typeof rec.view === "string" && VIEWS.has(rec.view as CalendarView) ? (rec.view as CalendarView) : "week";
    if (!isCalendarSpaceId(id) || seen.has(id) || !name || !color) continue;
    if (name.toLowerCase() === MAIN_CALENDAR_SPACE_NAME.toLowerCase()) continue;
    const importedCalendars = importedCalendarsOf(rec.importedCalendars)
      .filter((calendar) => calendar.id.startsWith("feed-") && !feeds.has(calendar.id))
      .slice(0, 30);
    importedCalendars.forEach((calendar) => feeds.add(calendar.id));
    seen.add(id);
    list.push({
      id,
      name,
      icon: quickDisplayIconOf(rec.icon),
      color,
      view,
      importedCalendars,
      includedCalendarIds: idList(rec.includedCalendarIds, 80),
      mutedIds: idList(rec.mutedIds, 80),
      //shortcut-local. never copied onto the main calendar's colors or tags
      colorOverrides: colorMap(rec.colorOverrides),
      smartTags: parseSmartTagsFromUnknown(rec.smartTags),
    });
    if (list.length >= MAX_CALENDAR_SPACES) break;
  }
  return list;
}

export function activeSpaceIdOf(raw: unknown, spaces: CalendarSpace[]): string {
  if (raw === MAIN_CALENDAR_SPACE_ID) return MAIN_CALENDAR_SPACE_ID;
  if (typeof raw === "string" && spaces.some((space) => space.id === raw)) return raw;
  return MAIN_CALENDAR_SPACE_ID;
}

/**feeds that belong to a space and not to main, so the main grid never shows them*/
export function spaceOnlyFeedIds(spaces: CalendarSpace[], mainFeedIds: Iterable<string>): Set<string> {
  const main = new Set(mainFeedIds);
  const ids = new Set<string>();
  for (const space of spaces) {
    for (const calendar of space.importedCalendars) {
      if (!main.has(calendar.id)) ids.add(calendar.id);
    }
  }
  return ids;
}

export function itemOnMainCalendar(importSource: string | undefined, spaceOnly: ReadonlySet<string>): boolean {
  return importSource == null || !spaceOnly.has(importSource);
}

export function itemInCalendarSpace(
  meta: CalendarItemMeta,
  space: CalendarSpace,
  merged: { id: string; members: string[] }[] = [],
): boolean {
  if (meta.importSource && space.importedCalendars.some((calendar) => calendar.id === meta.importSource)) {
    return !space.mutedIds.includes(importedCalendarId(meta.importSource));
  }
  const id = meta.importSource ? importedCalendarId(meta.importSource) : (localCalendarIdOf(meta) ?? "events");
  if (space.includedCalendarIds.includes(id) && !space.mutedIds.includes(id)) return true;
  if (!meta.importSource) return false;
  const owner = merged.find((calendar) => calendar.members.includes(id));
  return owner != null && space.includedCalendarIds.includes(owner.id) && !space.mutedIds.includes(owner.id);
}

export function overlayInCalendarSpace(calendarId: string, space: CalendarSpace): boolean {
  return space.includedCalendarIds.includes(calendarId) && !space.mutedIds.includes(calendarId);
}

export function mapCalendarSpace(
  spaces: CalendarSpace[],
  id: string,
  edit: (space: CalendarSpace) => CalendarSpace,
): CalendarSpace[] {
  return spaces.map((space) => (space.id === id ? edit(space) : space));
}

export function readCalendarSpaces(): { spaces: CalendarSpace[]; activeId: string } {
  if (typeof window === "undefined") return { spaces: [], activeId: MAIN_CALENDAR_SPACE_ID };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    const spaces = calendarSpacesOf(parsed.spaces);
    return { spaces, activeId: activeSpaceIdOf(parsed.activeId, spaces) };
  } catch {
    return { spaces: [], activeId: MAIN_CALENDAR_SPACE_ID };
  }
}

export function writeCalendarSpaces(spaces: CalendarSpace[], activeId: string): void {
  if (typeof window === "undefined") return;
  try {
    const list = calendarSpacesOf(spaces);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      spaces: list,
      activeId: activeSpaceIdOf(activeId, list),
    }));
  } catch {
    return;
  }
}
