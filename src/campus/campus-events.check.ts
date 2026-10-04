import assert from "node:assert/strict";
import type { CalendarItemDoc, ImportedCalendar } from "@/calendar/types";
import {
  campusDays,
  campusEventIcs,
  campusEventMeta,
  campusEventsOf,
  campusFeedCategories,
  campusFeedUrl,
  campusCalendarsOf,
  campusCategoryLabel,
  campusPlacements,
  googleCalendarLink,
  icsFileName,
  localSpan,
  matchesCampusQuery,
  toggledCategories,
  type CampusEvent,
} from "./campus-events";

//checks run in Waterloo's zone, like the people using this
process.env.TZ = "America/Toronto";

const categories = [
  { id: "academic", label: "Academic dates", hint: "" },
  { id: "careers", label: "Careers & co-op", hint: "" },
  { id: "talks", label: "Talks & seminars", hint: "" },
  { id: "arts", label: "Arts & culture", hint: "" },
];

const lecture: CampusEvent = {
  id: "uw-events:lecture",
  source: "uw-events",
  url: "https://uwaterloo.ca/events/events/hallman-lecture",
  title: "Hallman Lecture: rights, health; and policy",
  summary: "A talk, then a reception.",
  location: "Hagey Hall 1101",
  allDay: false,
  startUTC: Date.parse("2026-10-06T22:00:00Z"),
  endUTC: Date.parse("2026-10-07T00:00:00Z"),
  categories: ["talks"],
  tags: ["Current students"],
};
const readingWeek: CampusEvent = {
  id: "uw-important-dates:rw",
  source: "uw-important-dates",
  url: "https://uwaterloo.ca/important-dates/undergraduate/2026-2027/reading-week",
  title: "Reading Week",
  allDay: true,
  startUTC: Date.parse("2026-10-10T04:00:00Z"),
  endUTC: Date.parse("2026-10-19T04:00:00Z"),
  startDate: "2026-10-10",
  endDate: "2026-10-19",
  categories: ["academic"],
  tags: ["Fall 2026"],
};

//payload: bad events dropped, unknown categories fall back to other, events sorted
const payload = campusEventsOf({
  status: "ready",
  updatedAt: 1_790_000_000_000,
  categories,
  sources: [{ id: "uw-events", name: "UWaterloo events", url: "https://uwaterloo.ca/events/events" }, { id: "x", name: "Bad", url: "javascript:alert(1)" }],
  events: [
    readingWeek,
    { ...lecture, categories: ["talks", "made-up"] },
    { ...lecture, id: "bad-url", url: "http://uwaterloo.ca/x" },
    { ...lecture, id: "bad-time", endUTC: lecture.startUTC },
    { ...readingWeek, id: "bad-day", endDate: undefined },
    { ...lecture, id: "loose", categories: ["made-up"] },
  ],
});
assert.deepEqual(payload.events.map((event) => event.id), ["uw-events:lecture", "loose", "uw-important-dates:rw"]);
assert.deepEqual(payload.events[0].categories, ["talks"]);
assert.deepEqual(payload.events[1].categories, ["other"]);
assert.deepEqual(payload.sources.map((source) => source.id), ["uw-events"]);
assert.equal(campusEventsOf({ status: "loading" }).status, "loading");
assert.equal(campusEventsOf(null).events.length, 0);

//subscription links: webcal for a plain-http API, https stays https, and they read back
assert.equal(campusFeedUrl(["careers", "talks"], "http://localhost:43117"), "webcal://localhost:43117/api/campus-events/feed.ics?categories=careers,talks");
assert.equal(campusFeedUrl(["arts"], "https://api.watagent.app"), "https://api.watagent.app/api/campus-events/feed.ics?categories=arts");
assert.equal(campusFeedUrl([], "https://api.watagent.app"), "https://api.watagent.app/api/campus-events/feed.ics");
assert.deepEqual(campusFeedCategories("webcal://localhost:43117/api/campus-events/feed.ics?categories=careers,talks,careers"), ["careers", "talks"]);
assert.deepEqual(campusFeedCategories("https://elsewhere.example/api/campus-events/feed.ics"), []);
assert.equal(campusFeedCategories("https://d2l.example/calendar.ics"), null);
const imported: ImportedCalendar[] = [
  { id: "learn", name: "LEARN", url: "https://learn.uwaterloo.ca/d2l/le/calendar/feed/user/feed.ics?token=x" },
  { id: "feed-11111111-1111-4111-8111-111111111111", name: "UWaterloo events", url: "webcal://localhost:43117/api/campus-events/feed.ics?categories=talks" },
];
assert.deepEqual(campusCalendarsOf(imported).map((entry) => entry.categories), [["talks"]]);
assert.deepEqual(campusCalendarsOf(imported.slice(0, 1)), []);
assert.equal(campusCategoryLabel("talks"), "Talks & seminars");
assert.deepEqual(toggledCategories(["talks"], "academic", true, categories), ["academic", "talks"]);
assert.deepEqual(toggledCategories(["academic", "talks"], "talks", false, categories), ["academic"]);

