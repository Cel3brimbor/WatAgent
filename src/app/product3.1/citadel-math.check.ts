import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "three";
import {
  BANDS,
  BEATS,
  CLEARANCE,
  clearanceReport,
  drumQuaternion,
  drumSpin,
  edgeOffset,
  filmOf,
  filmPhase,
  frameSize,
  frameTheta,
  phaseAt,
  polygonFactor,
} from "./citadel-math";
import { AGENT_SCENARIOS } from "./product-demo-conversations";

//feature-reel.tsx pulls in css, so its five sides are counted here by hand
const ITEMS = { features: 5, agents: AGENT_SCENARIOS.length };

//every band clears its neighbours by CLEARANCE at any orientation
for (const row of clearanceReport()) {
  assert.ok(row.gap >= CLEARANCE, `${row.pair} gap ${row.gap.toFixed(3)} < ${CLEARANCE}`);
}

//bands are listed inner to outer
for (let i = 1; i < BANDS.length; i += 1) assert.ok(BANDS[i].radius > BANDS[i - 1].radius);

//beats run in order and never overlap: each open finishes before its hold, each close before the next open
const order = [
  BEATS.lensOpen, BEATS.calendarHold, BEATS.lensClose,
  BEATS.featuresOpen, BEATS.featuresHold, BEATS.featuresClose,
  BEATS.agentsOpen, BEATS.agentsHold, BEATS.agentsClose,
  BEATS.exit,
];
for (let i = 1; i < order.length; i += 1) assert.ok(order[i][0] >= order[i - 1][1], `beat ${i} overlaps the one before`);
assert.ok(BEATS.end >= BEATS.exit[1]);

//each hold hands input to its view, and the gaps between belong to the orbit
assert.equal(phaseAt((BEATS.calendarHold[0] + BEATS.calendarHold[1]) / 2), "calendar");
assert.equal(phaseAt((BEATS.featuresHold[0] + BEATS.featuresHold[1]) / 2), "features");
assert.equal(phaseAt((BEATS.agentsHold[0] + BEATS.agentsHold[1]) / 2), "agents");
assert.equal(phaseAt((BEATS.lensClose[1] + BEATS.featuresOpen[0]) / 2), "orbit");
assert.equal(phaseAt(BEATS.end), "done");

const front = new Vector3();
const q = new Quaternion();
for (const band of BANDS) {
  if (band.kind !== "film") continue;
  const film = filmOf(band);
  const items = ITEMS[band.id as keyof typeof ITEMS];

  //frames repeat whole cycles of the items, so frame k always shows item k mod n
  assert.equal(film.frames % items, 0, `${band.id} frames ${film.frames} not a multiple of ${items}`);

  //frame centres are polygon edge midpoints: flat faces do not move as the circle squares off
  for (let k = 0; k < film.frames; k += 1) {
    const theta = frameTheta(film, k);
    assert.ok(Math.abs(edgeOffset(theta, film.frames, filmPhase(film))) < 1e-9);
    assert.ok(Math.abs(polygonFactor(theta, 1, film.frames, filmPhase(film)) - 1) < 1e-9);
  }

  //a morphed edge is straight: r·cos(offset) is the constant inradius
  const { inradius } = frameSize(band);
  for (let step = 0; step <= 60; step += 1) {
    const theta = (step / 60) * Math.PI * 2;
    const r = inradius * polygonFactor(theta, 1, film.frames, filmPhase(film));
    assert.ok(Math.abs(r * Math.cos(edgeOffset(theta, film.frames, filmPhase(film))) - inradius) < 1e-9);
  }

  //the drum's roll brings frame p to face the camera: its outward normal ends up mostly +z
  for (const pose of [0, 1, 3, film.frames - 1, 17]) {
    const theta = frameTheta(film, pose);
    drumQuaternion(drumSpin(film, pose), q);
    front.set(Math.cos(theta), Math.sin(theta), 0).applyQuaternion(q);
    assert.ok(front.z > 0.98 && Math.abs(front.x) < 1e-9, `${band.id} pose ${pose} faces ${front.toArray()}`);
  }
}

console.log("citadel math ok");
