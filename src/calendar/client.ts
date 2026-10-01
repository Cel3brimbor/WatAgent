import { apiJson } from "@/shared/api-base";
import { parseCalendarMeta, type CalendarItemDoc, type CalendarItemMeta } from "@/calendar/types";

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