//calendar items: all-day events on local midnights, timed ones as they are
assert.deepEqual(localSpan(readingWeek), { startUTC: new Date(2026, 9, 10).getTime(), endUTC: new Date(2026, 9, 19).getTime() });
assert.deepEqual(campusEventMeta(lecture, "events"), {
  kind: "event",
  startUTC: lecture.startUTC,
  endUTC: lecture.endUTC,
  allDay: false,
  calendarId: undefined,
  location: "Hagey Hall 1101",
  description: "A talk, then a reception.\n\nhttps://uwaterloo.ca/events/events/hallman-lecture",
});
assert.equal(campusEventMeta(readingWeek, "cal-11111111-1111-4111-8111-111111111111").calendarId, "cal-11111111-1111-4111-8111-111111111111");

//already on your calendar: your own copy beats the subscription's, other imports don't count
const item = (title: string, startUTC: number, importSource?: string): CalendarItemDoc =>
  ({ id: title, title, calendar: { kind: "event", startUTC, endUTC: startUTC + 1, allDay: false, ...(importSource ? { importSource } : {}) }, createdAt: 0, updatedAt: 0 }) as CalendarItemDoc;
const feed = "feed-11111111-1111-4111-8111-111111111111";
const placed = campusPlacements(
  [item("hallman lecture:  rights, health; and policy", lecture.startUTC, feed), item("Reading Week", localSpan(readingWeek).startUTC, "learn")],
  [feed],
);
assert.equal(placed(lecture), "subscribed");
assert.equal(placed(readingWeek), null);
assert.equal(campusPlacements([item("Hallman Lecture: rights, health; and policy", lecture.startUTC, feed), item("Hallman Lecture: rights, health; and policy", lecture.startUTC)], [feed])(lecture), "added");

//search: every word, any field, accents ignored
assert.equal(matchesCampusQuery(lecture, "hallman HAGEY"), true);
assert.equal(matchesCampusQuery(lecture, "current students"), true);
assert.equal(matchesCampusQuery({ ...lecture, title: "Writing Café" }, "cafe"), true);
assert.equal(matchesCampusQuery(lecture, "hallman football"), false);

//days: repeats fold into one series under their next date; an ongoing event shows under today
const gallery = (day: number): CampusEvent => ({
  ...lecture,
  id: `gallery-${day}`,
  url: "https://uwaterloo.ca/events/events/notes-to-self",
  title: "Notes to Self",
  startUTC: new Date(2026, 9, day, 12).getTime(),
  endUTC: new Date(2026, 9, day, 17).getTime(),
});
const now = new Date(2026, 9, 12, 13).getTime();
const days = campusDays([gallery(11), gallery(13), gallery(12), gallery(14), readingWeek, lecture], now);
assert.deepEqual(
  days.map((day) => [day.key, day.series.map((series) => [series.next.id, series.more.length])]),
  [["2026-10-12", [["uw-important-dates:rw", 0], ["gallery-12", 2]]]],
);

//other calendar apps
const google = new URL(googleCalendarLink(lecture));
assert.equal(google.origin + google.pathname, "https://calendar.google.com/calendar/render");
assert.equal(google.searchParams.get("dates"), "20261006T220000Z/20261007T000000Z");
assert.equal(google.searchParams.get("location"), "Hagey Hall 1101");
assert.equal(new URL(googleCalendarLink(readingWeek)).searchParams.get("dates"), "20261010/20261019");
const ics = campusEventIcs({ ...lecture, summary: "Long ".repeat(40) + "— café" }, Date.parse("2026-10-04T16:00:00Z"));
assert.ok(ics.split("\r\n").every((row) => new TextEncoder().encode(row).length <= 75));
assert.match(ics, /SUMMARY:Hallman Lecture: rights\\, health\\; and policy\r\n/);
assert.match(campusEventIcs(readingWeek, 0), /DTSTART;VALUE=DATE:20261010\r\nDTEND;VALUE=DATE:20261019\r\n/);
assert.equal(icsFileName(lecture), "hallman-lecture-rights-health-and-policy.ics");

console.log("Campus events client checks passed.");
