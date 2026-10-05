import assert from "node:assert/strict";
import type { ImportedCalendar } from "@/calendar/types";
import {
  campusColorKey,
  campusSubscriptionsMatch,
  campusSubscriptionsOf,
  colorOverridesWithCampusSubscriptions,
  parseCampusSubscriptions,
  withCampusFeedColor,
} from "./campus-subscription-prefs";

const talksFeed = "feed-11111111-1111-4111-8111-111111111111";
const imported: ImportedCalendar[] = [
  {
    id: talksFeed,
    name: "Talks & seminars",
    url: "webcal://localhost:43117/api/campus-events/feed.ics?categories=talks",
  },
];

assert.deepEqual(campusSubscriptionsOf(imported, { "ics:feed-x": "#ff0000" }), [{ categoryId: "talks" }]);
assert.deepEqual(campusSubscriptionsOf(imported, { [campusColorKey("talks")]: "#4986e7" }), [{ categoryId: "talks", color: "#4986e7" }]);
assert.deepEqual(parseCampusSubscriptions([{ categoryId: "talks", color: "#4986e7" }, { categoryId: "bad id" }]), [
  { categoryId: "talks", color: "#4986e7" },
]);
assert.equal(campusSubscriptionsMatch(imported, [{ categoryId: "talks" }]), true);
assert.equal(campusSubscriptionsMatch(imported, [{ categoryId: "careers" }]), false);
assert.equal(colorOverridesWithCampusSubscriptions({}, [{ categoryId: "talks", color: "#4986e7" }])[campusColorKey("talks")], "#4986e7");
assert.equal(
  withCampusFeedColor({ [campusColorKey("talks")]: "#4986e7" }, "talks", "ics:feed-new")["ics:feed-new"],
  "#4986e7",
);

console.log("Campus subscription preference checks passed.");
