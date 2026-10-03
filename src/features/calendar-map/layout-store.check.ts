import assert from "node:assert/strict";
import { createLocalLayoutStore, parseLayout } from "./layout-store";

assert.deepEqual(parseLayout(null), {});
assert.deepEqual(parseLayout([1, 2]), {});
assert.deepEqual(parseLayout({ a: { x: 0.2, y: 0.4 }, b: { x: "1", y: 0 }, c: { x: Infinity, y: 0 }, d: null }), { a: { x: 0.2, y: 0.4 } });
assert.deepEqual(parseLayout({ far: { x: 3, y: -2 } }), { far: { x: 1, y: 0 } }, "positions clamp to the canvas");
const hostile = parseLayout(JSON.parse('{"__proto__": {"x": 0.1, "y": 0.1}, "ok": {"x": 0.5, "y": 0.5}}'));
assert.deepEqual(Object.keys(hostile), ["ok"], "prototype keys are dropped");
assert.equal(Object.getPrototypeOf(hostile), Object.prototype);

const memory = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
  },
});
const store = createLocalLayoutStore("map.test");
assert.deepEqual(store.load(), {}, "nothing saved yet");
store.save({ learn: { x: 0.123456, y: 0.5 } });
assert.deepEqual(store.load(), { learn: { x: 0.1235, y: 0.5 } }, "saved positions round to 4 places");
store.save({});
assert.equal(memory.has("map.test"), false, "an empty layout clears the key");
memory.set("map.test", "{not json");
assert.deepEqual(store.load(), {}, "a corrupt value starts fresh");
Object.assign(globalThis, {
  localStorage: {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => undefined,
  },
});
assert.deepEqual(store.load(), {}, "blocked storage starts fresh");
store.save({ a: { x: 0, y: 0 } });

console.log("Map layout store checks passed.");
