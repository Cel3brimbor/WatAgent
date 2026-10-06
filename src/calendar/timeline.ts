import type { CalendarItemDoc, TimelineItem } from "@/calendar/types";
import { localDayBounds } from "@/calendar/date-utils";

export function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB;
}

const HOUR_MS = 60 * 60 * 1000;
//past this on the next morning, a session is still going and belongs on that day too
const MORNING_MS = 6 * HOUR_MS;

function localMidnightUTC(instant: number): number {
  const date = new Date(instant);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

//a saved instant still has to occupy the hour google calendar draws, including the part after midnight
function drawnEnd(kind: TimelineItem["kind"], allDay: boolean, startUTC: number, endUTC: number): number {
  if (allDay || kind === "task" || endUTC !== startUTC) return endUTC;
  return startUTC + HOUR_MS;
}

//6:30pm–12:30am is Saturday night. the half hour after midnight is not a Sunday event
function shownOnDay(startUTC: number, endUTC: number, dayStart: number, dayEnd: number): boolean {
  const end = endUTC > startUTC ? endUTC : startUTC + HOUR_MS;
  if (!rangesOverlap(startUTC, end, dayStart, dayEnd)) return false;
  if (localMidnightUTC(startUTC) === dayStart) return true;
  return end > dayStart + MORNING_MS;
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

export function timelineItemOf(event: CalendarItemDoc): TimelineItem {
  const meta = event.calendar;
  return {
    id: event.id,
    kind: meta.kind,
    title: event.title,
    startUTC: meta.startUTC,
    endUTC: drawnEnd(meta.kind, meta.allDay, meta.startUTC, meta.endUTC),
    allDay: meta.allDay,
    completed: meta.completed,
    importSource: meta.importSource,
    calendarId: meta.calendarId,
    pendingApproval: event.pendingApproval,
    pendingVerb: event.pendingVerb,
    editorDraft: event.editorDraft,
    location: meta.location,
    description: meta.description,
  };
}

export function overlayTimelineItemOf(event: OverlayEvent): TimelineItem {
  return {
    id: `gcal:${event.id}`,
    kind: "gcal_event",
    title: event.title,
    startUTC: event.startUTC,
    endUTC: drawnEnd("gcal_event", event.allDay, event.startUTC, event.endUTC),
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
  };
}

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
    if (!shownOnDay(meta.startUTC, meta.endUTC, startDateUTC, endDateUTC)) continue;
    push(timelineItemOf(event));
  }

  for (const event of input.overlayEvents ?? []) {
    if (!shownOnDay(event.startUTC, event.endUTC, startDateUTC, endDateUTC)) continue;
    push(overlayTimelineItemOf(event));
  }

  for (const block of input.busyBlocks ?? []) {
    if (!shownOnDay(block.startUTC, block.endUTC, startDateUTC, endDateUTC)) continue;
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
