import assert from "node:assert/strict";
import { HOUR_PX, hourFromClientY } from "./calendar-grid";
import { defaultTimedDraft } from "./calendar-item-editor";
import { timedDraftSlotForDay } from "./editor-draft";

// The current drag UI selects whole-hour cells; the end cell is inclusive.
const grid = { getBoundingClientRect: () => ({ top: -200 }) } as HTMLElement;
const at = (hour: number) => hourFromClientY(grid, -200 + hour * HOUR_PX);
assert.equal(at(9), 9);
assert.equal(at(9.25), 9);
assert.equal(at(9.99), 9);
assert.equal(at(10), 10);
assert.equal(at(-1), 0);
assert.equal(at(24), 23);
assert.equal(at(25), 23);

const day = new Date(2026, 9, 9);
for (const [start, end, durationHours] of [
  [9, 10, 2],
  [9, 9, 1],
  [0, 0, 1],
  [23, 23, 1],
  [0, 23, 24],
] as const) {
  const draft = defaultTimedDraft(day, start, 0, end);
  assert.equal(draft.endUTC - draft.startUTC, durationHours * 3_600_000);
  assert.equal(new Date(draft.startUTC).getHours(), start);
  assert.equal(new Date(draft.startUTC).getMinutes(), 0);
  assert.deepEqual(timedDraftSlotForDay(draft, day), { start, end }, "Editor preview preserves selected cells");
}
const midnight = defaultTimedDraft(day, 23, 0, 23);
assert.equal(new Date(midnight.endUTC).getDate(), 10);
assert.equal(new Date(midnight.endUTC).getHours(), 0);
assert.equal(timedDraftSlotForDay(midnight, new Date(2026, 9, 10)), null, "Midnight end does not occupy the following day");
assert.equal(defaultTimedDraft(day, 9).endUTC - defaultTimedDraft(day, 9).startUTC, 3_600_000, "Toolbar defaults remain one hour");
console.log("Hour-cell drag checks passed: snapping, bounds, duration, midnight and editor preview.");
