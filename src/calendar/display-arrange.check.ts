import assert from "node:assert/strict";
import { newCalendarSpace } from "./calendar-spaces";
import {
  MAX_DISPLAY_CALENDARS,
  arrangeDragOf,
  arrangeDrop,
  arrangeDropOf,
  withCalendar,
  withoutCalendar,
} from "./display-arrange";

const school = { ...newCalendarSpace("School", "#4986e7"), includedCalendarIds: ["classes"] };
const weekend = { ...newCalendarSpace("Weekend", "#16a765"), includedCalendarIds: ["gym"] };
const displays = [school, weekend];

assert.equal(withCalendar(school, "classes"), school);
assert.deepEqual(withCalendar(school, "gym").includedCalendarIds, ["classes", "gym"]);
assert.equal(withoutCalendar(school, "missing"), school);
assert.deepEqual(withoutCalendar(school, "classes").includedCalendarIds, []);

assert.deepEqual(arrangeDrop({ kind: "pool", calendarId: "gym" }, { kind: "display", displayId: school.id }, displays), {
  type: "add",
  displayId: school.id,
  calendarId: "gym",
});
assert.deepEqual(arrangeDrop({ kind: "pool", calendarId: "classes" }, { kind: "display", displayId: school.id }, displays), {
  type: "none",
  reason: "already",
  displayId: school.id,
  calendarId: "classes",
});
assert.deepEqual(arrangeDrop({ kind: "pool", calendarId: "gym" }, { kind: "pool" }, displays), { type: "none" });
assert.deepEqual(arrangeDrop({ kind: "pool", calendarId: "gym" }, null, displays), { type: "none" });

assert.deepEqual(
  arrangeDrop({ kind: "member", displayId: school.id, calendarId: "classes" }, { kind: "display", displayId: weekend.id }, displays),
  { type: "add", displayId: weekend.id, calendarId: "classes" },
);
assert.deepEqual(
  arrangeDrop({ kind: "member", displayId: school.id, calendarId: "classes" }, { kind: "display", displayId: school.id }, displays),
  { type: "none" },
);
assert.deepEqual(
  arrangeDrop({ kind: "member", displayId: school.id, calendarId: "classes" }, { kind: "pool" }, displays),
  { type: "remove", displayId: school.id, calendarId: "classes" },
);
assert.deepEqual(
  arrangeDrop({ kind: "member", displayId: weekend.id, calendarId: "gym" }, { kind: "display", displayId: school.id }, displays).type,
  "add",
);

const full = { ...school, includedCalendarIds: Array.from({ length: MAX_DISPLAY_CALENDARS }, (_, index) => `cal-${index}`) };
assert.equal(withCalendar(full, "extra"), full);
const capped = arrangeDrop({ kind: "pool", calendarId: "extra" }, { kind: "display", displayId: full.id }, [full]);
assert.equal(capped.type, "none");
if (capped.type !== "none") throw new Error("a full Quick Display should refuse another calendar");
assert.equal(capped.reason, "full");

assert.deepEqual(arrangeDragOf({ kind: "pool", calendarId: "gym" }), { kind: "pool", calendarId: "gym" });
assert.equal(arrangeDragOf({ kind: "member", calendarId: "gym" }), null);
assert.equal(arrangeDragOf(null), null);
assert.deepEqual(arrangeDropOf({ kind: "display", displayId: school.id }), { kind: "display", displayId: school.id });
assert.equal(arrangeDropOf({ kind: "display" }), null);

console.log("Quick Display arrange checks passed.");
