export type CalendarItemKind = "event" | "task";

export type CalendarItemMeta = {
  kind: CalendarItemKind;
  startUTC: number;
  endUTC: number;
  allDay: boolean;
  completed?: boolean;
  googleEventId?: string;
};

export type CalendarItemDoc = {
  id: string;
  title: string;
  calendar: CalendarItemMeta;
  createdAt: number;
  updatedAt: number;
};

export type TimelineKind = "event" | "task" | "gcal_busy" | "gcal_event";

export type GoogleEventDetails = {
  calendarId?: string;
  eventId?: string;
  editable?: boolean;
  deletable?: boolean;
  location?: string;
  description?: string;
  calendarName?: string;
  calendarColor?: string;
  htmlLink?: string;
  meetLink?: string;
  guests?: string[];
  reminder?: string;
};

export type TimelineItem = {
  id: string;
  kind: TimelineKind;
  title: string;
  startUTC: number;
  endUTC: number;
  allDay: boolean;
  completed?: boolean;
  google?: GoogleEventDetails;
};

export type CalendarView = "day" | "week" | "month" | "year";

function googleEventIdOf(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!/^[A-Za-z0-9._:-]{1,1024}$/.test(trimmed)) return undefined;
  return trimmed;
}

export function parseCalendarMeta(raw: unknown): CalendarItemMeta | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as Record<string, unknown>;
  const start = Number(rec.startUTC);
  const end = Number(rec.endUTC);
  if (!Number.isFinite(start) || start <= 0) return undefined;
  const kind: CalendarItemKind = rec.kind === "task" ? "task" : "event";
  return {
    kind,
    startUTC: start,
    endUTC: Number.isFinite(end) && end > start ? end : start + 60 * 60 * 1000,
    allDay: Boolean(rec.allDay),
    completed: kind === "task" ? Boolean(rec.completed) : undefined,
    googleEventId: googleEventIdOf(rec.googleEventId),
  };
}

export function calendarMetaEqual(a: CalendarItemMeta, b: CalendarItemMeta): boolean {
  return (
    a.kind === b.kind &&
    a.startUTC === b.startUTC &&
    a.endUTC === b.endUTC &&
    a.allDay === b.allDay &&
    a.completed === b.completed &&
    a.googleEventId === b.googleEventId
  );
}
