import assert from "node:assert/strict";
import { mergeTimeline, normalizedCalendarTitle, sharedEventCounts } from "./calendar-merge";
import {
  defaultImportedName,
  detectCalendarLink,
  feedOfCalendarId,
  importedCalendarsOf,
  legacyMergedCalendars,
  LEGACY_MERGED_ID,
  mergedCalendarsOf,
} from "./imported-calendars";
import type { MergedCalendar, TimelineItem } from "./types";

const start = new Date(2026, 9, 1, 12).getTime();
const learn: TimelineItem = { id: "learn", kind: "event", title: " CS 246   Assignment 1 ", startUTC: start, endUTC: start + 3600000, allDay: false, importSource: "learn", description: "Full assignment details" };
const portal: TimelineItem = { ...learn, id: "portal", title: "cs 246 assignment 1", importSource: "portal", description: undefined };
const nextDay: TimelineItem = { ...portal, id: "tomorrow", startUTC: new Date(2026, 9, 2, 12).getTime() };
const school: MergedCalendar = { id: "merge-0b5c2f8e-3a4d-4e1f-9c2b-7d6e5f4a3b2c", name: "School", members: ["ics:learn", "ics:portal"] };
const ids = (items: TimelineItem[]) => items.map((item) => item.id);

assert.equal(normalizedCalendarTitle("Ａssignment   1"), "assignment 1");

//merging
assert.deepEqual(ids(mergeTimeline([portal, learn], [school])), ["learn"], "the first member's copy shows");
assert.deepEqual(ids(mergeTimeline([portal, learn], [{ ...school, members: ["ics:portal", "ics:learn"] }])), ["portal"]);
assert.deepEqual(ids(mergeTimeline([portal, learn], [])), ["portal", "learn"], "without a merge both copies show");
assert.deepEqual(ids(mergeTimeline([learn, nextDay], [school])), ["learn", "tomorrow"], "events only in one member still show");
assert.equal(mergeTimeline([learn], [school])[0].mergedCalendarId, school.id, "members' events show under the merged calendar");
assert.equal(mergeTimeline([learn], [])[0].mergedCalendarId, undefined);
assert.equal(portal.description, undefined, "records are not overwritten");

const other: TimelineItem = { ...portal, id: "other", importSource: "other" };
const manual: TimelineItem = { ...portal, id: "manual", importSource: undefined };
assert.deepEqual(ids(mergeTimeline([learn, other, manual], [school])), ["learn", "other", "manual"], "calendars outside the merge are untouched");

const task = { ...portal, id: "task", kind: "task" as const };
const draft = { ...portal, id: "draft", editorDraft: true };
const pending = { ...portal, id: "pending", pendingApproval: true };
assert.deepEqual(ids(mergeTimeline([learn, task, draft, pending], [school])), ["learn", "task", "draft", "pending"], "tasks, drafts and pending changes never hide");

const feed = "feed-0b5c2f8e-3a4d-4e1f-9c2b-7d6e5f4a3b2c" as const;
const club: TimelineItem = { ...portal, id: "club", importSource: feed };
const three: MergedCalendar = { ...school, members: [`ics:${feed}`, "ics:learn", "ics:portal"] };
assert.deepEqual(ids(mergeTimeline([portal, learn, club], [three])), ["club"], "any number of members");

//same-feed copies
assert.deepEqual(ids(mergeTimeline([learn, { ...learn, id: "copy" }], [])), ["learn"], "identical copies from one feed show once");
assert.deepEqual(ids(mergeTimeline([portal, { ...portal, id: "room", location: "MC 2038" }], [])), ["portal", "room"], "same time in another room is a different event");
assert.deepEqual(ids(mergeTimeline([manual, { ...manual, id: "manual-copy" }], [])), ["manual", "manual-copy"], "hand-made events are never hidden");

//a longer title, a different end, or another room is not the same imported event
const formStart = new Date(2026, 8, 29, 11, 30).getTime();
const form = { ...learn, id: "form", title: "Video Release Form", startUTC: formStart, endUTC: formStart };
const formDue = { ...portal, id: "form-due", title: "Video Release Form - Due", startUTC: formStart, endUTC: formStart };
assert.deepEqual(ids(mergeTimeline([formDue, form], [school])).sort(), ["form", "form-due"]);
assert.deepEqual(ids(mergeTimeline([formDue, { ...form, id: "form-later", endUTC: formStart + 60000 }], [school])).sort(), ["form-due", "form-later"]);
const cif = { ...learn, id: "cif", title: "Open Rec Badminton", location: "CIF Gym 3" };
const pac = { ...portal, id: "pac", title: "Open Rec Badminton", location: "PAC Small Gym" };
assert.deepEqual(ids(mergeTimeline([cif, pac], [school])).sort(), ["cif", "pac"], "the room is part of the event");

