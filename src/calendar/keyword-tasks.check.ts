import assert from "node:assert/strict";
import {
  deadlineTasksOf,
  keywordTasksOf,
  newKeywordTaskRule,
  parseKeywordTasksFromUnknown,
  withKeywordTaskDone,
  type KeywordTaskRule,
  type KeywordTaskSource,
} from "./keyword-tasks";

const at = (day: number, hour = 23) => new Date(2026, 9, day, hour, 59).getTime();
const source = (key: string, title: string, calendarId: string, day: number, extra: Partial<KeywordTaskSource> = {}): KeywordTaskSource => ({
  key, title, calendarId, startUTC: at(day), endUTC: at(day) + 3600000, allDay: false, ...extra,
});
const learn = "ics:learn";
const rule: KeywordTaskRule = { ...newKeywordTaskRule([learn]), keywords: "Assignment, quiz" };
const sources = [
  source("a2", "CS 246 Assignment 2 - Due", learn, 9),
  source("q1", "MATH 135 Quiz 1", learn, 7),
  source("lec", "CS 246 Lecture", learn, 8),
  source("other", "Assignment party", "events", 6),
  source("desc", "Office hours", learn, 5, { description: "bring your quiz questions" }),
];
const keys = (config = { rules: [rule], doneKeys: [] as string[] }) => keywordTasksOf(config, sources).map((task) => task.key);

assert.deepEqual(keys(), ["q1", "a2"], "only the chosen calendars, case-insensitive, soonest due first");
assert.equal(keywordTasksOf({ rules: [rule], doneKeys: [] }, sources)[0].keyword, "quiz");
assert.deepEqual(keys({ rules: [{ ...rule, field: "any" }], doneKeys: [] }), ["desc", "q1", "a2"], "any field also reads the description");
assert.deepEqual(keys({ rules: [{ ...rule, enabled: false }], doneKeys: [] }), [], "a paused rule makes no tasks");
assert.deepEqual(keys({ rules: [{ ...rule, calendarIds: [] }], doneKeys: [] }), [], "a rule with no calendars makes no tasks");
assert.deepEqual(keys({ rules: [{ ...rule, keywords: " , " }], doneKeys: [] }), []);
assert.deepEqual(keys({ rules: [rule, { ...rule, id: "again" }], doneKeys: [] }), ["q1", "a2"], "two matching rules still make one task");

//merged calendars: picking the merge covers its members' events
const merged = [source("m", "Quiz 2", learn, 10, { mergedCalendarId: "merge-x" })];
assert.equal(keywordTasksOf({ rules: [{ ...rule, calendarIds: ["merge-x"] }], doneKeys: [] }, merged).length, 1);

//due dates
const end = keywordTasksOf({ rules: [{ ...rule, due: "end" }], doneKeys: [] }, sources)[0];
assert.equal(end.dueUTC, at(7) + 3600000);

//checking off
let config = { rules: [rule], doneKeys: [] as string[] };
config = withKeywordTaskDone(config, "q1", true);
assert.deepEqual(keywordTasksOf(config, sources).map((task) => task.done), [true, false]);
config = withKeywordTaskDone(withKeywordTaskDone(config, "q1", true), "q1", false);
assert.deepEqual(config.doneKeys, []);

//parsing
assert.deepEqual(parseKeywordTasksFromUnknown(null), { rules: [], doneKeys: [] });
const parsed = parseKeywordTasksFromUnknown({ rules: [{ id: "r", keywords: "exam", calendarIds: [learn, learn, 4], due: "soon", field: "x" }], doneKeys: ["a", "a", 3] });
assert.deepEqual(parsed.rules[0], { id: "r", name: "", keywords: "exam", field: "title", calendarIds: [learn], due: "start", enabled: true });
assert.deepEqual(parsed.doneKeys, ["a"]);

const deadline = deadlineTasksOf([source("deliverable", "Group Deliverable - Due", learn, 7)], ["deliverable"]);
assert.equal(deadline[0]?.dueUTC, at(7));
assert.equal(deadline[0]?.done, true);
assert.equal(deadlineTasksOf([source("deliverable", "Group Deliverable - Due", learn, 7)], []).length, 1);

console.log("Keyword task checks passed.");
