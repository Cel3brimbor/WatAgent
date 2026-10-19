import assert from "node:assert/strict";
import { newCalendarSpace } from "@/calendar/calendar-spaces";
import { patchListedDone, spaceImportedFeedsMatch, taskCompletionDocs } from "@/calendar/calendar-derived";
import type { KeywordTask } from "@/calendar/keyword-tasks";
import type { CalendarItemDoc } from "@/calendar/types";

function task(id: string, completed: boolean, title = "Read"): CalendarItemDoc {
  return {
    id,
    title,
    createdAt: 1,
    updatedAt: completed ? 2 : 1,
    calendar: {
      kind: "task",
      startUTC: 10,
      endUTC: 20,
      allDay: true,
      completed,
      calendarId: "tasks",
    },
  };
}

const open = task("t1", false);
const done = task("t1", true);
const other = task("t2", false, "Write");

const checked = taskCompletionDocs([open, other], [done, other]);
assert.ok(checked);
assert.equal(checked?.get("t1"), done);
assert.equal(checked?.size, 1);

assert.equal(taskCompletionDocs([open], [open])?.size, 0, "the same row is not a new edit");
assert.equal(taskCompletionDocs([open], [{ ...done, title: "Renamed" }]), null, "a rename still derives");
assert.equal(taskCompletionDocs([open], [done, other]), null, "a new row still derives");
assert.equal(taskCompletionDocs(null, [done]), null);

const listed: KeywordTask[] = [{
  key: "event-1",
  title: "Quiz",
  dueUTC: 30,
  allDay: false,
  calendarId: "events",
  keyword: "quiz",
  ruleId: "rule-1",
  ruleName: "Quiz",
  done: false,
  source: {
    key: "event-1",
    calendarId: "events",
    title: "Quiz",
    startUTC: 30,
    endUTC: 40,
    allDay: false,
  },
}];
const marked = patchListedDone(listed, ["event-1"]);
assert.equal(marked[0]?.done, true);
assert.equal(patchListedDone(marked, ["event-1"]), marked, "the same checks keep the list");
assert.equal(patchListedDone(marked, [])[0]?.done, false);

const feeds = [{ id: "learn" as const, name: "Learn", url: "https://example.test/learn.ics" }];
const plain = newCalendarSpace("Gym", "#7a5af8");
const tagged = {
  ...plain,
  colorOverrides: { events: "#ff0000" },
  mutedSmartTagIds: ["tag-1"],
  importedCalendars: feeds,
};
const retagged = { ...tagged, smartTags: [], colorOverrides: { events: "#00ff00" }, name: "Lift" };
assert.equal(spaceImportedFeedsMatch([tagged], [retagged]), true, "tags and colors are not a new feed");
assert.equal(spaceImportedFeedsMatch([tagged], [{ ...retagged, importedCalendars: [] }]), false);

console.log("calendar-derived.check.ts ok");
