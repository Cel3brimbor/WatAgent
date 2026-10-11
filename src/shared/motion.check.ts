import assert from "node:assert/strict";
import { animateSpring } from "./motion";

let now = 0;
let nextId = 0;
let frames = new Map<number, FrameRequestCallback>();
Object.defineProperty(globalThis, "performance", { value: { now: () => now }, configurable: true });
globalThis.requestAnimationFrame = (callback) => { frames.set(++nextId, callback); return nextId; };
globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
function tick(ms: number) {
  now += ms;
  const pending = frames;
  frames = new Map();
  pending.forEach((callback) => callback(now));
}
function sample(hz: number) {
  now = 0;
  frames.clear();
  let value = 0;
  let completed = 0;
  animateSpring({ from: 0, to: 100, onUpdate: (v) => { value = v; }, onComplete: () => { completed++; } });
  for (let i = 0; i < hz / 10; i++) tick(1000 / hz);
  const at100ms = value;
  for (let i = 0; i < hz; i++) tick(1000 / hz);
  assert.equal(value, 100);
  assert.equal(completed, 1);
  assert.equal(frames.size, 0);
  return at100ms;
}
assert.ok(Math.abs(sample(60) - sample(120)) < 1, "Spring progress should agree across display refresh rates");
let updates = 0;
const handle = animateSpring({ from: 0, to: 100, onUpdate: () => { updates++; } });
tick(8);
const stopped = handle.stop();
assert.ok(stopped.value > 0 && stopped.value < 100);
const before = updates;
tick(100);
assert.equal(updates, before, "Interrupted spring must stop writing frames");
console.log("Motion checks passed: 60/120 Hz progress, exact settling, single completion and interruption.");

Object.defineProperty(globalThis, "window", { value: { matchMedia: () => ({ matches: true }) }, configurable: true });
let reducedValue = 0;
let reducedCompletions = 0;
animateSpring({ from: 0, to: 100, onUpdate: (value) => { reducedValue = value; }, onComplete: () => { reducedCompletions++; } });
assert.equal(reducedValue, 100);
assert.equal(reducedCompletions, 1);
assert.equal(frames.size, 0, "Reduced motion must not schedule travel frames");
console.log("Reduced-motion spring check passed.");
