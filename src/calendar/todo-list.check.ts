import assert from "node:assert/strict";
import { startOfLocalDay } from "@/calendar/date-utils";
import { groupOf } from "./todo-list";

process.env.TZ = "America/Toronto";

const today = startOfLocalDay(new Date(2026, 9, 13, 14, 30));
const now = new Date(2026, 9, 13, 14, 30).getTime();
const at = (day: number, hour = 0, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();

//a finished task from a previous day leaves the active list
assert.equal(groupOf({ dueUTC: at(12, 9), allDay: false, done: true }, now, today), "done");
assert.equal(groupOf({ dueUTC: at(12), allDay: true, done: true }, now, today), "done");
assert.equal(groupOf({ dueUTC: at(12), allDay: true, done: true }, now, today, true), "overdue");

//today stays put once it's checked, including a time that already passed
assert.equal(groupOf({ dueUTC: at(13, 9), allDay: false, done: true }, now, today), "today");
assert.equal(groupOf({ dueUTC: at(13, 18), allDay: false, done: true }, now, today), "today");
assert.equal(groupOf({ dueUTC: at(13), allDay: true, done: true }, now, today), "today");

//upcoming stays in its group when completed
assert.equal(groupOf({ dueUTC: at(14, 11), allDay: false, done: true }, now, today), "week");
assert.equal(groupOf({ dueUTC: at(25), allDay: true, done: true }, now, today), "later");

//open tasks still sort by when they're due
assert.equal(groupOf({ dueUTC: at(12, 9), allDay: false, done: false }, now, today), "overdue");
assert.equal(groupOf({ dueUTC: at(13, 9), allDay: false, done: false }, now, today), "today");
assert.equal(groupOf({ dueUTC: at(13), allDay: true, done: false }, now, today), "today");
assert.equal(groupOf({ dueUTC: at(16), allDay: true, done: false }, now, today), "week");
assert.equal(groupOf({ dueUTC: at(30), allDay: true, done: false }, now, today), "later");

console.log("todo-list.check: ok");