//google is last whenever the event also exists on another calendar
const googleLearn: TimelineItem = { ...learn, id: "g-learn", kind: "gcal_event", importSource: undefined, google: { calendarName: "LEARN calendar" } };
const googlePortal: TimelineItem = { ...portal, id: "g-portal", kind: "gcal_event", importSource: undefined, google: { calendarName: "UWaterloo Portal" } };
const googlePersonal: TimelineItem = { ...learn, id: "g-personal", kind: "gcal_event", importSource: undefined, google: { calendarName: "Personal" } };
assert.deepEqual(ids(mergeTimeline([googlePortal, googleLearn], [])), ["g-learn"], "between Google subscriptions, Portal still loses to LEARN");
assert.deepEqual(ids(mergeTimeline([googleLearn, learn, portal], [school])), ["learn"], "an imported copy beats Google");
assert.deepEqual(ids(mergeTimeline([googlePersonal, learn], [])), ["learn"], "Google loses even when the calendars are not merged");
assert.deepEqual(ids(mergeTimeline([googlePersonal, manual], [])), ["manual"], "a WatAgent event beats Google");
assert.deepEqual(ids(mergeTimeline([googlePersonal], [])), ["g-personal"], "a Google-only event still shows");
assert.deepEqual(ids(mergeTimeline([googlePersonal, task], [])), ["g-personal", "task"], "tasks never hide a Google event");
assert.deepEqual(ids(mergeTimeline([googlePersonal, googleLearn], [])), ["g-personal", "g-learn"], "other Google calendars are not ranked against each other");

//shared counts
assert.deepEqual(sharedEventCounts([learn, portal, nextDay], [school]), new Map([["ics:learn", 1], ["ics:portal", 1]]));
assert.deepEqual(sharedEventCounts([learn, { ...learn, id: "copy" }, portal], [school]), new Map([["ics:learn", 1], ["ics:portal", 1]]), "two copies in one feed count once");
assert.deepEqual(sharedEventCounts([learn, nextDay], [school]), new Map([["ics:learn", 0], ["ics:portal", 0]]), "different days share nothing");

//saved lists
const learnUrl = "https://learn.uwaterloo.ca/d2l/le/calendar/feed/user/feed.ics";
assert.deepEqual(importedCalendarsOf(undefined, { learn: learnUrl, portal: "" }, { learn: "Courses" }), [{ id: "learn", name: "Courses", url: learnUrl }], "old slots become list entries");
assert.deepEqual(importedCalendarsOf([], { learn: learnUrl }), [], "a saved list wins over old slots");
assert.deepEqual(importedCalendarsOf([{ id: feed, name: "Club", url: "webcal://x.example/c.ics" }, { id: feed, name: "Again", url: learnUrl }, { id: "feed-x", name: "Bad", url: learnUrl }]).map((calendar) => calendar.name), ["Club"]);
assert.deepEqual(mergedCalendarsOf([school, { ...school, id: "merge-1b5c2f8e-3a4d-4e1f-9c2b-7d6e5f4a3b2c", members: ["ics:portal", `ics:${feed}`] }]).map((calendar) => calendar.members), [["ics:learn", "ics:portal"]], "each calendar joins one merge");
assert.deepEqual(mergedCalendarsOf([{ ...school, members: ["ics:learn"] }]), [], "a merge needs two members");
assert.equal(feedOfCalendarId(`ics:${feed}`), feed);
assert.equal(feedOfCalendarId("events"), null);

