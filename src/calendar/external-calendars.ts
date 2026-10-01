import type { CalendarItemDoc, CalendarLinks, CalendarNames, CalendarPriorityOrder } from "./types";
import { calendarGroupsOf, type CalendarSourceFilter } from "./preferences";

export type ExternalCalendarRef = { id: string; name: string; source: "learn" | "portal" | "other" };
export function externalCalendarId(source: string): string { return `ics:${source}`; }
export function externalCalendarsOf(
  items: CalendarItemDoc[],
  names: CalendarNames,
  order: CalendarPriorityOrder,
  links: CalendarLinks = {},
): ExternalCalendarRef[] {
  const present = new Set(items.map((item) => item.calendar.importSource));
  const sources: Array<"learn" | "portal" | "other"> = [];
  for (const source of order) {
    if ((source === "learn" || source === "portal") && links[source] && present.has(source)) sources.push(source);
  }
  if (present.has("other")) sources.push("other");
  return sources.map((source) => ({
    id: externalCalendarId(source), source,
    name: source === "other" ? "Imported calendar" : names[source] || (source === "learn" ? "LEARN / Brightspace" : "Portal"),
  }));
}
export function calendarItemVisible(item: CalendarItemDoc, filter: CalendarSourceFilter): boolean {
  const groups = calendarGroupsOf(filter.groups);
  if (item.calendar.importSource) {
    const id = externalCalendarId(item.calendar.importSource);
    if (groups.hidden && filter.hiddenIds.includes(id)) return true;
    if (!groups.external) return false;
    return !filter.hiddenIds.includes(id) && !filter.mutedGoogleIds.includes(id);
  }
  const id = item.calendar.kind === "task" ? "tasks" : "events";
  if (groups.hidden && filter.hiddenIds.includes(id)) return true;
  if (!groups.watagent) return false;
  return filter[id] && !filter.hiddenIds.includes(id);
}
