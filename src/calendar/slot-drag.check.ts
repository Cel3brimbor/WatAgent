import assert from "node:assert/strict";
import { createSlotSelectionStore } from "./use-slot-drag";
import { createDraftTitleStore } from "./draft-title-preview";
import { HOUR_PX, quarterHourFromClientY, quarterHourRange } from "./calendar-grid";
import { defaultTimedDraft } from "./calendar-item-editor";
import { timedDraftSlotForDay } from "./editor-draft";
import { formatHourLabel } from "./date-utils";

const grid = { getBoundingClientRect: () => ({ top: -200 }) } as HTMLElement;
const at = (hour: number) => quarterHourFromClientY(grid, -200 + hour * HOUR_PX);
assert.equal(at(9.25), 9.25);
assert.equal(at(9.36), 9.25);
assert.equal(at(9.39), 9.5);
assert.equal(at(-1), 0);
assert.equal(at(25), 24);

for (const hourPx of [26, 52, 78, 104]) {
  for (const hour of [0, 9.25, 10.5, 23.75, 24]) {
    assert.equal(quarterHourFromClientY(grid, -200 + hour * hourPx, hourPx), hour, "Quarter-hour snapping follows calendar zoom");
  }
}

const day = new Date(2026, 9, 9);
for (const [anchor, current, expected] of [
  [9.25, 10.5, { start: 9.25, end: 10.5 }],
  [10.5, 9.25, { start: 9.25, end: 10.5 }],
  [9.25, 9.25, { start: 9.25, end: 9.5 }],
  [0, 0.25, { start: 0, end: 0.25 }],
  [23.75, 24, { start: 23.75, end: 24 }],
] as const) {
  const range = quarterHourRange(anchor, current);
  assert.deepEqual(range, expected);
  const draft = defaultTimedDraft(day, range.start, 0, range.end);
  assert.equal(draft.endUTC - draft.startUTC, (expected.end - expected.start) * 3_600_000);
  assert.equal(new Date(draft.startUTC).getMinutes(), (expected.start % 1) * 60);
  assert.deepEqual(timedDraftSlotForDay(draft, day), expected, "Editor preview preserves selected boundaries");
}
const midnight = defaultTimedDraft(day, 23.75, 0, 24);
assert.equal(new Date(midnight.endUTC).getDate(), 10);
assert.equal(new Date(midnight.endUTC).getHours(), 0);
assert.equal(timedDraftSlotForDay(midnight, new Date(2026, 9, 10)), null, "Midnight end does not occupy the next day");
assert.equal(defaultTimedDraft(day, 9).endUTC - defaultTimedDraft(day, 9).startUTC, 3_600_000, "Toolbar defaults remain one hour");
assert.match(formatHourLabel(9.25), /15/);
assert.match(formatHourLabel(9.5), /30/);
assert.match(formatHourLabel(9.75), /45/);
console.log("Quarter-hour drag checks passed: snapping, reverse drag, minimum duration, midnight, editor preview and labels.");

// Pointer updates notify only the overlay subscribers, and equal snapped ranges are ignored.
const selectionStore = createSlotSelectionStore<string>();
let paints = 0;
const unsubscribe = selectionStore.subscribe(() => paints++);
selectionStore.set({ key: "Monday", start: 9.25, end: 9.5 });
const firstSnapshot = selectionStore.getSnapshot();
selectionStore.set({ key: "Monday", start: 9.25, end: 9.5 });
assert.equal(selectionStore.getSnapshot(), firstSnapshot, "Same snapped range keeps a stable snapshot");
assert.equal(paints, 1);
selectionStore.set({ key: "Monday", start: 9.25, end: 9.75 });
assert.equal(paints, 2);
selectionStore.set(null);
assert.equal(selectionStore.getSnapshot(), null);
assert.equal(paints, 3);
unsubscribe();
selectionStore.set({ key: "Tuesday", start: 0, end: 0.25 });
assert.equal(paints, 3);

const titles = createDraftTitleStore();
let titlePaints = 0;
const stopTitle = titles.subscribe(() => titlePaints++);
titles.set("Practice piano");
assert.equal(titles.getSnapshot(), "Practice piano");
titles.set("Practice piano");
assert.equal(titlePaints, 1, "Equal names do not repaint the preview");
titles.set("");
assert.equal(titles.getSnapshot(), "", "Clearing the name is a live update");
titles.set(null);
assert.equal(titles.getSnapshot(), null, "Closing the editor clears the preview name");
stopTitle();
console.log("Lightweight selection and live-title subscription checks passed.");
