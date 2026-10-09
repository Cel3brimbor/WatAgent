import type { CalendarDraft } from "@/calendar/calendar-item-editor";
import { externalCalendarId } from "@/calendar/external-calendars";
import { defaultEventCalendarId, localCalendarIdOf, type LocalCalendar } from "@/calendar/local-calendars";
import type { CalendarItemDoc, CalendarItemMeta, TimelineItem } from "@/calendar/types";

export function timelineItemCalendarId(item: Pick<TimelineItem, "kind" | "calendarId" | "importSource">): string | null {
  if (item.kind !== "event" && item.kind !== "task") return null;
  return calendarIdForMeta({
    kind: item.kind,
    startUTC: 0,
    endUTC: 0,
    allDay: false,
    calendarId: item.calendarId,
    importSource: item.importSource,
  });
}

export function calendarIdForMeta(meta: CalendarItemMeta): string | null {
  if (meta.importSource) return externalCalendarId(meta.importSource);
  return localCalendarIdOf(meta);
}

export function calendarIdForDraft(
  draft: CalendarDraft,
  items: CalendarItemDoc[],
  localCalendars: LocalCalendar[],
): string {
  if (draft.id) {
    const row = items.find((item) => item.id === draft.id);
    if (row) {
      const id = calendarIdForMeta(row.calendar);
      if (id) return id;
    }
  }
  return draft.calendarId ?? defaultEventCalendarId(localCalendars);
}
