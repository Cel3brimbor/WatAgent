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

export function localDayKey(instant: number): string {
  const date = new Date(instant);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

//local YYYY-MM-DD keys this interval occupies. past 6am the next morning it lands on both days
export function localDaysTouched(startUTC: number, endUTC: number): string[] {
  if (!Number.isFinite(startUTC)) return [];
  const drawnEnd = endUTC > startUTC ? endUTC : startUTC + HOUR_MS;
  const keys: string[] = [];
  const cursor = new Date(startUTC);
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < 400; i += 1) {
    const dayStart = cursor.getTime();
    if (dayStart >= drawnEnd) break;
    const next = new Date(cursor);
    next.setDate(next.getDate() + 1);
    const dayEnd = next.getTime();
    if (shownOnDay(startUTC, endUTC, dayStart, dayEnd)) keys.push(localDayKey(dayStart));
    if (dayEnd <= dayStart) break;
    cursor.setTime(dayEnd);
  }
  return keys;
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
  events: readonly CalendarItemDoc[];
  busyBlocks?: readonly BusyBlock[];
  overlayEvents?: readonly OverlayEvent[];
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

function sameList(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function sameSmartTag(a: TimelineItem["smartTag"], b: TimelineItem["smartTag"]): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return a.id === b.id && a.name === b.name && a.color === b.color && a.cover === b.cover;
}

function sameGoogle(a: TimelineItem["google"], b: TimelineItem["google"]): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return a.calendarId === b.calendarId
    && a.eventId === b.eventId
    && a.editable === b.editable
    && a.deletable === b.deletable
    && a.location === b.location
    && a.description === b.description
    && a.calendarName === b.calendarName
    && a.calendarColor === b.calendarColor
    && a.htmlLink === b.htmlLink
    && a.meetLink === b.meetLink
    && a.reminder === b.reminder
    && sameList(a.guests, b.guests);
}

//card identity: paint fields plus what onOpen reads off the item
export function sameTimelineItem(a: TimelineItem, b: TimelineItem): boolean {
  if (a === b) return true;
  return a.id === b.id
    && a.kind === b.kind
    && a.title === b.title
    && a.startUTC === b.startUTC
    && a.endUTC === b.endUTC
    && a.allDay === b.allDay
    && a.completed === b.completed
    && a.location === b.location
    && a.description === b.description
    && a.calendarColor === b.calendarColor
    && a.calendarId === b.calendarId
    && a.importSource === b.importSource
    && a.mergedCalendarId === b.mergedCalendarId
    && a.pendingApproval === b.pendingApproval
    && a.pendingVerb === b.pendingVerb
    && a.editorDraft === b.editorDraft
    && a.pinned === b.pinned
    && a.pinnedDueUTC === b.pinnedDueUTC
    && sameSmartTag(a.smartTag, b.smartTag)
    && sameGoogle(a.google, b.google);
}

//keep the previous object when the card did not change, so memo can skip it
export function reuseStableItems(prev: readonly TimelineItem[] | null, next: TimelineItem[]): TimelineItem[] {
  if (!prev) return next;
  if (prev.length === 0 && next.length === 0) return prev as TimelineItem[];
  const byId = new Map<string, TimelineItem>();
  for (const item of prev) if (!byId.has(item.id)) byId.set(item.id, item);
  let sameArray = prev.length === next.length;
  const out: TimelineItem[] = [];
  for (let i = 0; i < next.length; i += 1) {
    const item = next[i];
    const old = byId.get(item.id);
    if (old && sameTimelineItem(old, item)) {
      out.push(old);
      if (prev[i] !== old) sameArray = false;
    } else {
      out.push(item);
      sameArray = false;
    }
  }
  return sameArray ? (prev as TimelineItem[]) : out;
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
