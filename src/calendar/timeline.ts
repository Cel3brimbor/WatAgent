import type { CalendarItemDoc, TimelineItem } from "@/calendar/types";
import { localDayBounds } from "@/calendar/date-utils";

export function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB;
}

export type BusyBlock = { startUTC: number; endUTC: number };

export type OverlayEvent = {
  id: string;
  calendarId: string;
  eventId: string;
  editable: boolean;
  deletable: boolean;
  title: string;
  startUTC: number;
  endUTC: number;
  allDay: boolean;
  location?: string;
  description?: string;
  calendarName?: string;
  calendarColor?: string;
  htmlLink?: string;
  meetLink?: string;
  guests?: string[];
  reminder?: string;
};

export function aggregateTimeline(input: {
  focus: Date;
  events: CalendarItemDoc[];
  busyBlocks?: BusyBlock[];
  overlayEvents?: OverlayEvent[];
}): TimelineItem[] {
  const { startDateUTC, endDateUTC } = localDayBounds(input.focus);
  const items: TimelineItem[] = [];
  const seen = new Set<string>();

  function push(item: TimelineItem) {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    items.push(item);
  }

  for (const event of input.events) {
    const meta = event.calendar;
    if (!rangesOverlap(meta.startUTC, meta.endUTC, startDateUTC, endDateUTC)) continue;
    push({
      id: event.id,
      kind: meta.kind,
      title: event.title,
      startUTC: meta.startUTC,
      endUTC: meta.endUTC,
      allDay: meta.allDay,
      completed: meta.completed,
      pendingApproval: event.pendingApproval,
      editorDraft: event.editorDraft,
      location: meta.location,
      description: meta.description,
    });
  }

  for (const event of input.overlayEvents ?? []) {
    if (!rangesOverlap(event.startUTC, event.endUTC, startDateUTC, endDateUTC)) continue;
    push({
      id: `gcal:${event.id}`,
      kind: "gcal_event",
      title: event.title,
      startUTC: event.startUTC,
      endUTC: event.endUTC,
      allDay: event.allDay,
      google: {
        calendarId: event.calendarId,
        eventId: event.eventId,
        editable: event.editable,
        deletable: event.deletable,
        location: event.location,
        description: event.description,
        calendarName: event.calendarName,
        calendarColor: event.calendarColor,
        htmlLink: event.htmlLink,
        meetLink: event.meetLink,
        guests: event.guests,
        reminder: event.reminder,
      },
    });
  }

  for (const block of input.busyBlocks ?? []) {
    if (!rangesOverlap(block.startUTC, block.endUTC, startDateUTC, endDateUTC)) continue;
    push({
      id: `gcal-busy:${block.startUTC}:${block.endUTC}`,
      kind: "gcal_busy",
      title: "Busy",
      startUTC: block.startUTC,
      endUTC: block.endUTC,
      allDay: false,
    });
  }

  items.sort((a, b) => a.startUTC - b.startUTC);
  return items;
}

export function activeDaysInMonth(
  year: number,
  month: number,
  itemsForDay: (date: Date) => TimelineItem[],
): Set<number> {
  const active = new Set<number>();
  const days = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= days; day += 1) {
    if (itemsForDay(new Date(year, month, day)).length > 0) active.add(day);
  }
  return active;
}