//the old priority order becomes one merged calendar
const both = [{ id: "learn" as const, name: "LEARN", url: learnUrl }, { id: "portal" as const, name: "Portal", url: "https://portal.example/a.ics" }];
assert.deepEqual(legacyMergedCalendars(["portal", "learn", "google"], false, null, both), [{ id: LEGACY_MERGED_ID, name: "Portal + LEARN", members: ["ics:portal", "ics:learn"] }]);
assert.deepEqual(legacyMergedCalendars(undefined, undefined, null, both)[0].members, ["ics:learn", "ics:portal"], "LEARN won by default");
assert.deepEqual(legacyMergedCalendars(undefined, undefined, "portal", both)[0].members, ["ics:portal", "ics:learn"]);
assert.deepEqual(legacyMergedCalendars(["learn", "portal"], true, null, both), [], "showing both copies meant no merge");
assert.deepEqual(legacyMergedCalendars(["learn", "portal"], false, null, both.slice(0, 1)), [], "one feed has nothing to merge");

//uwaterloo event calendars lose to learn and portal, and two category copies show once
const talksFeed = "feed-11111111-1111-4111-8111-111111111111" as const;
const careersFeed = "feed-22222222-2222-4222-8222-222222222222" as const;
const talksUrl = "webcal://localhost/api/campus-events/feed.ics?categories=talks";
const careersUrl = "webcal://localhost/api/campus-events/feed.ics?categories=careers";
const campusTalks: TimelineItem = { ...learn, id: "campus-talks", importSource: talksFeed };
const campusCareers: TimelineItem = { ...learn, id: "campus-careers", importSource: careersFeed };
const campusImported = [
  { id: "learn" as const, name: "LEARN", url: learnUrl },
  { id: "portal" as const, name: "Portal", url: "https://portal.example/a.ics" },
  { id: talksFeed, name: "Talks & seminars", url: talksUrl },
  { id: careersFeed, name: "Careers & co-op", url: careersUrl },
];
assert.deepEqual(ids(mergeTimeline([campusTalks, learn], [], campusImported)), ["learn"], "learn beats a uwaterloo events calendar");
assert.deepEqual(ids(mergeTimeline([campusTalks, portal], [], campusImported)), ["portal"], "portal beats a uwaterloo events calendar");
assert.deepEqual(ids(mergeTimeline([campusTalks, googleLearn], [], campusImported)), ["g-learn"], "a google learn calendar beats uwaterloo events");
assert.deepEqual(ids(mergeTimeline([campusTalks, googlePortal], [], campusImported)), ["g-portal"], "a google portal calendar beats uwaterloo events");
assert.deepEqual(ids(mergeTimeline([campusTalks], [], campusImported)), ["campus-talks"], "a uwaterloo event with no school copy still shows");
assert.deepEqual(ids(mergeTimeline([campusCareers, campusTalks], [], campusImported)), ["campus-talks"], "two uwaterloo calendars show the event once");
const campusFirst: MergedCalendar = { ...school, members: [`ics:${talksFeed}`, "ics:learn"] };
assert.deepEqual(ids(mergeTimeline([campusTalks, learn], [campusFirst], campusImported)), ["learn"], "learn still wins when the uwaterloo calendar is ranked first");
assert.deepEqual(ids(mergeTimeline([campusTalks, manual], [], campusImported)), ["campus-talks", "manual"], "a watagent event is not a learn or portal copy");

//same drop-in name on one day is still a different session when the hours or the room differ
const badminton = (id: string, hour: number, endHour: number, location: string): TimelineItem => ({
  id,
  kind: "event",
  title: "Open Rec Badminton",
  startUTC: new Date(2026, 9, 17, hour).getTime(),
  endUTC: new Date(2026, 9, endHour <= hour ? 18 : 17, endHour).getTime(),
  allDay: false,
  importSource: talksFeed,
  location,
});
assert.deepEqual(
  ids(mergeTimeline([
    badminton("morning", 6, 17, "CIF Gym 3"),
    badminton("evening", 18, 0, "CIF Gym 3"),
    badminton("late", 21, 0, "PAC Small Gym"),
  ], [], campusImported)).sort(),
  ["evening", "late", "morning"],
);

assert.equal(detectCalendarLink(learnUrl), "learn");
assert.equal(defaultImportedName(learnUrl, []), "LEARN / Brightspace");
assert.equal(defaultImportedName(learnUrl, [{ name: "LEARN / Brightspace" }, { name: "LEARN / Brightspace 2" }]), "LEARN / Brightspace 3");
assert.equal(defaultImportedName("https://example.com/a.ics", []), "Imported calendar");

console.log("Merged calendar, shared count, imported list and migration checks passed.");
