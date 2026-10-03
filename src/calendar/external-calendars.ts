import type { CalendarItemDoc, ImportedCalendar, ImportedCalendarSource, MergedCalendar } from "./types";
import { calendarGroupsOf, type CalendarSourceFilter } from "./preferences";
import { importedCalendarId } from "./imported-calendars";
import { localCalendarIdOf } from "./local-calendars";

export type ExternalCalendarRef = { id: string; name: string; source: ImportedCalendarSource; url?: string };
export const externalCalendarId = importedCalendarId;

/** Every saved link, then any imported events left without one (an old unnamed import). */
export function externalCalendarsOf(items: CalendarItemDoc[], imported: ImportedCalendar[]): ExternalCalendarRef[] {
  const list: ExternalCalendarRef[] = imported.map((calendar) => ({
    id: externalCalendarId(calendar.id),
    name: calendar.name,
    source: calendar.id,
    url: calendar.url,
  }));
  const orphans = new Set<ImportedCalendarSource>();
  for (const item of items) {
    const source = item.calendar.importSource;
    if (source && !imported.some((calendar) => calendar.id === source)) orphans.add(source);
  }
  for (const source of orphans) list.push({ id: externalCalendarId(source), name: "Imported calendar", source });
  return list;
}

//the per-calendar part of visibility, shared by imported and merged calendars
export function externalCalendarShown(id: string, filter: CalendarSourceFilter): boolean {
  const groups = calendarGroupsOf(filter.groups);
  if (groups.hidden && filter.hiddenIds.includes(id)) return true;
  if (!groups.external) return false;
  return !filter.hiddenIds.includes(id) && !filter.mutedGoogleIds.includes(id);
}

/** Members of a merged calendar show or hide with it, not on their own. */
export function calendarItemVisible(item: CalendarItemDoc, filter: CalendarSourceFilter, merged: MergedCalendar[] = []): boolean {
  if (item.calendar.importSource) {
    const id = externalCalendarId(item.calendar.importSource);
    const owner = merged.find((calendar) => calendar.members.includes(id));
    return externalCalendarShown(owner?.id ?? id, filter);
  }
  const groups = calendarGroupsOf(filter.groups);
  const id = localCalendarIdOf(item.calendar) ?? "events";
  if (groups.hidden && filter.hiddenIds.includes(id)) return true;
  if (!groups.watagent || filter.hiddenIds.includes(id)) return false;
  //user-made calendars share the per-calendar mute list with imported ones
  return id === "events" || id === "tasks" ? filter[id] : !filter.mutedGoogleIds.includes(id);
}
