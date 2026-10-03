import assert from "node:assert/strict";
import { calendarIdForDraft, calendarIdForMeta } from "./calendar-ownership";
import { newLocalCalendar } from "./local-calendars";
import type { CalendarItemDoc, CalendarItemMeta } from "./types";

const meta: CalendarItemMeta = { kind: "event", startUTC: 1, endUTC: 2, allDay: false };
const school = newLocalCalendar("School");
const doc = (calendar: CalendarItemMeta): CalendarItemDoc => ({
  id: "id-1",
  title: "t",
  calendar,
  createdAt: 0,
  updatedAt: 0,
});

assert.equal(calendarIdForMeta(meta), "events");
assert.equal(calendarIdForMeta({ ...meta, calendarId: school.id }), school.id);
assert.equal(calendarIdForMeta({ ...meta, importSource: "learn" }), "ics:learn");
assert.equal(calendarIdForDraft({ title: "", kind: "event", startUTC: 0, endUTC: 1, allDay: true }, [], [school]), "events");
assert.equal(
  calendarIdForDraft({ id: "id-1", title: "", kind: "event", startUTC: 0, endUTC: 1, allDay: true }, [doc({ ...meta, calendarId: school.id })], []),
  school.id,
);

console.log("calendar ownership checks passed.");
