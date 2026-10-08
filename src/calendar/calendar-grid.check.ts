import assert from "node:assert/strict";
import { HOUR_PX, layoutOverlappingBlocks, timedItemStyle } from "./calendar-grid";
import type { TimelineItem } from "./types";

const day = new Date(2026, 9, 8).getTime();
function event(id: string, start: number, end: number): TimelineItem {
  return { id, title: id, kind: "event", allDay: false, startUTC: day + start * 3600000, endUTC: day + end * 3600000 };
}
const layout = (...items: TimelineItem[]) => layoutOverlappingBlocks(items, day);
const byId = (rows: ReturnType<typeof layout>, id: string) => rows.find((row) => row.item.id === id)!;

const near = layout(event("a", 8, 9.75), event("b", 8.5, 10.333));
assert.deepEqual(near.map(({ col, cols, depth }) => [col, cols, depth]), [[0, 2, 0], [1, 2, 0]], "nearby starts remain side by side");
const inset = layout(event("long", 6, 14), event("lab", 8.5, 10.333), event("talk", 11.5, 12.833), event("class", 13.5, 14.333));
assert.deepEqual(inset.map(({ col, cols, depth }) => [col, cols, depth]), [[0, 1, 0], [0, 1, 1], [0, 1, 1], [0, 1, 1]], "shorter events overlay a long block without squeezing every card");
const mixed = layout(event("long", 10.75, 15), event("near", 11.25, 14), event("nested", 11.5, 12.833), event("late", 14.5, 15.333));
assert.equal(byId(mixed, "nested").depth, 1);
assert.equal(byId(mixed, "nested").cols, 2);
assert.equal(byId(mixed, "late").span, 2, "later events reclaim empty columns");
const equal = layout(event("z", 9, 11), event("a", 9, 11), event("b", 9, 10));
assert.deepEqual(equal.map(({ item, col, cols }) => [item.id, col, cols]), [["a", 0, 3], ["z", 1, 3], ["b", 2, 3]]);
assert.deepEqual(layout(...equal.map(({ item }) => item).reverse()), equal, "feed order cannot shuffle columns");
assert.deepEqual(layout(event("one", 9, 10), event("two", 10, 11)).map(({ cols, depth }) => [cols, depth]), [[1, 0], [1, 0]], "touching boundaries do not overlap");
assert.equal(layout(event("tiny", 9, 9.05), event("next", 9.1, 9.15))[1].cols, 2, "minimum-height cards cannot cover another title");
const clipped = layout(event("overnight", -5, 2), event("midnight", 0, 1), event("past", -4, -1), event("tomorrow", 25, 26));
assert.equal(clipped.length, 2);
assert.equal(clipped[0].top, 0);
assert.equal(clipped[0].height, 2 * HOUR_PX);
assert.equal(clipped[1].cols, 2, "visible headers at midnight are separated");
assert.equal(layout(event("late", 23.99, 25))[0].top + layout(event("late", 23.99, 25))[0].height, 24 * HOUR_PX);
const deep = layout(...Array.from({ length: 20 }, (_, i) => event(String(i), i, 24)));
assert.equal(deep[19].depth, 19);
assert.match(String(timedItemStyle(deep[19]).width), /min\(228px, 30%\)/, "deep stacks retain readable width on narrow screens");
assert.equal(layout({ ...event("all", 0, 24), allDay: true }, event("bad", 3, 2)).length, 0);
assert.equal(layout({ ...event("due", 0, 0), kind: "task" })[0].height, 18, "instant tasks at midnight remain visible");
console.log("Apple-style timed layout checks passed: columns, insets, expansion, stable order, short events, midnight and deep stacks.");
