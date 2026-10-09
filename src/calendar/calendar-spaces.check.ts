import assert from "node:assert/strict";
import {
  MAIN_CALENDAR_SPACE_ID,
  activeSpaceIdOf,
  calendarSpacesOf,
  itemInCalendarSpace,
  itemOnMainCalendar,
  newCalendarSpace,
  spaceNameError,
  spaceOnlyFeedIds,
} from "./calendar-spaces";
import type { CalendarItemMeta } from "./types";

const sports = newCalendarSpace("  Sports  ", "#16A765", "month");
assert.match(sports.id, /^space-[0-9a-f-]{36}$/);
assert.equal(sports.name, "Sports");
assert.equal(sports.color, "#16a765");
assert.equal(sports.view, "month");
assert.equal(sports.icon, "layers");
assert.deepEqual(sports.colorOverrides, {});
assert.deepEqual(sports.smartTags, []);
assert.deepEqual(sports.importedCalendars, []);
assert.equal(spaceNameError([sports], "sports"), "You already have a Quick Display with this name.");
assert.equal(spaceNameError([sports], "Main"), "Main is your main calendar.");
assert.equal(spaceNameError([sports], "Club"), null);

const feed = "feed-0b5c2f8e-3a4d-4e1f-9c2b-7d6e5f4a3b2c";
const learn = "learn";
const parsed = calendarSpacesOf([
  { ...sports, importedCalendars: [
    { id: feed, name: "Team", url: "https://example.com/team.ics" },
    { id: learn, name: "LEARN", url: "https://learn.example/feed.ics" },
    { id: feed, name: "Again", url: "https://example.com/team.ics" },
  ] },
  { id: "space-nope", name: "Bad", color: "#16a765", view: "week" },
  { id: sports.id, name: "Main", color: "#4986e7", view: "week", importedCalendars: [] },
], new Set([feed]));
assert.equal(parsed.length, 1);
assert.deepEqual(parsed[0].importedCalendars, [], "a feed main already owns stays on main");

const owned = calendarSpacesOf([{
  id: sports.id,
  name: "Sports",
  color: "#16a765",
  view: "week",
  importedCalendars: [{ id: feed, name: "Team", url: "webcal://example.com/team.ics" }],
  includedCalendarIds: ["events", "events"],
  mutedIds: [],
}]);
assert.equal(owned[0].importedCalendars[0].id, feed);
assert.equal(owned[0].icon, "layers");
assert.deepEqual(owned[0].includedCalendarIds, ["events"]);
assert.deepEqual(owned[0].colorOverrides, {});

const tinted = calendarSpacesOf([{
  id: sports.id,
  name: "Sports",
  icon: "bolt",
  color: "#16a765",
  view: "week",
  importedCalendars: [],
  includedCalendarIds: ["events"],
  mutedIds: [],
  colorOverrides: { events: "#F83A22", bad: "red" },
  smartTags: [{
    id: "tag-1",
    name: "Gym",
    color: "#4986e7",
    enabled: true,
    match: "any",
    cover: "half",
    rules: [{ id: "rule-1", field: "title", operator: "contains", value: "gym" }],
    exemptCalendarIds: [],
  }],
}]);
assert.equal(tinted[0].icon, "bolt");
assert.deepEqual(tinted[0].colorOverrides, { events: "#f83a22" });
assert.equal(tinted[0].smartTags[0].name, "Gym");

const only = spaceOnlyFeedIds(owned, ["learn"]);
assert.equal(only.has(feed), true);
assert.equal(spaceOnlyFeedIds(owned, [feed]).has(feed), false, "a feed listed on main is not space-only");
assert.equal(itemOnMainCalendar(feed, only), false);
assert.equal(itemOnMainCalendar("learn", only), true);
assert.equal(itemOnMainCalendar(undefined, only), true);

const event: CalendarItemMeta = { kind: "event", startUTC: 1, endUTC: 2, allDay: false };
assert.equal(itemInCalendarSpace(event, owned[0]), true);
assert.equal(itemInCalendarSpace({ ...event, importSource: feed }, owned[0]), true);
assert.equal(itemInCalendarSpace({ ...event, importSource: "portal" }, owned[0]), false);
assert.equal(
  itemInCalendarSpace(
    { ...event, importSource: "learn" },
    { ...owned[0], includedCalendarIds: ["merge-x"] },
    [{ id: "merge-x", members: ["ics:learn", "ics:portal"] }],
  ),
  true,
);
const hidden = { ...owned[0], mutedIds: [`ics:${feed}`], includedCalendarIds: [] };
assert.equal(itemInCalendarSpace({ ...event, importSource: feed }, hidden), false);
assert.equal(itemInCalendarSpace(event, hidden), false);
assert.equal(activeSpaceIdOf(owned[0].id, owned), owned[0].id);
assert.equal(activeSpaceIdOf("missing", owned), MAIN_CALENDAR_SPACE_ID);
