import assert from "node:assert/strict";
import { HOUR_PX } from "./calendar-grid";
import {
  earliestTimedMinutes,
  emptyDayFallbackMinutes,
  intervalMinutes,
  labelEvery,
  leadHourForDays,
  leadHourFromMinutes,
  zoomHourPx,
  MIN_HOUR_PX,
  MAX_HOUR_PX,
} from "./time-scale";
import type { TimelineItem } from "./types";

const dayStart = new Date(2026, 9, 5).getTime();

function item(startHour: number, endHour: number, extra: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: `${startHour}`,
    title: "item",
    kind: "event",
    allDay: false,
    startUTC: dayStart + startHour * 3_600_000,
    endUTC: dayStart + endHour * 3_600_000,
    ...extra,
  };
}

const groups = [{ dayStartMs: dayStart, items: [item(14, 15), item(9, 10), { ...item(0, 24), allDay: true, id: "all" }, { ...item(7, 8), pinned: true, id: "pin" }] }];
assert.equal(earliestTimedMinutes(groups), 9 * 60, "all-day and pinned items do not pull the day open");
assert.equal(earliestTimedMinutes([{ dayStartMs: dayStart, items: [item(-3, 2)] }]), 0, "an overnight event is visible at midnight");
assert.equal(earliestTimedMinutes([{ dayStartMs: dayStart, items: [item(-4, -1)] }]), null);
assert.equal(leadHourFromMinutes(9 * 60, 8 * 60), 8, "open one hour before the first event");
assert.equal(leadHourFromMinutes(9.5 * 60, 8 * 60), 8.5);
assert.equal(leadHourFromMinutes(30, 8 * 60), 0, "a lead before midnight stays at midnight");
assert.equal(leadHourFromMinutes(null, 8 * 60), 8);
assert.equal(emptyDayFallbackMinutes(new Date(2026, 9, 5, 15, 30), false), 8 * 60);
assert.equal(emptyDayFallbackMinutes(new Date(2026, 9, 5, 15, 30), true), 14 * 60 + 30);

const monday = new Date(2026, 9, 5);
const tuesday = new Date(2026, 9, 6);
const lead = leadHourForDays([monday, tuesday], (date) => {
  if (date.getDate() === 5) return [item(10, 11)];
  return [{ ...item(8, 9), startUTC: new Date(2026, 9, 6, 8).getTime(), endUTC: new Date(2026, 9, 6, 9).getTime() }];
}, new Date(2026, 9, 8, 12));
assert.equal(lead, 7, "a week opens from the earliest clock time, one hour ahead");

assert.equal(zoomHourPx(HOUR_PX, 0), HOUR_PX);
assert.ok(zoomHourPx(HOUR_PX, 80) < HOUR_PX, "scroll down packs hours tighter");
assert.ok(zoomHourPx(HOUR_PX, -80) > HOUR_PX, "scroll up expands hours");
assert.equal(zoomHourPx(HOUR_PX, 100_000), MIN_HOUR_PX);
assert.equal(zoomHourPx(HOUR_PX, -100_000), MAX_HOUR_PX);
assert.equal(intervalMinutes(HOUR_PX), 60);
assert.equal(intervalMinutes(80), 30);
assert.equal(intervalMinutes(120), 15);
assert.equal(labelEvery(HOUR_PX), 1);
assert.equal(labelEvery(40), 2);
assert.equal(labelEvery(30), 3);
console.log("time scale checks passed: lead hour, zoom limits, and interval steps.");
