import { apiJson } from "@/shared/api-base";
import { calendarItemsOf } from "@/calendar/client";
import type { CalendarItemDoc } from "@/calendar/types";
import type { BusyBlock, OverlayEvent } from "@/calendar/timeline";

export type GoogleCalendarStatus = {
  connected: boolean;
  email: string | null;
  lastSyncedAt: number | null;
};

export type GoogleCalendarRef = {
  id: string;
  name: string;
  color?: string;
  group: "mine" | "other";
};

export type GoogleSyncResult = {
  items: CalendarItemDoc[];
  deletedIds: string[];
  busyBlocks: BusyBlock[];
  overlayEvents: OverlayEvent[];
  calendars: GoogleCalendarRef[];
  lastSyncedAt: number;
};

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function text(raw: unknown, max: number): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.slice(0, max) : undefined;
}

function finite(raw: unknown): number | null {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function overlayOf(raw: unknown): OverlayEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const startUTC = finite(rec.startUTC);
  const endUTC = finite(rec.endUTC);
  const id = text(rec.id, 512);
  const calendarId = text(rec.calendarId, 1024);
  const eventId = text(rec.eventId, 1024);
  if (!id || !calendarId || !eventId) return null;
  if (startUTC == null || endUTC == null || endUTC <= startUTC) return null;
  return {
    id,
    calendarId,
    eventId,
    editable: rec.editable === true,
    deletable: rec.deletable === true,
    title: text(rec.title, 200) ?? "Busy",
    startUTC,
    endUTC,
    allDay: Boolean(rec.allDay),
    location: text(rec.location, 300),
    description: text(rec.description, 4000),
    calendarName: text(rec.calendarName, 120),
    calendarColor:
      typeof rec.calendarColor === "string" && COLOR_RE.test(rec.calendarColor)
        ? rec.calendarColor
        : undefined,
    htmlLink: text(rec.htmlLink, 2048),
    meetLink: text(rec.meetLink, 2048),
    guests: Array.isArray(rec.guests)
      ? rec.guests
          .map((guest) => text(guest, 120))
          .filter((guest): guest is string => Boolean(guest))
          .slice(0, 12)
      : undefined,
    reminder: text(rec.reminder, 200),
  };
}

function calendarRefOf(raw: unknown): GoogleCalendarRef | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const id = text(rec.id, 1024);
  const name = text(rec.name, 120);
  if (!id || !name) return null;
  const color =
    typeof rec.color === "string" && COLOR_RE.test(rec.color) ? rec.color.toLowerCase() : undefined;
  return { id, name, color, group: rec.group === "mine" ? "mine" : "other" };
}

function busyOf(raw: unknown): BusyBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const startUTC = finite(rec.startUTC);
  const endUTC = finite(rec.endUTC);
  if (startUTC == null || endUTC == null || endUTC <= startUTC) return null;
  return { startUTC, endUTC };
}

export async function getGoogleCalendarStatus(): Promise<GoogleCalendarStatus> {
  const payload = await apiJson<Record<string, unknown>>(
    "/api/integrations/google-calendar/status",
  );
  return {
    connected: payload.connected === true,
    email: typeof payload.email === "string" ? payload.email : null,
    lastSyncedAt: finite(payload.lastSyncedAt),
  };
}

export async function startWebGoogleConnect(): Promise<string> {
  const payload = await apiJson<{ url?: unknown }>(
    "/api/integrations/google-calendar/connect?target=web",
  );
  if (typeof payload.url !== "string" || !payload.url.startsWith("https://accounts.google.com/")) {
    throw new Error("Unable to start Google sign-in.");
  }
  return payload.url;
}

export async function startIosGoogleConnect(): Promise<{
  url: string;
  state: string;
  callbackScheme: string;
}> {
  const payload = await apiJson<{ url?: unknown; state?: unknown; callbackScheme?: unknown }>(
    "/api/integrations/google-calendar/connect?target=ios",
  );
  if (
    typeof payload.url !== "string" ||
    !payload.url.startsWith("https://accounts.google.com/") ||
    typeof payload.state !== "string" ||
    typeof payload.callbackScheme !== "string" ||
    !/^com\.googleusercontent\.apps\.[A-Za-z0-9.-]+$/.test(payload.callbackScheme)
  ) {
    throw new Error("Unable to start Google sign-in.");
  }
  return { url: payload.url, state: payload.state, callbackScheme: payload.callbackScheme };
}

export async function completeIosGoogleConnect(code: string, state: string): Promise<void> {
  await apiJson("/api/integrations/google-calendar/callback", {
    method: "POST",
    body: JSON.stringify({ code, state }),
  });
}

export async function disconnectGoogleCalendar(): Promise<void> {
  await apiJson("/api/integrations/google-calendar/disconnect", { method: "POST" });
}

function timeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export async function updateGoogleEvent(input: {
  calendarId: string;
  eventId: string;
  title: string;
  startUTC: number;
  endUTC: number;
  allDay: boolean;
}): Promise<void> {
  await apiJson("/api/integrations/google-calendar/events", {
    method: "POST",
    body: JSON.stringify({ ...input, title: input.title.slice(0, 200), timeZone: timeZone() }),
  });
}

export async function deleteGoogleEvent(input: { calendarId: string; eventId: string }): Promise<void> {
  await apiJson("/api/integrations/google-calendar/events", {
    method: "DELETE",
    body: JSON.stringify(input),
  });
}

export async function syncGoogleCalendar(range: {
  rangeStartUTC: number;
  rangeEndUTC: number;
}): Promise<GoogleSyncResult> {
  const payload = await apiJson<Record<string, unknown>>(
    "/api/integrations/google-calendar/sync",
    {
      method: "POST",
      body: JSON.stringify({
        ...range,
        timeZone: timeZone(),
      }),
    },
  );
  return {
    items: calendarItemsOf(payload.items),
    deletedIds: Array.isArray(payload.deletedIds)
      ? payload.deletedIds.filter((id): id is string => typeof id === "string")
      : [],
    busyBlocks: Array.isArray(payload.busyBlocks)
      ? payload.busyBlocks.map(busyOf).filter((block): block is BusyBlock => block != null)
      : [],
    overlayEvents: Array.isArray(payload.overlayEvents)
      ? payload.overlayEvents.map(overlayOf).filter((event): event is OverlayEvent => event != null)
      : [],
    calendars: Array.isArray(payload.calendars)
      ? payload.calendars
          .map(calendarRefOf)
          .filter((calendar): calendar is GoogleCalendarRef => calendar != null)
      : [],
    lastSyncedAt: finite(payload.lastSyncedAt) ?? Date.now(),
  };
}
