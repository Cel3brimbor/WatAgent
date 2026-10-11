import { sameLocalDay, startOfLocalDay } from "@/calendar/date-utils";
import { HOUR_PX } from "@/calendar/calendar-grid";
import type { TimelineItem } from "@/calendar/types";

export const MIN_HOUR_PX = 28;
export const MAX_HOUR_PX = 144;
const LEAD_MINUTES = 60;
const EMPTY_LEAD_MINUTES = 8 * 60;

export function zoomHourPx(current: number, deltaY: number): number {
  const base = clampHourPx(current);
  if (!Number.isFinite(deltaY) || deltaY === 0) return base;
  //pinch-out and scroll-up grow the hour; the other way packs the day tighter
  return clampHourPx(base * Math.exp(-deltaY * 0.0016));
}

export function clampHourPx(value: number): number {
  if (!Number.isFinite(value)) return HOUR_PX;
  return Math.min(MAX_HOUR_PX, Math.max(MIN_HOUR_PX, value));
}

/** Grid lines inside each hour. Taller hours reveal shorter intervals. */
export function intervalMinutes(hourPx: number): 15 | 30 | 60 {
  if (hourPx >= 108) return 15;
  if (hourPx >= 70) return 30;
  return 60;
}

/** Skip labels once hours get too short to read every one. */
export function labelEvery(hourPx: number): number {
  if (hourPx < 34) return 3;
  if (hourPx < 46) return 2;
  return 1;
}

export function earliestTimedMinutes(groups: Array<{ dayStartMs: number; items: TimelineItem[] }>): number | null {
  let earliest = Number.POSITIVE_INFINITY;
  for (const group of groups) {
    const dayEndMs = group.dayStartMs + 86_400_000;
    for (const item of group.items) {
      if (item.allDay || item.pinned) continue;
      if (!Number.isFinite(item.startUTC) || !Number.isFinite(item.endUTC)) continue;
      if (item.endUTC <= group.dayStartMs || item.startUTC >= dayEndMs) continue;
      const visible = Math.max(item.startUTC, group.dayStartMs);
      const minutes = (visible - group.dayStartMs) / 60_000;
      if (minutes < earliest) earliest = minutes;
    }
  }
  return Number.isFinite(earliest) ? earliest : null;
}

/** Hours from midnight where the grid should open: one hour before the first timed item. */
export function leadHourFromMinutes(earliestMinutes: number | null, fallbackMinutes: number): number {
  const minutes = earliestMinutes == null ? fallbackMinutes : Math.max(0, earliestMinutes - LEAD_MINUTES);
  return minutes / 60;
}

export function emptyDayFallbackMinutes(now: Date, includesToday: boolean): number {
  if (!includesToday) return EMPTY_LEAD_MINUTES;
  return Math.max(0, now.getHours() * 60 + now.getMinutes() - LEAD_MINUTES);
}

export function leadHourForDays(
  days: Date[],
  itemsForDay: (date: Date) => TimelineItem[],
  now = new Date(),
): number {
  const earliest = earliestTimedMinutes(days.map((date) => ({
    dayStartMs: startOfLocalDay(date).getTime(),
    items: itemsForDay(date),
  })));
  const includesToday = days.some((date) => sameLocalDay(date, now));
  return leadHourFromMinutes(earliest, emptyDayFallbackMinutes(now, includesToday));
}
