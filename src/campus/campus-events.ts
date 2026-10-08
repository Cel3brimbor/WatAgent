import { calendarIdField } from "@/calendar/local-calendars";
import type { CalendarItemDoc, CalendarItemMeta, ImportedCalendar, ImportedCalendarSource } from "@/calendar/types";
import { API_BASE_URL } from "@/shared/config";
import { newId } from "@/shared/ids";

/** One category the backend sorts UWaterloo events into, like "careers" or "talks". Drop-in sports carry group "drop-ins". */
export type CampusCategory = { id: string; label: string; hint: string; group?: "drop-ins" };
export type CampusSource = { id: string; name: string; url: string };
export type CampusFaculty = { id: string; label: string };
export type CampusDepartment = { id: string; label: string; faculties: string[] };
export type DepartmentRelevance = { departments: Array<{ id: string; confidence: number; method: "source" | "jev" }>; campusWide: boolean };

/** One occurrence of a public UWaterloo event. All-day events carry their Toronto dates, end exclusive. */
export type CampusEvent = {
  id: string;
  source: string;
  url: string;
  title: string;
  summary?: string;
  location?: string;
  allDay: boolean;
  startUTC: number;
  endUTC: number;
  startDate?: string;
  endDate?: string;
  categories: string[];
  tags: string[];
  departmentRelevance?: DepartmentRelevance;
};

export type CampusEventsStatus = "ready" | "loading" | "off";

/** How far the current scrape has read. done sources are finished; label is the one being read. */
export type CampusScrapeProgress = { done: number; total: number; label: string };

export type CampusEventsPayload = {
  status: CampusEventsStatus;
  updatedAt: number | null;
  /** A scrape is running. The list is still the last finished one until that run ends. */
  updating: boolean;
  progress: CampusScrapeProgress | null;
  categories: CampusCategory[];
  sources: CampusSource[];
  faculties: CampusFaculty[];
  departments: CampusDepartment[];
  events: CampusEvent[];
};

export type CampusEventsMeta = {
  status: CampusEventsStatus;
  updatedAt: number | null;
  updating: boolean;
  progress: CampusScrapeProgress | null;
};

function scrapeProgressOf(raw: unknown): CampusScrapeProgress | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const done = rec.done;
  const total = rec.total;
  const label = typeof rec.label === "string" ? rec.label.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  if (typeof done !== "number" || typeof total !== "number" || !Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return null;
  return { done: Math.max(0, Math.min(Math.floor(done), Math.floor(total))), total: Math.max(1, Math.floor(total)), label };
}

