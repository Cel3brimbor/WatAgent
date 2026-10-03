import assert from "node:assert/strict";
import { agentRuleOf, rulePreviewOf, ruleRunLineOf, ruleRunOf, ruleRunSummary } from "./rules-client";

const raw = {
  id: "r1",
  name: " Study blocks ",
  sourceFeed: "learn",
  targetCalendarId: "events",
  instruction: "Add a study block before each quiz.",
  titleContains: "",
  lookaheadDays: 99,
  requireApproval: true,
  enabled: false,
  createdAt: 1,
  updatedAt: 2,
  lastRun: { id: "run", trigger: "manual", status: "done", added: 2, matched: "3", error: null, startedAt: 5, finishedAt: 6 },
};
const rule = agentRuleOf(raw);
assert.ok(rule);
assert.equal(rule.name, "Study blocks");
assert.equal(rule.titleContains, null, "an empty filter means none");
assert.equal(rule.lookaheadDays, 21, "an out-of-range look-ahead falls back");
assert.equal(rule.enabled, false);
assert.deepEqual(rule.lastRun && [rule.lastRun.trigger, rule.lastRun.added, rule.lastRun.matched], ["manual", 2, 3]);
assert.equal(agentRuleOf({ ...raw, targetCalendarId: "ics:learn" }), null, "rules only add to WatAgent calendars");
assert.equal(agentRuleOf({ ...raw, sourceFeed: "google" }), null);
assert.equal(agentRuleOf({ ...raw, instruction: " " }), null);
assert.equal(ruleRunOf(null), null);

const preview = rulePreviewOf({ matched: 4, added: 2, proposals: [{ sourceId: "q1", sourceTitle: "Quiz 1", action: "add", title: "Study", date: "2026-10-06", allDay: false, startTime: "19:00" }, { title: "broken" }] });
assert.equal(preview.matched, 4);
assert.equal(preview.proposals.length, 1, "malformed proposals are dropped");
assert.deepEqual(rulePreviewOf(null).proposals, []);

assert.equal(ruleRunLineOf({ type: "done" }), null);
const done = ruleRunLineOf({ type: "rule", id: "r1", name: "Study blocks", state: "done", added: 3, pending: 3 });
assert.ok(done);
assert.equal(ruleRunSummary(done), "Study blocks: 3 waiting for your approval");
assert.equal(ruleRunSummary({ ...done, pending: 1, removed: 1 }), "Study blocks: 3 added, 1 removed (1 waiting for approval)");
assert.equal(ruleRunSummary({ ...done, added: 0 }), null, "a run that changed nothing says nothing");
assert.equal(ruleRunSummary({ ...done, state: "failed", error: "Too many runs." }), "Study blocks: Too many runs.");
assert.equal(ruleRunSummary({ ...done, state: "running" }), null);

console.log("Agent rules client checks passed.");
