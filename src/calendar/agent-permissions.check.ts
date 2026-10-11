import assert from "node:assert/strict";
import { agentHiddenIdsOf, isAgentCalendarHidden, ALL_SOURCES, isCalendarReadOnly } from "./preferences";
import { buildUserCalendarPreferencesDoc, parseUserCalendarPreferencesDoc, readLocalCalendarPreferences } from "./calendar-preferences-doc";

const customId = "cal-11111111-1111-4111-8111-111111111111";
const hidden = agentHiddenIdsOf(["events", customId, customId, 42, ""]);
assert.deepEqual(hidden, [customId], "Agent Main cannot be hidden");
assert.equal(isAgentCalendarHidden(hidden, "events"), false);
assert.equal(isAgentCalendarHidden(hidden, customId), true);
const defaults = readLocalCalendarPreferences();
const parsed = parseUserCalendarPreferencesDoc({
  version: 1,
  agentHiddenCalendarIds: hidden,
  sources: { ...ALL_SOURCES, readOnlyCalendarIds: ["events", "tasks", customId] },
}, defaults);
assert.ok(parsed);
assert.deepEqual(parsed.sources.readOnlyCalendarIds, [customId], "Built-in and retired calendars cannot be read-only");
assert.equal(isCalendarReadOnly(parsed.sources, customId), true);
assert.equal(isCalendarReadOnly(parsed.sources, "events"), false);
assert.equal(isCalendarReadOnly(ALL_SOURCES, customId), false, "Hiding a calendar from the Agent does not restrict personal editing");
const saved = buildUserCalendarPreferencesDoc(parsed);
assert.deepEqual(saved.agentHiddenCalendarIds, hidden);
assert.deepEqual(saved.sources.readOnlyCalendarIds, [customId]);
const restored = parseUserCalendarPreferencesDoc(saved, defaults);
assert.ok(restored);
assert.deepEqual(restored.agentHiddenCalendarIds, hidden);
assert.deepEqual(restored.sources.readOnlyCalendarIds, [customId]);
console.log("Frontend Agent permission persistence checks passed.");