/** "Updated Oct 5", or "Currently updating" while a scrape is still reading. */
export function campusFreshnessLabel(updatedAt: number | null, now: number, updating: boolean): string {
  if (updating) return "Currently updating";
  if (updatedAt == null) return "";
  const minutes = Math.max(0, Math.round((now - updatedAt) / 60_000));
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Updated ${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `Updated ${new Date(updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

/** The backend path that serves campus events as an .ics feed. A calendar link to it is a subscription. */
export const CAMPUS_FEED_PATH = "/api/campus-events/feed.ics";
/** The name a combined subscription used before each category had its own calendar. */
export const CAMPUS_CALENDAR_NAME = "UWaterloo events";

/** Sidebar and calendar names. The events page still prefers the labels the server sends. */
export const CAMPUS_CATEGORY_LABELS: Record<string, string> = {
  academic: "Academic dates",
  careers: "Careers & co-op",
  talks: "Talks & seminars",
  workshops: "Workshops",
  "info-sessions": "Info sessions",
  startups: "Startups & innovation",
  arts: "Arts & culture",
  social: "Social & community",
  wellness: "Health & wellness",
  athletics: "Warriors home games",
  recreation: "Drop-in recreation",
  "rec-badminton": "Badminton",
  "rec-basketball": "Basketball",
  "rec-beach-volleyball": "Beach volleyball",
  "rec-volleyball": "Volleyball",
  "rec-pickleball": "Pickleball",
  "rec-field-house": "Field house",
  "rec-warrior-field": "Warrior field",
  "rec-warrior-zone": "Warrior zone",
  "rec-studio": "Studio",
  "rec-skate": "Rec skate",
  "rec-swim": "Swimming",
  "rec-climbing": "Climbing",
  "rec-fitness": "Fitness centres",
  "rec-group-fitness": "Group fitness",
  "rec-other": "Other drop-ins",
  "open-house": "Open houses & tours",
  defences: "Thesis defences",
  other: "Other",
};

export function campusCategoryLabel(id: string): string {
  return CAMPUS_CATEGORY_LABELS[id] ?? "Other";
}

export function isDropInSport(id: string): boolean {
  return id.startsWith("rec-");
}

/** Whether an event belongs on a category filter. The drop-in row matches every sport. */
export function eventInCampusCategory(event: { categories: string[] }, categoryId: string | null): boolean {
  if (!categoryId) return true;
  if (categoryId === "recreation") return event.categories.some((id) => id === "recreation" || isDropInSport(id));
  return event.categories.includes(categoryId);
}

export function isDefaultCampusCalendarName(name: string): boolean {
  return name === CAMPUS_CALENDAR_NAME || name.startsWith(`${CAMPUS_CALENDAR_NAME}:`);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORY_ID = /^[a-z][a-z-]{0,39}$/;

function line(raw: unknown, max: number): string | undefined {
  if (typeof raw !== "string") return undefined;
  const text = raw.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : undefined;
}

function httpsLink(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function campusEventOf(raw: unknown, known: Set<string>, departments: Set<string>): CampusEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const id = line(rec.id, 200);
  const source = line(rec.source, 60);
  const url = httpsLink(rec.url);
  const title = line(rec.title, 300);
  const startUTC = Number(rec.startUTC);
  const endUTC = Number(rec.endUTC);
  if (!id || !source || !url || !title || !Number.isFinite(startUTC) || !Number.isFinite(endUTC) || endUTC <= startUTC) return null;
  const allDay = rec.allDay === true;
  const startDate = typeof rec.startDate === "string" && DATE.test(rec.startDate) ? rec.startDate : undefined;
  const endDate = typeof rec.endDate === "string" && DATE.test(rec.endDate) ? rec.endDate : undefined;
  if (allDay && (!startDate || !endDate || endDate <= startDate)) return null;
  const categories = Array.isArray(rec.categories) ? rec.categories.filter((entry): entry is string => typeof entry === "string" && known.has(entry)) : [];
  const tags = Array.isArray(rec.tags) ? rec.tags.flatMap((entry) => line(entry, 120) ?? []).slice(0, 20) : [];
  const summary = typeof rec.summary === "string" ? rec.summary.trim().slice(0, 1000) || undefined : undefined;
  const location = line(rec.location, 300);
  return {
    id,
    source,
    url,
    title,
    ...(summary ? { summary } : {}),
    ...(location ? { location } : {}),
    allDay,
    startUTC,
    endUTC,
    ...(allDay ? { startDate, endDate } : {}),
    categories: categories.length > 0 ? categories : ["other"],
    tags,
    departmentRelevance: departmentRelevanceOf(rec.departmentRelevance, departments),
  };
}

function departmentRelevanceOf(raw: unknown, known: Set<string>): DepartmentRelevance {
  const rec = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const entries = Array.isArray(rec.departments) ? rec.departments.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const { id, confidence, method } = raw as Record<string, unknown>;
    return typeof id === "string" && known.has(id) && typeof confidence === "number" && confidence >= 0.8 && confidence <= 1 &&
      (method === "source" || method === "jev") ? [{ id, confidence, method }] : [];
  }) : [];
  return { departments: [...new Map(entries.map((entry) => [entry.id, entry])).values()] as DepartmentRelevance["departments"], campusWide: rec.campusWide === true };
}

/** Department choices match independently of event type; general campus events are optional. */
export function eventInCampusDepartment(event: CampusEvent, department: string, includeCampusWide = true): boolean {
  if (!department) return true;
  const relevance = event.departmentRelevance;
  if (department === "campus-wide") return relevance?.campusWide === true;
  if (department === "unclassified") return !relevance?.campusWide && !relevance?.departments.length;
  return relevance?.departments.some((entry) => entry.id === department && entry.confidence >= 0.8) === true ||
    (includeCampusWide && relevance?.campusWide === true);
}

/**
 * True only when the server scrape is strictly newer than the one already applied.
 * A missing or unusable server time never syncs. A missing applied time does, once.
 */
export function campusScrapeIsNewer(server: number | null | undefined, applied: number | null | undefined): boolean {
  if (typeof server !== "number" || !Number.isFinite(server) || server <= 0) return false;
  if (typeof applied !== "number" || !Number.isFinite(applied) || applied <= 0) return true;
  return server > applied;
}

/** The /api/campus-events payload, keeping only what reads cleanly. */
export function campusEventsOf(raw: unknown): CampusEventsPayload {
  const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const categories: CampusCategory[] = Array.isArray(rec.categories)
    ? rec.categories.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const { id, label, hint, group } = entry as Record<string, unknown>;
        const name = line(label, 60);
        if (typeof id !== "string" || !CATEGORY_ID.test(id) || !name) return [];
        return [{ id, label: name, hint: line(hint, 200) ?? "", ...(group === "drop-ins" ? { group: "drop-ins" as const } : {}) }];
      })
    : [];
  const known = new Set(categories.map((category) => category.id));
  known.add("other");
  const sources: CampusSource[] = Array.isArray(rec.sources)
    ? rec.sources.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const { id, name, url } = entry as Record<string, unknown>;
        const sourceId = line(id, 60);
        const label = line(name, 80);
        const link = httpsLink(url);
        return sourceId && label && link ? [{ id: sourceId, name: label, url: link }] : [];
      })
    : [];
  const faculties: CampusFaculty[] = Array.isArray(rec.faculties) ? rec.faculties.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { id, label } = entry as Record<string, unknown>;
    return typeof id === "string" && CATEGORY_ID.test(id) && line(label, 80) ? [{ id, label: line(label, 80)! }] : [];
  }) : [];
  const facultyIds = new Set(faculties.map((entry) => entry.id));
  const departments: CampusDepartment[] = Array.isArray(rec.departments) ? rec.departments.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { id, label, faculties: rawFaculties } = entry as Record<string, unknown>;
    const groups = Array.isArray(rawFaculties) ? rawFaculties.filter((id): id is string => typeof id === "string" && facultyIds.has(id)) : [];
    return typeof id === "string" && /^[a-z][a-z-]{0,79}$/.test(id) && line(label, 120) && groups.length
      ? [{ id, label: line(label, 120)!, faculties: groups }] : [];
  }) : [];
  const departmentIds = new Set(departments.map((entry) => entry.id));
  const events = Array.isArray(rec.events) ? rec.events.map((entry) => campusEventOf(entry, known, departmentIds)).filter((event): event is CampusEvent => event != null) : [];
  const status: CampusEventsStatus = rec.status === "loading" || rec.status === "off" ? rec.status : "ready";
  const updatedAt = typeof rec.updatedAt === "number" && Number.isFinite(rec.updatedAt) ? rec.updatedAt : null;
  return {
    status,
    updatedAt,
    updating: rec.updating === true,
    progress: scrapeProgressOf(rec.progress),
    categories,
    sources,
    faculties,
    departments,
    events: events.sort((a, b) => a.startUTC - b.startUTC),
  };
}

/** The small status payload. A missing updating flag means this server isn't reporting a run. */
export function campusEventsMetaOf(raw: unknown): CampusEventsMeta {
  const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const status: CampusEventsStatus = rec.status === "loading" || rec.status === "off" ? rec.status : "ready";
  const updatedAt = typeof rec.updatedAt === "number" && Number.isFinite(rec.updatedAt) ? rec.updatedAt : null;
  return { status, updatedAt, updating: rec.updating === true, progress: scrapeProgressOf(rec.progress) };

}

/** The subscription link for these categories; none means every event. Calendar links must be https or webcal, so a plain-http API (development) gets webcal. */
export function campusFeedUrl(categories: string[], base = API_BASE_URL): string {
  const origin = base || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  const url = new URL(CAMPUS_FEED_PATH, origin);
  const ids = categories.filter((id) => CATEGORY_ID.test(id));
  url.search = ids.length > 0 ? `?categories=${ids.join(",")}` : "";
  return url.protocol === "http:" ? `webcal:${url.href.slice("http:".length)}` : url.href;
}

/** The categories a campus subscription link asks for, or null when the link isn't one. */
export function campusFeedCategories(link: string): string[] | null {
  let url: URL;
  try {
    url = new URL(link.trim().replace(/^webcal:/i, "https:"));
  } catch {
    return null;
  }
  if (url.pathname.replace(/\/$/, "") !== CAMPUS_FEED_PATH) return null;
  return [...new Set((url.searchParams.get("categories") ?? "").split(",").map((part) => part.trim()).filter((id) => CATEGORY_ID.test(id)))];
}

export type CampusCalendar = { calendar: ImportedCalendar; categories: string[] };

/**
 * UWaterloo event calendars are their own list. A campus feed that was saved with external links moves over,
 * and a feed id can't sit in both lists.
 */
export function splitCampusCalendars(
  imported: ImportedCalendar[],
  campus: ImportedCalendar[] = [],
): { imported: ImportedCalendar[]; campus: ImportedCalendar[] } {
  const campusById = new Map<string, ImportedCalendar>();
  for (const calendar of campus) {
    if (campusFeedCategories(calendar.url) == null || campusById.has(calendar.id)) continue;
    campusById.set(calendar.id, calendar);
  }
  const external: ImportedCalendar[] = [];
  for (const calendar of imported) {
    if (campusFeedCategories(calendar.url) != null) {
      if (!campusById.has(calendar.id)) campusById.set(calendar.id, calendar);
      continue;
    }
    if (!campusById.has(calendar.id)) external.push(calendar);
  }
  return { imported: external, campus: [...campusById.values()] };
}

/** Every calendar that subscribes to the campus feed, in the order they were saved. */
export function campusCalendarsOf(imported: ImportedCalendar[]): CampusCalendar[] {
  return imported.flatMap((calendar) => {
    const categories = campusFeedCategories(calendar.url);
    return categories ? [{ calendar, categories }] : [];
  });
}

/** The categories a subscription toggle leaves behind, in the server's order. */
export function toggledCategories(current: string[], id: string, on: boolean, order: CampusCategory[]): string[] {
  const next = new Set(current);
  if (on) next.add(id);
  else next.delete(id);
  return order.map((category) => category.id).filter((categoryId) => next.has(categoryId));
}

function localDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** An event's start and end on this device. All-day events sit on local midnights, like every all-day item in the app. */
export function localSpan(event: CampusEvent): { startUTC: number; endUTC: number } {
  if (event.allDay && event.startDate && event.endDate) {
    return { startUTC: localDate(event.startDate).getTime(), endUTC: localDate(event.endDate).getTime() };
  }
  return { startUTC: event.startUTC, endUTC: event.endUTC };
}

//drop-in hours that cross midnight but finish before morning; not a multi-day event.
export function campusOvernightSession(startUTC: number, endUTC: number): boolean {
  if (endUTC <= startUTC) return false;
  const span = endUTC - startUTC;
  if (span > 20 * 60 * 60 * 1000) return false;
  const start = new Date(startUTC);
  const end = new Date(endUTC);
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const dayGap = (endDay.getTime() - startDay.getTime()) / 86_400_000;
  return dayGap === 1;
}

function plain(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function campusEventDescription(event: CampusEvent): string {
  return [event.summary, event.url].filter(Boolean).join("\n\n").slice(0, 4000);
}

/** Events already loaded for this category, shaped like calendar rows so a toggle can show them before the server writes them. */
export function campusCalendarItems(events: CampusEvent[], feedId: ImportedCalendarSource, categoryId: string): CalendarItemDoc[] {
  const now = Date.now();
  return events.flatMap((event) => {
    if (!eventInCampusCategory(event, categoryId)) return [];
    const span = localSpan(event);
    if (span.endUTC <= span.startUTC) return [];
    const title = event.title.trim().slice(0, 200) || "Event";
    return [{
      id: newId(),
      title,
      createdAt: now,
      updatedAt: now,
      calendar: {
        kind: "event" as const,
        ...span,
        allDay: event.allDay,
        importSource: feedId,
        ...(event.location ? { location: event.location.slice(0, 300) } : {}),
        description: campusEventDescription(event),
      },
    }];
  });
}

/** A calendar item for one occurrence, on a WatAgent calendar. */
export function campusEventMeta(event: CampusEvent, calendarId: string): CalendarItemMeta {
  const span = localSpan(event);
  return {
    kind: "event",
    ...span,
    allDay: event.allDay,
    calendarId: calendarIdField(calendarId),
    ...(event.location ? { location: event.location.slice(0, 300) } : {}),
    description: campusEventDescription(event),
  };
}

export type CampusPlacement = "added" | "subscribed" | null;

/**
 * Where an occurrence already is on your calendars: copied into one of your own ("added"), or on one of the
 * category calendars ("subscribed"). Items match on title and start, the way the importer recognizes them.
 */
export function campusPlacements(items: CalendarItemDoc[], subscriptionFeeds: readonly string[]): (event: CampusEvent) => CampusPlacement {
  const feeds = new Set(subscriptionFeeds);
  const found = new Map<string, CampusPlacement>();
  for (const item of items) {
    if (item.calendar.kind !== "event" || item.pendingApproval) continue;
    const key = `${plain(item.title)}\0${item.calendar.startUTC}`;
    if (!item.calendar.importSource) found.set(key, "added");
    else if (feeds.has(item.calendar.importSource) && !found.has(key)) found.set(key, "subscribed");
  }
  return (event) => found.get(`${plain(event.title.slice(0, 200))}\0${localSpan(event).startUTC}`) ?? null;
}

export function matchesCampusQuery(event: CampusEvent, query: string): boolean {
  const words = plain(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const text = plain([event.title, event.summary, event.location, ...event.tags].filter(Boolean).join(" "));
  return words.every((word) => text.includes(word));
}

/** A repeating event's occurrences: same page, same title. The first one still to come leads. */
export type CampusSeries = { key: string; next: CampusEvent; more: CampusEvent[] };
export type CampusDay = { key: string; date: Date; series: CampusSeries[] };

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Events grouped by the day they show under: their start day, or today while one that started earlier is still on. */
export function campusDays(events: CampusEvent[], now: number): CampusDay[] {
  const series = new Map<string, CampusSeries>();
  for (const event of [...events].sort((a, b) => localSpan(a).startUTC - localSpan(b).startUTC)) {
    if (localSpan(event).endUTC <= now) continue;
    const key = `${event.source}\0${event.url}\0${plain(event.title)}`;
    const found = series.get(key);
    if (found) found.more.push(event);
    else series.set(key, { key, next: event, more: [] });
  }
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = new Map<string, CampusDay>();
  for (const entry of series.values()) {
    const start = new Date(localSpan(entry.next).startUTC);
    start.setHours(0, 0, 0, 0);
    const date = start < today ? today : start;
    const key = dayKey(date);
    const day = days.get(key) ?? { key, date, series: [] };
    day.series.push(entry);
    days.set(key, day);
  }
  return [...days.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

function utcStamp(utc: number): string {
  return new Date(utc).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function dateValue(date: string): string {
  return date.replace(/-/g, "");
}

/** Google Calendar's own add-event page, filled in. */
export function googleCalendarLink(event: CampusEvent): string {
  const dates =
    event.allDay && event.startDate && event.endDate
      ? `${dateValue(event.startDate)}/${dateValue(event.endDate)}`
      : `${utcStamp(event.startUTC)}/${utcStamp(event.endUTC)}`;
  const params = new URLSearchParams({ action: "TEMPLATE", text: event.title, dates, details: campusEventDescription(event) });
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function icsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

//lines stay within 75 octets; the rest continues on lines that start with a space, never splitting a character
function foldLine(text: string): string[] {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of text) {
    const size = encoder.encode(char).length;
    if (bytes + size > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.map((part, index) => (index === 0 ? part : ` ${part}`));
}

/** One event as an .ics file, for Apple Calendar, Outlook and anything else that opens them. */
export function campusEventIcs(event: CampusEvent, stampUTC: number): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WatAgent//Campus events//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT", `UID:${event.id}@watagent`, `DTSTAMP:${utcStamp(stampUTC)}`];
  if (event.allDay && event.startDate && event.endDate) {
    lines.push(`DTSTART;VALUE=DATE:${dateValue(event.startDate)}`, `DTEND;VALUE=DATE:${dateValue(event.endDate)}`);
  } else {
    lines.push(`DTSTART:${utcStamp(event.startUTC)}`, `DTEND:${utcStamp(event.endUTC)}`);
  }
  lines.push(`SUMMARY:${icsText(event.title)}`);
  if (event.location) lines.push(`LOCATION:${icsText(event.location)}`);
  lines.push(`DESCRIPTION:${icsText(campusEventDescription(event))}`, `URL:${event.url}`, "END:VEVENT", "END:VCALENDAR");
  return `${lines.flatMap(foldLine).join("\r\n")}\r\n`;
}

export function icsFileName(event: CampusEvent): string {
  const slug = plain(event.title).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${slug || "event"}.ics`;
}
