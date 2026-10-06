import assert from "node:assert/strict";
import { calendarItemVisible, externalCalendarsOf } from "./external-calendars";
import { ALL_SOURCES, isCalendarReadOnly, protectBuiltinCalendarSources, setCalendarReadOnly, withNewCalendar } from "./preferences";
import type { CalendarItemDoc } from "./types";
const learn: CalendarItemDoc = { id: "a", title: "Assignment", createdAt: 0, updatedAt: 0, calendar: { kind: "event", startUTC: 0, endUTC: 1, allDay: false, importSource: "learn" } };
const portal: CalendarItemDoc = { ...learn, id: "b", calendar: { ...learn.calendar, importSource: "portal" } };
const manual: CalendarItemDoc = { ...learn, id: "c", calendar: { ...learn.calendar, importSource: undefined } };
const filter = { ...ALL_SOURCES, events: false, tasks: false, google: false };
assert.equal(calendarItemVisible(learn, filter), true, "imports are independent of WatAgent/Google visibility");
assert.equal(calendarItemVisible(manual, filter), true, "Agent Main always stays visible");
const task: CalendarItemDoc = { ...manual, id: "t", calendar: { ...manual.calendar, kind: "task" } };
assert.equal(calendarItemVisible(task, filter), true, "Tasks always stays visible");
assert.equal(calendarItemVisible(learn, { ...filter, mutedGoogleIds: ["ics:learn"] }), false);
assert.equal(calendarItemVisible(portal, { ...filter, mutedGoogleIds: ["ics:learn"] }), true);
assert.equal(calendarItemVisible(learn, { ...filter, hiddenIds: ["ics:learn"] }), false);
const learnUrl = "https://learn.example/a.ics";
const imported = [{ id: "portal" as const, name: "Portal", url: "webcal://portal.example/b.ics" }, { id: "learn" as const, name: "Courses", url: learnUrl }];
assert.deepEqual(externalCalendarsOf([learn, portal, manual], imported).map((row) => row.name), ["Portal", "Courses"], "saved order and names");
assert.deepEqual(externalCalendarsOf([], imported).map((row) => row.id), ["ics:portal", "ics:learn"], "a saved link shows before its first events arrive");
assert.deepEqual(externalCalendarsOf([learn], []).map((row) => [row.id, row.name]), [["ics:learn", "Imported calendar"]], "events without a saved link still get a row");
assert.deepEqual(externalCalendarsOf([], []), [], "no phantom calendars");
const talks = "feed-11111111-1111-4111-8111-111111111111" as const;
const campusItem: CalendarItemDoc = { ...learn, id: "campus", calendar: { ...learn.calendar, importSource: talks } };
assert.deepEqual(
  externalCalendarsOf([campusItem], [], new Set([talks])).map((row) => row.name),
  [],
  "uwaterloo events never become an imported calendar row",
);
const school = { id: "merge-0b5c2f8e-3a4d-4e1f-9c2b-7d6e5f4a3b2c", name: "School", members: ["ics:learn", "ics:portal"] };
assert.equal(calendarItemVisible(learn, { ...filter, mutedGoogleIds: ["ics:learn"] }, [school]), true, "a member follows its merged calendar");
assert.equal(calendarItemVisible(learn, { ...filter, mutedGoogleIds: [school.id] }, [school]), false);
const groupsOff = { watagent: true, external: false, campus: true, other: true, smartTags: true, hidden: false };
assert.equal(calendarItemVisible(learn, { ...filter, groups: groupsOff }), false, "hiding the external group keeps each calendar's own check");
assert.equal(calendarItemVisible(manual, { ...filter, events: true, groups: { ...groupsOff, watagent: false, external: true } }), true, "agent main stays visible when its header is off");
assert.equal(calendarItemVisible(learn, { ...filter, hiddenIds: ["ics:learn"], groups: { ...groupsOff, external: true } }), false);
assert.equal(calendarItemVisible(learn, { ...filter, hiddenIds: ["ics:learn"], groups: { ...groupsOff, external: true, hidden: true } }), true, "the hidden header shows those calendars without clearing the list");
const locked = protectBuiltinCalendarSources({
  ...ALL_SOURCES,
  events: false,
  tasks: false,
  hiddenIds: ["events", "tasks", "ics:learn"],
  readOnlyCalendarIds: ["events", "tasks", "cal-00000000-0000-4000-8000-000000000001"],
});
assert.equal(locked.events, true);
assert.equal(locked.tasks, true);
assert.deepEqual(locked.hiddenIds, ["ics:learn"]);
assert.deepEqual(locked.readOnlyCalendarIds, ["cal-00000000-0000-4000-8000-000000000001"]);
assert.equal(isCalendarReadOnly(locked, "events"), false);
assert.equal(isCalendarReadOnly(ALL_SOURCES, "ics:learn"), true, "imported calendars are always read only");
assert.equal(isCalendarReadOnly(ALL_SOURCES, "ics:feed-0b5c2f8e-3a4d-4e1f-9c2b-7d6e5f4a3b2c"), true);
assert.equal(isCalendarReadOnly(setCalendarReadOnly(ALL_SOURCES, "ics:learn", false), "ics:learn"), true, "and can't be unlocked");
assert.equal(isCalendarReadOnly(ALL_SOURCES, "merge-0b5c2f8e-3a4d-4e1f-9c2b-7d6e5f4a3b2c"), true);
assert.equal(isCalendarReadOnly(ALL_SOURCES, "events"), false);
assert.equal(withNewCalendar(ALL_SOURCES, "ics:learn", true), ALL_SOURCES, "new calendars show by default");
assert.deepEqual(withNewCalendar(ALL_SOURCES, "ics:learn", false).mutedGoogleIds, ["ics:learn"], "or start hidden");
assert.equal(calendarItemVisible(learn, withNewCalendar(filter, "ics:learn", false)), false);
const campusSources = new Set([talks]);
assert.equal(calendarItemVisible(campusItem, { ...filter, groups: { ...groupsOff, campus: true } }, [], campusSources), true, "uwaterloo events follow their own header");
assert.equal(calendarItemVisible(campusItem, { ...filter, groups: { ...groupsOff, external: true, campus: false } }, [], campusSources), false, "hiding the uwaterloo header hides those calendars");
assert.equal(calendarItemVisible(learn, { ...filter, groups: { ...groupsOff, campus: true } }, [], campusSources), false, "learn stays under external calendars");
console.log("External calendar listing, names, merged visibility, independent visibility, and removal checks passed.");
