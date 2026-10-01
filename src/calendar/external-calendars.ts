import type { CalendarItemDoc, CalendarNames, CalendarPriorityOrder } from "./types";
import type { CalendarSourceFilter } from "./preferences";

export type ExternalCalendarRef = { id: string; name: string; source: "learn" | "portal" | "other" };
export function externalCalendarId(source: string): string { return `ics:${source}`; }
export function externalCalendarsOf(items: CalendarItemDoc[], names: CalendarNames, order: CalendarPriorityOrder): ExternalCalendarRef[] {
  const present = new Set(items.map((item) => item.calendar.importSource));
  return [...order, "other" as const].filter((source) => present.has(source)).map((source) => ({
    id: externalCalendarId(source), source,
    name: source === "other" ? "Imported calendar" : names[source] || (source === "learn" ? "LEARN / Brightspace" : "Portal"),
  }));
}
export function calendarItemVisible(item: CalendarItemDoc, filter: CalendarSourceFilter): boolean {
  if (item.calendar.importSource) {
    const id = externalCalendarId(item.calendar.importSource);
    return !filter.hiddenIds.includes(id) && !filter.mutedGoogleIds.includes(id);
  }
  const id = item.calendar.kind === "task" ? "tasks" : "events";
  return filter[id] && !filter.hiddenIds.includes(id);
}
