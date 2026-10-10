import assert from "node:assert/strict";
import { agentHiddenIdsOf, isAgentCalendarHidden, ALL_SOURCES, isCalendarReadOnly } from "./preferences";
import { buildUserCalendarPreferencesDoc, parseUserCalendarPreferencesDoc, readLocalCalendarPreferences } from "./calendar-preferences-doc";

const hidden = agentHiddenIdsOf(["events", "tasks", "events", 42, ""]);
assert.deepEqual(hidden, ["events", "tasks"]);
assert.equal(isAgentCalendarHidden(hidden, "events"), true);
assert.equal(isAgentCalendarHidden(hidden, "tasks"), true);
const defaults = readLocalCalendarPreferences();
const parsed = parseUserCalendarPreferencesDoc({ version: 1, agentHiddenCalendarIds: hidden, agentReadOnlyCalendarIds: ["tasks", "tasks"] }, defaults);
assert.ok(parsed);
assert.deepEqual(parsed.agentReadOnlyCalendarIds, ["tasks"]);
assert.deepEqual(buildUserCalendarPreferencesDoc(parsed).agentHiddenCalendarIds, hidden);
assert.equal(isCalendarReadOnly(ALL_SOURCES, "tasks"), false, "Agent restrictions do not restrict personal editing");
console.log("Frontend Agent permission persistence checks passed.");
