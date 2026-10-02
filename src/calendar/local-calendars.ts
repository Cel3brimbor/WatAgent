import type { CalendarItemMeta } from "@/calendar/types";

//calendars under "WatAgent calendars". events/tasks are the built-ins; user-made ones are cal-<uuid> and hold events
export type LocalCalendar = { id: string; name: string; kind: "event" | "task" };

export const BUILTIN_CALENDARS: LocalCalendar[] = [
  { id: "events", name: "WatAgent", kind: "event" },
  { id: "tasks", name: "Tasks", kind: "task" },
];

const CUSTOM_ID = /^cal-[0-9a-f-]{36}$/;
const STORAGE_KEY = "watagent.calendar.localCalendars.v1";

export function isLocalCalendarId(id: string): boolean {
  return id === "events" || id === "tasks" || CUSTOM_ID.test(id);
}

/** The WatAgent calendar an item lives in, or null for imported and Google items. */
export function localCalendarIdOf(meta: CalendarItemMeta): string | null {
  if (meta.importSource) return null;
  if (meta.kind === "task") return "tasks";
  return meta.calendarId ?? "events";
}

export function localCalendarsOf(raw: unknown): LocalCalendar[] {
  if (!Array.isArray(raw)) return BUILTIN_CALENDARS;
  const seen = new Set<string>();
  const list: LocalCalendar[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id : "";
    const name = typeof rec.name === "string" ? rec.name.trim().slice(0, 60) : "";
    if (!isLocalCalendarId(id) || !name || seen.has(id)) continue;
    seen.add(id);
    list.push({ id, name, kind: id === "tasks" ? "task" : "event" });
  }
  return list.slice(0, 50);
}

/** A deleted built-in comes back as soon as something lands in it again, so new items always have a home. */
export function shownLocalCalendars(list: LocalCalendar[], items: { calendar: CalendarItemMeta }[]): LocalCalendar[] {
  const used = new Set(items.map((item) => localCalendarIdOf(item.calendar)));
  const restored = BUILTIN_CALENDARS.filter((builtin) => used.has(builtin.id) && !list.some((calendar) => calendar.id === builtin.id));
  return restored.length ? [...restored, ...list] : list;
}

export function newLocalCalendar(name: string): LocalCalendar {
  return { id: `cal-${crypto.randomUUID()}`, name: name.trim().slice(0, 60), kind: "event" };
}

/** Where new events go: the first event calendar still listed, else the built-in WatAgent calendar. */
export function defaultEventCalendarId(list: LocalCalendar[]): string {
  return list.find((calendar) => calendar.kind === "event")?.id ?? "events";
}

/** Item meta field for a chosen calendar; the built-in is stored as no calendarId. */
export function calendarIdField(id: string): string | undefined {
  return CUSTOM_ID.test(id) ? id : undefined;
}

export function readLocalCalendars(): LocalCalendar[] {
  if (typeof window === "undefined") return BUILTIN_CALENDARS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? localCalendarsOf(JSON.parse(raw)) : BUILTIN_CALENDARS;
  } catch {
    return BUILTIN_CALENDARS;
  }
}

export function writeLocalCalendars(list: LocalCalendar[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    return;
  }
}
