import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "three";
import {
  BANDS,
  BEATS,
  CLEARANCE,
  clearanceReport,
  drumQuaternion,
  drumSpin,
  filmOf,
  frameSize,
  frameTheta,
  breakCut,
  phaseAt,
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

  //frames tile the outer skin exactly: n arcs of one frame width make the whole circumference
  const size = frameSize(band);
  assert.ok(Math.abs(size.width * film.frames - Math.PI * 2 * size.inradius) < 1e-9);
  assert.ok(Math.abs(size.width / size.height - film.aspect) < 1e-9);

  //the break cuts land on frame edges, never through a print
  const cut = breakCut(band) / ((Math.PI * 2) / film.frames);
  assert.ok(Math.abs(cut - Math.floor(cut) - 0.5) < 1e-9, `${band.id} cut at frame ${cut}`);

  //the drum's roll brings frame p to face the camera: its outward normal ends up mostly +z
  for (const pose of [0, 1, 3, film.frames - 1, 17]) {
    const theta = frameTheta(film, pose);
    drumQuaternion(drumSpin(film, pose), q);
    front.set(Math.cos(theta), Math.sin(theta), 0).applyQuaternion(q);
    assert.ok(front.z > 0.98 && Math.abs(front.x) < 1e-9, `${band.id} pose ${pose} faces ${front.toArray()}`);
  }
}

console.log("citadel math ok");
