import assert from "node:assert/strict";
import { formatFocusLabel, shiftFocus, startOfWorkWeek } from "./date-utils";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const ymd = (date: Date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()].join("-");

assert.equal(ymd(startOfWorkWeek(day(2026, 10, 7))), "2026-10-5", "Wednesday shows its own Monday");
assert.equal(ymd(startOfWorkWeek(day(2026, 10, 5))), "2026-10-5", "Monday is the start");
assert.equal(ymd(startOfWorkWeek(day(2026, 10, 9))), "2026-10-5", "Friday stays in its week");
assert.equal(ymd(startOfWorkWeek(day(2026, 10, 10))), "2026-10-12", "Saturday looks ahead to the coming week");
assert.equal(ymd(startOfWorkWeek(day(2026, 10, 11))), "2026-10-12", "Sunday looks ahead to the coming week");
assert.equal(ymd(startOfWorkWeek(day(2026, 11, 1))), "2026-11-2", "weekend lookahead crosses a month boundary");
assert.equal(startOfWorkWeek(day(2026, 10, 7)).getHours(), 0);

assert.equal(ymd(shiftFocus(day(2026, 10, 7), "workweek", 1)), "2026-10-14", "next moves a whole week");
const label = formatFocusLabel(day(2026, 10, 7), "workweek", 0);
assert.ok(label.includes("5") && label.includes("9") && !label.includes("11"), `label spans Mon 5 – Fri 9, got "${label}"`);
console.log("5-day view date math and label checks passed.");
