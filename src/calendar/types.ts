export type CalendarItemKind = "event" | "task";

//the three original slots, plus feed-<uuid> for every calendar link added since
export type ImportedCalendarSource = "learn" | "portal" | "other" | `feed-${string}`;

export const FEED_ID = /^(learn|portal|other|feed-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export function isFeedId(raw: unknown): raw is ImportedCalendarSource {
  return typeof raw === "string" && FEED_ID.test(raw);
}

/** A calendar link and the name it shows under. Its events carry importSource = id. */
export type ImportedCalendar = { id: ImportedCalendarSource; name: string; url: string };

/** Imported calendars shown as one, each duplicate event once. members are ics:<feed> ids, the first copy's owner first. */
export type MergedCalendar = { id: string; name: string; members: string[] };

export type CalendarItemMeta = {
  kind: CalendarItemKind;
  startUTC: number;
  endUTC: number;
  allDay: boolean;
  completed?: boolean;
  googleEventId?: string;
  icsImportId?: string;
  importSource?: ImportedCalendarSource;
  /** A user-made WatAgent calendar; absent means the built-in WatAgent (events) or Tasks calendar. */
  calendarId?: string;
  location?: string;
  description?: string;
};

export type CalendarItemDoc = {
  id: string;
  title: string;
  calendar: CalendarItemMeta;
  createdAt: number;
  updatedAt: number;
  pendingApproval?: boolean;
  pendingChangeId?: string;
  pendingAction?: "upsert" | "delete";
  pendingVerb?: "add" | "delete" | "edit";
  /** Optimistic row while the item editor is open. */
  editorDraft?: boolean;
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
  importSource?: ImportedCalendarSource;
  /** The merged calendar this imported event shows under. */
  mergedCalendarId?: string;
  calendarId?: string;
  pendingApproval?: boolean;
  pendingVerb?: "add" | "delete" | "edit";
  editorDraft?: boolean;
  google?: GoogleEventDetails;
  location?: string;
  description?: string;
  /** Display-only overlay; never sent to Google or the API. */
  calendarColor?: string;
  smartTag?: { id: string; name: string; color: string; cover: "full" | "half" | "quarter" };
  /** A late due-instant drawn with the all-day items, still due at startUTC. */
  pinned?: boolean;
};

export type CalendarView = "day" | "workweek" | "week" | "month" | "year";

function googleEventIdOf(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!/^[A-Za-z0-9._:-]{1,1024}$/.test(trimmed)) return undefined;
  return trimmed;
}

function optionalText(raw: unknown, max: number, block: boolean): string | undefined {
  if (typeof raw !== "string") return undefined;
  const text = (block ? raw.replace(/\r\n/g, "\n") : raw.replace(/\s+/g, " ")).trim();
  if (!text) return undefined;
  return text.slice(0, max);
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
    endUTC: Number.isFinite(end) && end >= start ? end : start + 60 * 60 * 1000,
    allDay: Boolean(rec.allDay),
    completed: kind === "task" ? Boolean(rec.completed) : undefined,
    googleEventId: googleEventIdOf(rec.googleEventId),
    icsImportId: typeof rec.icsImportId === "string" && /^[0-9a-f-]{36}$/.test(rec.icsImportId) ? rec.icsImportId : undefined,
    importSource: isFeedId(rec.importSource) ? rec.importSource : undefined,
    calendarId: typeof rec.calendarId === "string" && /^cal-[0-9a-f-]{36}$/.test(rec.calendarId) ? rec.calendarId : undefined,
    location: optionalText(rec.location, 300, false),
    description: optionalText(rec.description, 4000, true),
  };
}

export function calendarMetaEqual(a: CalendarItemMeta, b: CalendarItemMeta): boolean {
  return (
    a.kind === b.kind &&
    a.startUTC === b.startUTC &&
    a.endUTC === b.endUTC &&
    a.allDay === b.allDay &&
    a.completed === b.completed &&
    a.googleEventId === b.googleEventId &&
    a.icsImportId === b.icsImportId &&
    a.importSource === b.importSource &&
    a.calendarId === b.calendarId &&
    a.location === b.location &&
    a.description === b.description
  );
}
