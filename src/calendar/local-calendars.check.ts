import assert from "node:assert/strict";
import {
  BUILTIN_CALENDARS,
  calendarIdField,
  defaultEventCalendarId,
  localCalendarIdOf,
  localCalendarsOf,
  newLocalCalendar,
  shownLocalCalendars,
} from "./local-calendars";
import { calendarItemVisible } from "./external-calendars";
import { ALL_SOURCES } from "./preferences";
import type { CalendarItemDoc, CalendarItemMeta } from "./types";

const meta: CalendarItemMeta = { kind: "event", startUTC: 1, endUTC: 2, allDay: false };
const school = newLocalCalendar("  School  ");
assert.match(school.id, /^cal-[0-9a-f-]{36}$/);
assert.equal(school.name, "School");

assert.equal(localCalendarIdOf(meta), "events");
assert.equal(localCalendarIdOf({ ...meta, kind: "task" }), "tasks");
assert.equal(localCalendarIdOf({ ...meta, calendarId: school.id }), school.id);
assert.equal(localCalendarIdOf({ ...meta, importSource: "portal", calendarId: school.id }), null, "imports never belong to a WatAgent calendar");

assert.deepEqual(localCalendarsOf(undefined), BUILTIN_CALENDARS, "missing preference means the two built-ins");
assert.deepEqual(localCalendarsOf([]), [], "an emptied list stays empty");
assert.deepEqual(localCalendarsOf([school, school, { id: "bogus", name: "x" }, { id: "tasks", name: " " }]).map((c) => c.id), [school.id], "duplicates, bad ids and blank names are dropped");

const doc = (calendar: CalendarItemMeta): CalendarItemDoc => ({ id: String(Math.random()), title: "t", calendar, createdAt: 0, updatedAt: 0 });
assert.deepEqual(shownLocalCalendars([school], []).map((c) => c.id), [school.id], "deleted built-ins stay gone while empty");
assert.deepEqual(shownLocalCalendars([school], [doc({ ...meta, kind: "task" })]).map((c) => c.id), ["tasks", school.id], "a new task brings Tasks back");

assert.equal(defaultEventCalendarId([BUILTIN_CALENDARS[1], school]), school.id, "with WatAgent deleted, new events go to the first event calendar");
assert.equal(defaultEventCalendarId([BUILTIN_CALENDARS[1]]), "events");
assert.equal(calendarIdField("events"), undefined, "the built-in is stored as no calendarId");
assert.equal(calendarIdField(school.id), school.id);

const inSchool = doc({ ...meta, calendarId: school.id });
assert.equal(calendarItemVisible(inSchool, ALL_SOURCES), true);
assert.equal(calendarItemVisible(inSchool, { ...ALL_SOURCES, mutedGoogleIds: [school.id] }), false, "unchecking a calendar hides its events");
assert.equal(calendarItemVisible(inSchool, { ...ALL_SOURCES, events: false }), true, "hiding WatAgent does not hide other calendars");
assert.equal(calendarItemVisible(doc(meta), { ...ALL_SOURCES, mutedGoogleIds: [school.id] }), true);
assert.equal(calendarItemVisible(inSchool, { ...ALL_SOURCES, hiddenIds: [school.id] }), false);
console.log("WatAgent calendar membership, defaults, restore-on-use, and visibility checks passed.");
