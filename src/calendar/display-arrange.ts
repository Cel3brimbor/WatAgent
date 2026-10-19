import type { CalendarSpace } from "@/calendar/calendar-spaces";

/**matches the cap calendarSpacesOf keeps when a Quick Display is saved*/
export const MAX_DISPLAY_CALENDARS = 80;

export type ArrangeDrag =
  | { kind: "pool"; calendarId: string }
  | { kind: "member"; displayId: string; calendarId: string };

export type ArrangeDrop =
  | { kind: "pool" }
  | { kind: "display"; displayId: string };

export type ArrangeChange =
  | { type: "add"; displayId: string; calendarId: string }
  | { type: "remove"; displayId: string; calendarId: string }
  | { type: "none"; reason?: "already" | "full"; displayId?: string; calendarId?: string };

export function withCalendar(display: CalendarSpace, calendarId: string): CalendarSpace {
  if (!calendarId || display.includedCalendarIds.includes(calendarId) || display.includedCalendarIds.length >= MAX_DISPLAY_CALENDARS) {
    return display;
  }
  return { ...display, includedCalendarIds: [...display.includedCalendarIds, calendarId] };
}

export function withoutCalendar(display: CalendarSpace, calendarId: string): CalendarSpace {
  if (!display.includedCalendarIds.includes(calendarId)) return display;
  return { ...display, includedCalendarIds: display.includedCalendarIds.filter((id) => id !== calendarId) };
}

//dropping from the list adds. dropping a chip on another display adds there too.
//dropping a chip back on the list takes it off that display only.
export function arrangeDrop(drag: ArrangeDrag, drop: ArrangeDrop | null, displays: CalendarSpace[]): ArrangeChange {
  if (!drop) return { type: "none" };
  if (drop.kind === "pool") {
    if (drag.kind !== "member") return { type: "none" };
    const source = displays.find((display) => display.id === drag.displayId);
    if (!source?.includedCalendarIds.includes(drag.calendarId)) return { type: "none" };
    return { type: "remove", displayId: drag.displayId, calendarId: drag.calendarId };
  }
  if (drag.kind === "member" && drag.displayId === drop.displayId) return { type: "none" };
  const target = displays.find((display) => display.id === drop.displayId);
  if (!target) return { type: "none" };
  if (target.includedCalendarIds.includes(drag.calendarId)) {
    return { type: "none", reason: "already", displayId: target.id, calendarId: drag.calendarId };
  }
  if (target.includedCalendarIds.length >= MAX_DISPLAY_CALENDARS) {
    return { type: "none", reason: "full", displayId: target.id, calendarId: drag.calendarId };
  }
  return { type: "add", displayId: target.id, calendarId: drag.calendarId };
}

export function arrangeDragOf(raw: unknown): ArrangeDrag | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.calendarId !== "string" || !rec.calendarId) return null;
  if (rec.kind === "pool") return { kind: "pool", calendarId: rec.calendarId };
  if (rec.kind === "member" && typeof rec.displayId === "string" && rec.displayId) {
    return { kind: "member", displayId: rec.displayId, calendarId: rec.calendarId };
  }
  return null;
}

export function arrangeDropOf(raw: unknown): ArrangeDrop | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (rec.kind === "pool") return { kind: "pool" };
  if (rec.kind === "display" && typeof rec.displayId === "string" && rec.displayId) {
    return { kind: "display", displayId: rec.displayId };
  }
  return null;
}
