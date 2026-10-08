import assert from "node:assert/strict";
import { isBottomDeadline, mergeTimeline, normalizedCalendarTitle, pinBottomDeadlines, sharedEventCounts } from "./calendar-merge";
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

//nested titles at the same times are copies
const formStart = new Date(2026, 8, 29, 11, 30).getTime();
const form = { ...learn, id: "form", title: "Video Release Form", startUTC: formStart, endUTC: formStart };
const formDue = { ...portal, id: "form-due", title: "Video Release Form - Due", startUTC: formStart, endUTC: formStart };
assert.deepEqual(ids(mergeTimeline([formDue, form], [school])), ["form"]);
assert.deepEqual(ids(mergeTimeline([formDue, { ...form, id: "form-later", endUTC: formStart + 60000 }], [school])), ["form-later"], "a due-variant on the same day is one event");

//portal "Exercise 01" and learn "Exercise 01 - Due" are one quiz. the copy with the link shows
const quizStart = new Date(2026, 9, 9, 22).getTime();
const portalQuiz: TimelineItem = { ...portal, id: "exercise", title: "Exercise 01", startUTC: quizStart, endUTC: quizStart + 3600000, description: undefined };
const learnQuiz: TimelineItem = { ...learn, id: "exercise-due", title: "Exercise 01 - Due", startUTC: quizStart, endUTC: quizStart + 3600000, description: "Quizzes: Exercise 01" };
assert.deepEqual(ids(mergeTimeline([portalQuiz, learnQuiz], [{ ...school, members: ["ics:portal", "ics:learn"] }])), ["exercise-due"], "learn keeps the quiz link when portal is ranked first");
const lateDue: TimelineItem = { ...learnQuiz, id: "late-due", startUTC: quizStart + 3600000, endUTC: quizStart + 2 * 3600000 };
assert.deepEqual(ids(mergeTimeline([portalQuiz, lateDue], [school])), ["late-due"], "same-day due-variants merge even when the clocks differ");
const nextQuiz: TimelineItem = { ...learnQuiz, id: "next-quiz", startUTC: new Date(2026, 9, 10, 22).getTime(), endUTC: new Date(2026, 9, 10, 23).getTime() };
assert.deepEqual(ids(mergeTimeline([portalQuiz, nextQuiz], [school])).sort(), ["exercise", "next-quiz"], "a due on another day stays");
const lab: TimelineItem = { ...portal, id: "lab", title: "Lab", startUTC: quizStart, endUTC: quizStart + 3600000 };
const labDue: TimelineItem = { ...learn, id: "lab-due", title: "Lab 1 - Due", startUTC: quizStart + 30 * 60000, endUTC: quizStart + 90 * 60000 };
assert.deepEqual(ids(mergeTimeline([lab, labDue], [school])).sort(), ["lab", "lab-due"], "a shorter name inside a different title is not a copy");
assert.deepEqual(ids(mergeTimeline([portalQuiz, { ...portalQuiz, id: "portal-due", title: "Exercise 01 - Due", description: "quiz link" }], [])), ["portal-due"], "one feed keeps the due copy that has details");
const hours: TimelineItem = { ...portal, id: "h1", title: "Office hours", startUTC: quizStart, endUTC: quizStart + 3600000 };
const hoursLater: TimelineItem = { ...hours, id: "h2", startUTC: quizStart + 4 * 3600000, endUTC: quizStart + 5 * 3600000 };
assert.deepEqual(ids(mergeTimeline([hours, hoursLater], [])).sort(), ["h1", "h2"], "two same-titled events on one feed stay");

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

assert.equal(detectCalendarLink(learnUrl), "learn");
assert.equal(defaultImportedName(learnUrl, []), "LEARN / Brightspace");
assert.equal(defaultImportedName(learnUrl, [{ name: "LEARN / Brightspace" }, { name: "LEARN / Brightspace 2" }]), "LEARN / Brightspace 3");
assert.equal(defaultImportedName("https://example.com/a.ics", []), "Imported calendar");

//an 11:59pm due sits with the all-day items on the day it is due, and not on the next morning
const dueStart = new Date(2026, 9, 7, 23, 59).getTime();
const deliverable: TimelineItem = { ...learn, id: "deliverable", title: "Group Deliverable 1 (Part 1) submission [Sec 003 Groups 21-40] - Due", startUTC: dueStart, endUTC: dueStart + 3600000 };
const wednesday = new Date(2026, 9, 7);
const thursday = new Date(2026, 9, 8);
assert.equal(isBottomDeadline(deliverable, []), true);
assert.equal(pinBottomDeadlines([deliverable], wednesday, [])[0]?.pinned, true);
assert.deepEqual(pinBottomDeadlines([deliverable], thursday, []), []);
const eveningQuiz: TimelineItem = { ...learn, id: "evening", title: "Exercise 01", startUTC: quizStart, endUTC: quizStart + 3600000 };
assert.equal(pinBottomDeadlines([eveningQuiz], new Date(2026, 9, 9), [])[0]?.pinned, undefined, "a 10pm quiz stays on the grid");
const nightLab: TimelineItem = { ...learn, id: "night-lab", title: "Night lab", startUTC: new Date(2026, 9, 7, 23, 30).getTime(), endUTC: new Date(2026, 9, 8, 0, 30).getTime() };
assert.equal(pinBottomDeadlines([nightLab], wednesday, [])[0]?.pinned, undefined, "a class that starts at 11:30 stays timed");
const ownLate: TimelineItem = { ...deliverable, id: "own-late", importSource: undefined };
assert.equal(pinBottomDeadlines([ownLate], wednesday, [])[0]?.pinned, undefined, "a hand-made event stays where it was placed");
const morning: TimelineItem = { ...learn, id: "morning", title: "Lecture", startUTC: new Date(2026, 9, 7, 9).getTime(), endUTC: new Date(2026, 9, 7, 10).getTime() };
assert.deepEqual(ids(pinBottomDeadlines([morning, deliverable], wednesday, [])), ["deliverable", "morning"], "deadlines sort above timed events");

console.log("Merged calendar, shared count, imported list and migration checks passed.");
