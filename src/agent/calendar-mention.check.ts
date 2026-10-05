import assert from "node:assert/strict";
import { attachedIdsOf, calendarToken, matchCalendars, mentionAtCaret, messagePieces, stripMention, textForModel, type MentionCalendar } from "./calendar-mention";

const calendars: MentionCalendar[] = [
  { id: "events", name: "Agent Main", kind: "event", color: "#5b8a72" },
  { id: "tasks", name: "Tasks", kind: "task", color: "#c99a3c" },
  { id: "cal-0b5c2f8e-3a4d-4e1f-9c2b-7d6e5f4a3b2c", name: "School", kind: "event", color: "#888888" },
  { id: "cal-1c5c2f8e-3a4d-4e1f-9c2b-7d6e5f4a3b2d", name: "My School Notes", kind: "event", color: "#888888" },
];

assert.deepEqual(mentionAtCaret("plan @sch", 9), { start: 5, query: "sch" });
assert.equal(mentionAtCaret("email me@school", 14), null);
assert.equal(mentionAtCaret("@", 1)?.query, "");
assert.equal(mentionAtCaret("hello @", 7)?.start, 6);

const schoolFirst = matchCalendars(calendars, "sch").map((calendar) => calendar.name);
assert.deepEqual(schoolFirst, ["School", "My School Notes"]);
assert.deepEqual(matchCalendars(calendars, "scool").map((calendar) => calendar.name), ["My School Notes", "School"]);
assert.deepEqual(
  matchCalendars(calendars, "", [calendars[2].id]).map((calendar) => calendar.name),
  ["Agent Main", "Tasks", "My School Notes"],
);
assert.equal(stripMention("meet @sch tomorrow", 5, "sch"), "meet  tomorrow".replace(/[ \t]{2,}/g, " "));
assert.deepEqual(attachedIdsOf(["events", "events", "bogus", calendars[2].id, "ics:learn"]), ["events", calendars[2].id, "ics:learn"]);
const token = calendarToken("ics:learn");
assert.deepEqual(messagePieces(`next event in ${token}`, ["events"]), [
  { kind: "calendar", id: "events" },
  { kind: "text", text: "next event in " },
  { kind: "calendar", id: "ics:learn" },
]);
assert.equal(textForModel(`next event in ${token}`, () => "LEARN"), "next event in @LEARN");
assert.equal(textForModel(token, () => "LEARN"), "Use the attached calendar @LEARN.");

console.log("calendar mention checks passed.");
