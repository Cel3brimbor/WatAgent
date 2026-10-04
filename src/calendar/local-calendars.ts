import type { CalendarItemMeta } from "@/calendar/types";

//calendars under "WatAgent calendars". events/tasks are the built-ins; user-made ones are cal-<uuid> and hold events
export type LocalCalendar = { id: string; name: string; kind: "event" | "task" };

export const PRIMARY_EVENT_CALENDAR_ID = "events";
export const PRIMARY_EVENT_CALENDAR_NAME = "Agent Main";
export const PRIMARY_TASK_CALENDAR_ID = "tasks";
export const PRIMARY_TASK_CALENDAR_NAME = "Tasks";

export function primaryEventCalendar(): LocalCalendar {
  return { id: PRIMARY_EVENT_CALENDAR_ID, name: PRIMARY_EVENT_CALENDAR_NAME, kind: "event" };
}

export function primaryTaskCalendar(): LocalCalendar {
  return { id: PRIMARY_TASK_CALENDAR_ID, name: PRIMARY_TASK_CALENDAR_NAME, kind: "task" };
}

export function isPrimaryEventCalendarId(id: string): boolean {
  return id === PRIMARY_EVENT_CALENDAR_ID;
}

/** Agent Main and Tasks can't be deleted, renamed, hidden, or locked read-only. */
export function isBuiltinLocalCalendarId(id: string): boolean {
  return id === PRIMARY_EVENT_CALENDAR_ID || id === PRIMARY_TASK_CALENDAR_ID;
}

function withPrimaryEventCalendar(list: LocalCalendar[]): LocalCalendar[] {
  const rest = list
    .filter((calendar) => calendar.id !== PRIMARY_EVENT_CALENDAR_ID)
    .map((calendar) =>
      calendar.id === PRIMARY_TASK_CALENDAR_ID ? primaryTaskCalendar() : calendar,
    );
  return [primaryEventCalendar(), ...rest];
}

export const BUILTIN_CALENDARS: LocalCalendar[] = [
  primaryEventCalendar(),
  primaryTaskCalendar(),
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
  return withPrimaryEventCalendar(list).slice(0, 50);
}

/** A deleted Tasks built-in comes back as soon as something lands in it again. Agent Main is always listed. */
export function shownLocalCalendars(list: LocalCalendar[], items: { calendar: CalendarItemMeta }[]): LocalCalendar[] {
  const base = withPrimaryEventCalendar(list);
  const used = new Set(items.map((item) => localCalendarIdOf(item.calendar)));
  const restored = BUILTIN_CALENDARS.filter(
    (builtin) => builtin.id !== PRIMARY_EVENT_CALENDAR_ID && used.has(builtin.id) && !base.some((calendar) => calendar.id === builtin.id),
  );
  return restored.length ? [...restored, ...base] : base;
}

export function newLocalCalendar(name: string): LocalCalendar {
  return { id: `cal-${crypto.randomUUID()}`, name: name.trim().slice(0, 60), kind: "event" };
}

/** Where new events go when no calendar is chosen (always Agent Main). */
export function defaultEventCalendarId(_list: LocalCalendar[]): string {
  return PRIMARY_EVENT_CALENDAR_ID;
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(withPrimaryEventCalendar(list)));
  } catch {
    return;
  }
}
