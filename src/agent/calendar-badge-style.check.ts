import assert from "node:assert/strict";
import { calendarBadgeStyle } from "./calendar-badge-style";

const dark = calendarBadgeStyle("#1a1a2e") as Record<string, string>;
const light = calendarBadgeStyle("#f5e6a8") as Record<string, string>;

assert.equal(dark["--cal-chip-bg"], "#1a1a2e");
assert.equal(dark["--cal-chip-fg"], "#fffaf5");
assert.equal(light["--cal-chip-fg"], "#1d1b18");

console.log("calendar-badge-style.check: ok");
