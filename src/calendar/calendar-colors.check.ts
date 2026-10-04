import assert from "node:assert/strict";
import { calendarSwatchColor, DEFAULT_COLORS } from "./preferences";

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

console.log("calendar-colors.check.ts ok");
