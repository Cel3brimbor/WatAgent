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
import { createDial, dialRelease, dialStep, stepDial } from "./citadel-dial";
import { createAirDrag } from "./citadel-lenis";
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

//a thrown reel: faster throws go further and take longer, every throw rests exactly on a slide,
//and even a gentle throw carries on to the next slide rather than springing back
function throwAt(speed: number, from = 0.3) {
  const dial = createDial(15, 5);
  dial.pose = from;
  dial.dragging = true;
  dialRelease(dial, speed);
  let time = 0;
  while (stepDial(dial, 1 / 120) && time < 10) time += 1 / 120;
  return { pose: dial.pose, time };
}
const gentle = throwAt(0.8);
const hard = throwAt(5);
for (const run of [gentle, hard, throwAt(-3), throwAt(7, 2.9)]) assert.ok(Math.abs(run.pose - Math.round(run.pose)) < 1e-6, `stopped between slides at ${run.pose}`);
assert.ok(gentle.pose >= 1, "a gentle throw sprang back");
assert.ok(hard.pose > gentle.pose + 2 && hard.time > gentle.time, "a harder throw should travel further and longer");
assert.ok(throwAt(-3).pose < 0);

//a button step glides: no frame of it moves more than a sliver
{
  const dial = createDial(15, 5);
  dialStep(dial, 1);
  let last = dial.pose;
  let biggest = 0;
  while (stepDial(dial, 1 / 60)) {
    biggest = Math.max(biggest, Math.abs(dial.pose - last));
    last = dial.pose;
  }
  assert.ok(biggest < 0.08 && Math.abs(dial.pose - 1) < 1e-9, `step jumped ${biggest.toFixed(3)} of a slide in one frame`);
}

//air drag: calm scrolling is untouched, a fling is slowed, and harder flings harder
{
  const calm = createAirDrag();
  let factor = 1;
  for (let i = 0; i < 20; i += 1) factor = calm(20, i * 16);
  assert.equal(factor, 1);
  const fling = (delta: number) => {
    const drag = createAirDrag();
    let value = 1;
    for (let i = 0; i < 20; i += 1) value = drag(delta, i * 16);
    return value;
  };
  assert.ok(fling(80) < 0.6 && fling(160) < fling(80));
}

console.log("citadel math ok");
