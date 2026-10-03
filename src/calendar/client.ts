import { ApiError, apiFetch, apiJson } from "@/shared/api-base";
import { isFeedId, parseCalendarMeta, type CalendarItemDoc, type CalendarItemMeta, type ImportedCalendarSource } from "@/calendar/types";

function timeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function calendarItemOf(raw: unknown): CalendarItemDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string" || !rec.id) return null;
  const calendar = parseCalendarMeta(rec.calendar);
  if (!calendar) return null;
  const title = typeof rec.title === "string" ? rec.title.slice(0, 200) : "";
  return {
    id: rec.id,
    title: title || (calendar.kind === "task" ? "Task" : "Event"),
    calendar,
    createdAt: Number(rec.createdAt) || Date.now(),
    updatedAt: Number(rec.updatedAt) || Date.now(),
  };
}

export function calendarItemsOf(raw: unknown): CalendarItemDoc[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(calendarItemOf).filter((item): item is CalendarItemDoc => item != null);
}

export async function listCalendarItems(): Promise<CalendarItemDoc[]> {
  const payload = await apiJson<{ items?: unknown }>("/api/calendar/items");
  return calendarItemsOf(payload.items);
}

export async function upsertCalendarItem(input: {
  id: string;
  title: string;
  calendar: CalendarItemMeta;
  createdAt?: number;
}): Promise<CalendarItemDoc> {
  const payload = await apiJson<{ item?: unknown }>("/api/calendar/items", {
    method: "POST",
    body: JSON.stringify({
      id: input.id,
      title: input.title.slice(0, 200),
      createdAt: input.createdAt,
      timeZone: timeZone(),
      calendar: {
        kind: input.calendar.kind,
        startUTC: input.calendar.startUTC,
        endUTC: input.calendar.endUTC,
        allDay: input.calendar.allDay,
        completed: input.calendar.kind === "task" ? Boolean(input.calendar.completed) : undefined,
        ...(input.calendar.calendarId ? { calendarId: input.calendar.calendarId } : {}),
        ...(input.calendar.location ? { location: input.calendar.location } : {}),
        ...(input.calendar.description ? { description: input.calendar.description } : {}),
      },
    }),
  });
  const item = calendarItemOf(payload.item);
  if (!item) throw new Error("Unable to save calendar item.");
  return item;
}

export async function deleteCalendarItem(id: string): Promise<void> {
  await apiJson("/api/calendar/items", {
    method: "DELETE",
    body: JSON.stringify({ id, timeZone: timeZone() }),
  });
}

export type CalendarImportProgress = { done: number; total: number | null };
export type CalendarImportResult = {
  imported: number; added: number; updated: number; unchanged: number; removed: number;
  existed: boolean;
  source: ImportedCalendarSource;
};

function importErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") return payload.error;
  return fallback;
}

export async function importCalendarLink(
  input: { url: string; feedId: ImportedCalendarSource; rangeStartUTC: number; rangeEndUTC: number },
  onProgress?: (progress: CalendarImportProgress) => void,
): Promise<CalendarImportResult> {
  const res = await apiFetch("/api/calendar/import", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, timeZone: timeZone() }),
  });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.includes("ndjson") || !res.body) {
    const payload = await res.json().catch(() => null);
    throw new ApiError(importErrorMessage(payload, "Unable to import this calendar. Try again."), res.status);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: CalendarImportResult | null = null;
  const take = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as Record<string, unknown>;
    if (event.type === "error") throw new ApiError(importErrorMessage(event, "Unable to import this calendar. Try again."), 400);
    if (event.type === "progress" && typeof event.done === "number") {
      onProgress?.({ done: event.done, total: typeof event.total === "number" ? event.total : null });
    }
    if (event.type === "done" && isFeedId(event.source)) {
      result = {
        imported: Number(event.imported) || 0,
        added: Number(event.added) || 0,
        updated: Number(event.updated) || 0,
        unchanged: Number(event.unchanged) || 0,
        removed: Number(event.removed) || 0,
        existed: event.existed === true,
        source: event.source,
      };
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) take(line);
      if (done) break;
    }
    if (buffer.trim()) take(buffer);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  if (!result) throw new ApiError("Unable to import this calendar. Try again.", 500);
  return result;
}

export async function removeImportedCalendar(source: ImportedCalendarSource): Promise<void> {
  await apiJson("/api/calendar/import", { method: "DELETE", body: JSON.stringify({ source }) });
}
