import assert from "node:assert/strict";
import {
  BANDS,
  CLEARANCE,
  SIDES,
  TIMELINE,
  bandRadius,
  clearanceReport,
  edgeOffset,
  plaqueTheta,
  polygonFactor,
  wrapAngle,
} from "./citadel-math";

//every band clears its neighbours by CLEARANCE, both spinning and as flat nested pentagons
for (const row of clearanceReport()) {
  assert.ok(row.gap >= CLEARANCE, `${row.pair} ${row.phase} gap ${row.gap.toFixed(3)} < ${CLEARANCE}`);
}

//bands are listed inner to outer
for (let i = 1; i < BANDS.length; i += 1) assert.ok(BANDS[i].radius > BANDS[i - 1].radius);

//morph cannot start before every band faces the camera
assert.ok(TIMELINE.morph[0] >= TIMELINE.align[1], "morph overlaps align");
assert.ok(TIMELINE.settled > TIMELINE.fly[1] && TIMELINE.settled > TIMELINE.lens[1], "settled before the flight lands");

//n thetas cover one full turn exactly once
for (const count of [5, 7]) {
  const seen = Array.from({ length: count }, (_, i) => wrapAngle(plaqueTheta(i, count), Math.PI * 2)).sort((a, b) => a - b);
  for (let i = 1; i < count; i += 1) assert.ok(Math.abs(seen[i] - seen[i - 1] - (Math.PI * 2) / count) < 1e-9);
}

//the top is an edge midpoint, so the five feature plaques never move while the rim turns polygonal
for (let i = 0; i < SIDES; i += 1) {
  const theta = plaqueTheta(i, SIDES);
  assert.ok(Math.abs(edgeOffset(theta)) < 1e-9);
  assert.ok(Math.abs(polygonFactor(theta, 1) - 1) < 1e-9);
}

//a morphed band edge is a straight line: r·cos(offset) is the constant inradius
const features = BANDS[BANDS.length - 1];
for (let step = 0; step <= 40; step += 1) {
  const theta = (step / 40) * Math.PI * 2;
  const r = bandRadius(features, theta, 0, 1, 1);
  assert.ok(Math.abs(r * Math.cos(edgeOffset(theta)) - features.radius) < 1e-9);
}

console.log("citadel math ok");
