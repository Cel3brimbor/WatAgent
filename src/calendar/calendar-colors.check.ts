import assert from "node:assert/strict";
import { calendarColorRule, calendarColorVar, calendarPaint, calendarSwatchColor, DEFAULT_COLORS } from "./preferences";

const overrides = { "ics:portal": "#f83a22" };
const colors = { ...DEFAULT_COLORS, event: "#111111", task: "#222222" };

assert.equal(calendarSwatchColor("events", colors, overrides), "#111111");
assert.equal(calendarSwatchColor("tasks", colors, overrides), "#222222");
assert.equal(calendarSwatchColor("ics:learn", colors, overrides), "#4986e7");
assert.equal(calendarSwatchColor("ics:portal", colors, overrides), "#f83a22", "overrides win");
assert.equal(calendarSwatchColor("ics:portal", colors, {}), "#9a9cff");
assert.equal(calendarSwatchColor("merge-0b5c2f8e-3a4d-4e1f-9c2b-7d6e5f4a3b2c", colors, {}), calendarSwatchColor("merge-0b5c2f8e-3a4d-4e1f-9c2b-7d6e5f4a3b2c", colors, {}));
assert.notEqual(calendarSwatchColor("ics:learn", colors, {}), colors.event, "imported defaults ignore Agent Main");
assert.equal(calendarSwatchColor("cal-user", colors, {}), colors.event, "user calendars still follow Agent Main when unset");

const eventsVar = calendarColorVar("events");
assert.equal(eventsVar, "--cal-events");
assert.equal(calendarColorVar("events"), eventsVar);
const googleId = "en.usa#holiday@group.v.calendar.google.com";
const googleVar = calendarColorVar(googleId);
assert.match(googleVar, /^--cal-[A-Za-z0-9_-]+$/);
assert.equal(calendarColorVar(googleId), googleVar);
assert.equal(googleVar.includes("#") || googleVar.includes("@") || googleVar.includes("."), false);
assert.equal(calendarPaint("events"), `var(${eventsVar})`);
assert.equal(calendarPaint("events", "#abcdef"), `var(${eventsVar}, #abcdef)`);
assert.equal(calendarPaint("events", "red"), `var(${eventsVar})`);
assert.equal(calendarColorRule({ events: "#ABCDEF", "not-a-color": "red" }), ":root{--cal-events:#abcdef;}");

//calendar-app: useDeferredValue(colors) and useDeferredValue(colorOverrides) separately.
//never useDeferredValue({ colors, colorOverrides }) — a fresh object each render retriggers full derive.

console.log("calendar-colors.check.ts ok");
