import assert from "node:assert/strict";
import { DEFAULT_VIEW, parseView } from "./view-preferences";

for (const invalid of [null, "bad", 42, { zoom: Infinity, connections: "unknown", labels: "false", locked: 1 }]) {
  assert.deepEqual(parseView(invalid), DEFAULT_VIEW, "malformed stored values use safe defaults");
}
const custom = { zoom: 0.8, connections: "selected", labels: true, locked: true, background: false } as const;
assert.deepEqual(parseView(JSON.parse(JSON.stringify(custom))), custom, "customization survives persistence");
assert.equal(parseView({ zoom: 10 }).zoom, 1.5, "large stored zoom is bounded");
assert.equal(parseView({ zoom: -1 }).zoom, 0.5, "negative stored zoom cannot invert the canvas");
assert.equal(parseView({ connections: "none" }).connections, "none");
console.log("Map view preference checks passed.");
