import type { CalendarItemDoc, ImportedCalendar, ImportedCalendarSource, MergedCalendar } from "./types";
import { calendarGroupsOf, type CalendarSourceFilter } from "./preferences";
import { importedCalendarId } from "./imported-calendars";
import { localCalendarIdOf } from "./local-calendars";

export type ExternalCalendarRef = { id: string; name: string; source: ImportedCalendarSource; url?: string };
export const externalCalendarId = importedCalendarId;

/** Every saved external link, then any imported events left without one (an old unnamed import). skipSources are UWaterloo feeds: they have their own list and never become an "Imported calendar" row. */
export function externalCalendarsOf(
  items: CalendarItemDoc[],
  imported: ImportedCalendar[],
  skipSources: ReadonlySet<string> = new Set(),
): ExternalCalendarRef[] {
  const list: ExternalCalendarRef[] = imported.flatMap((calendar) => {
    if (skipSources.has(calendar.id)) return [];
    return [{ id: externalCalendarId(calendar.id), name: calendar.name, source: calendar.id, url: calendar.url }];
  });
  const orphans = new Set<ImportedCalendarSource>();
  for (const item of items) {
    const source = item.calendar.importSource;
    if (source && !skipSources.has(source) && !imported.some((calendar) => calendar.id === source)) orphans.add(source);
  }
  for (const source of orphans) list.push({ id: externalCalendarId(source), name: "Imported calendar", source });
  return list;
}

//the per-calendar part of visibility, shared by imported and merged calendars
export function externalCalendarShown(id: string, filter: CalendarSourceFilter, group: "external" | "campus" = "external"): boolean {
  const groups = calendarGroupsOf(filter.groups);
  if (groups.hidden && filter.hiddenIds.includes(id)) return true;
  if (!(group === "campus" ? groups.campus : groups.external)) return false;
  return !filter.hiddenIds.includes(id) && !filter.mutedGoogleIds.includes(id);
}

/** Members of a merged calendar show or hide with it, not on their own. campusSources are feed ids, not ics: ids. */
export function calendarItemVisible(
  item: CalendarItemDoc,
  filter: CalendarSourceFilter,
  merged: MergedCalendar[] = [],
  campusSources?: ReadonlySet<string>,
): boolean {
  if (item.calendar.importSource) {
    const id = externalCalendarId(item.calendar.importSource);
    const owner = merged.find((calendar) => calendar.members.includes(id));
    const campus = !owner && (campusSources?.has(item.calendar.importSource) ?? false);
    return externalCalendarShown(owner?.id ?? id, filter, campus ? "campus" : "external");
  }
  const groups = calendarGroupsOf(filter.groups);
  const id = localCalendarIdOf(item.calendar) ?? "events";
  if (id === "events") return filter.events && groups.watagent;
  if (groups.hidden && filter.hiddenIds.includes(id)) return true;
  if (!groups.watagent || filter.hiddenIds.includes(id)) return false;
  //user-made calendars share the per-calendar mute list with imported ones
  return !filter.mutedGoogleIds.includes(id);
}
