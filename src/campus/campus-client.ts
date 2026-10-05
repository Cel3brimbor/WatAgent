import { campusEventsOf, type CampusEvent, type CampusEventsPayload } from "@/campus/campus-events";
import { ApiError, apiFetch, apiJson } from "@/shared/api-base";

export type CampusSyncCalendar = {
  feedId: string;
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
};

export type CampusSyncResult = {
  updatedAt: number;
  calendars: CampusSyncCalendar[];
};

function scrapeAtOf(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const updatedAt = (raw as { updatedAt?: unknown }).updatedAt;
  return typeof updatedAt === "number" && Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : null;
}

function syncCalendarOf(raw: unknown): CampusSyncCalendar | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.feedId !== "string" || row.feedId.length === 0) return null;
  const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
  return {
    feedId: row.feedId,
    added: count(row.added),
    updated: count(row.updated),
    removed: count(row.removed),
    unchanged: count(row.unchanged),
  };
}

/** Just the scrape time, so opening the app does not download the event list to decide. */
export async function fetchCampusScrapeAt(): Promise<number | null> {
  try {
    return scrapeAtOf(await apiJson<unknown>("/api/campus-events/status"));
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 0)) return null;
    throw err;
  }
}

/**
 * One scrape applied to every enabled category. Each calendar is reported as it is saved
 * so the grid can show those events before the rest finish.
 */
export async function syncCampusCalendars(
  calendars: Array<{ feedId: string; categories: string[] }>,
  timeZone: string,
  onCalendar?: (calendar: CampusSyncCalendar) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<CampusSyncResult> {
  const res = await apiFetch("/api/campus-events/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ calendars, timeZone }),
    signal,
  });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.includes("ndjson") || !res.body) {
    const payload = (await res.json().catch(() => null)) as { error?: unknown } | null;
    const message = payload && typeof payload.error === "string" ? payload.error : "Unable to update UWaterloo events. Try again.";
    throw new ApiError(message, res.status);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let updatedAt: number | null = null;
  const saved: CampusSyncCalendar[] = [];
  const take = async (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as Record<string, unknown>;
    if (event.type === "error") {
      const message = typeof event.error === "string" ? event.error : "Unable to update UWaterloo events. Try again.";
      throw new ApiError(message, 400);
    }
    if (event.type === "calendar") {
      const calendar = syncCalendarOf(event);
      if (!calendar) return;
      saved.push(calendar);
      await onCalendar?.(calendar);
    }
    if (event.type === "done") updatedAt = scrapeAtOf(event);
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) await take(line);
      if (done) break;
    }
    if (buffer.trim()) await take(buffer);
  } catch (err) {
    await reader.cancel().catch(() => undefined);
    throw err;
  }
  if (updatedAt == null) throw new ApiError("Unable to update UWaterloo events. Try again.", 0);
  return { updatedAt, calendars: saved };
}

let campusEventCache: CampusEvent[] = [];

/** The last UWaterloo list the Events page loaded. Toggles paint from this instead of waiting on another transfer. */
export function cachedCampusEvents(): CampusEvent[] {
  return campusEventCache;
}

export async function fetchCampusEvents(): Promise<CampusEventsPayload> {
  try {
    const data = campusEventsOf(await apiJson<unknown>("/api/campus-events"));
    campusEventCache = data.events;
    return data;
  } catch (err) {
    //a backend from before campus events has no such route
    if (err instanceof ApiError && err.status === 404) throw new ApiError("This WatAgent server doesn't have UWaterloo events yet. Update the backend, then try again.", 404);
    throw err;
  }
}
