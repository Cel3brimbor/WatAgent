import assert from "node:assert/strict";
import { BOX_ROW, boxesOverlap, canvasHeight, centreBounds, defaultLayout, edgeGeometry, flowGeometry, exitPoint, MIN_CANVAS_WIDTH, NODE_SIZE, nodeAt, nodeSize, segmentHitsBox, toPx, toUnit } from "./geometry";

const wide = { width: 800, height: 500 };
const nodes = [
  { id: "agent", group: "hub" as const },
  { id: "main", group: "left" as const },
  { id: "tasks", group: "left" as const },
  { id: "learn", group: "right" as const },
  { id: "portal", group: "right" as const },
  { id: "google", group: "right" as const },
];
const layout = defaultLayout(nodes, wide);
assert.equal(layout.agent.x, 0.5, "the hub sits in the middle");
assert.ok(layout.main.x < 0.5 && layout.learn.x > 0.5, "left and right lanes sit either side");
assert.ok(layout.learn.y < layout.portal.y && layout.portal.y < layout.google.y, "lanes keep the given order top to bottom");
assert.ok(Object.values(layout).every((point) => point.x > 0 && point.x < 1 && point.y > 0 && point.y < 1));
const bottomPx = toPx(layout.google, wide).y + NODE_SIZE.h / 2;
assert.ok(bottomPx <= wide.height - 100, "the lowest node clears the palette");
const narrowest = { width: MIN_CANVAS_WIDTH, height: canvasHeight(nodes) };
const tight = defaultLayout(nodes, narrowest);
const leftEdge = toPx(tight.main, narrowest).x + NODE_SIZE.w / 2;
const hubLeft = toPx(tight.agent, narrowest).x - NODE_SIZE.w / 2;
const hubRight = toPx(tight.agent, narrowest).x + NODE_SIZE.w / 2;
const rightEdge = toPx(tight.learn, narrowest).x - NODE_SIZE.w / 2;
assert.ok(leftEdge < hubLeft && hubRight < rightEdge, "at the narrowest canvas the three lanes still don't touch");
assert.ok(canvasHeight(Array.from({ length: 9 }, () => ({ group: "left" as const }))) > 460, "long lanes grow the canvas");

//box nodes: same width, a row taller per item
const row = (id: string) => ({ id, label: id });
assert.deepEqual(nodeSize({}), NODE_SIZE);
assert.equal(nodeSize({ box: { rows: [] } }).w, NODE_SIZE.w, "boxes fit the same lanes");
assert.equal(nodeSize({ box: { rows: [row("a"), row("b"), row("c")] } }).h - nodeSize({ box: { rows: [row("a")] } }).h, 2 * BOX_ROW);
assert.equal(nodeSize({ box: { rows: [] } }).h, nodeSize({ box: { rows: [row("a")] } }).h, "an empty box keeps room for its hint");
const big = { box: { rows: [row("a"), row("b"), row("c"), row("d")] } };
const stacked = [
  { id: "learn", group: "right" as const },
  { id: "box", group: "right" as const, ...big },
  { id: "portal", group: "right" as const },
];
const roomy = { width: 800, height: canvasHeight(stacked) };
const placed = defaultLayout(stacked, roomy);
const extent = (id: string, h: number) => [toPx(placed[id], roomy).y - h / 2, toPx(placed[id], roomy).y + h / 2];
const [, learnBottom] = extent("learn", NODE_SIZE.h);
const [boxTop, boxBottom] = extent("box", nodeSize(big).h);
const [portalTop, portalBottom] = extent("portal", NODE_SIZE.h);
assert.ok(learnBottom < boxTop && boxBottom < portalTop, "a tall box doesn't overlap its neighbours");
assert.ok(portalBottom <= roomy.height - 100, "and the lane still clears the palette");
assert.ok(canvasHeight(stacked) > canvasHeight(stacked.map(({ id, group }) => ({ id, group }))), "tall boxes grow the canvas");

assert.deepEqual(toUnit(toPx({ x: 0.25, y: 0.75 }, wide), wide), { x: 0.25, y: 0.75 });
assert.deepEqual(toUnit({ x: -40, y: 900 }, wide), { x: 0, y: 1 }, "positions clamp to the canvas");
assert.deepEqual(centreBounds(wide, { w: 100, h: 50 }), { minX: 50, maxX: 750, minY: 25, maxY: 475 });

const a = { x: 100, y: 100, w: 100, h: 50 };
const b = { x: 400, y: 100, w: 100, h: 50 };
assert.deepEqual(exitPoint(a, b), { x: 150, y: 100 }, "a line leaves through the side facing its target");
assert.deepEqual(exitPoint(a, { x: 100, y: 400 }), { x: 100, y: 125 });
const geo = edgeGeometry(a, b);
assert.ok(geo);
assert.deepEqual(geo.start, { x: 154, y: 100 });
assert.deepEqual(geo.end, { x: 346, y: 100 });
assert.ok(geo.label.y < 100 && geo.label.align === "middle", "flat lines take their label above");
const steep = edgeGeometry(a, { x: 110, y: 400, w: 100, h: 50 });
assert.ok(steep && steep.label.x > steep.mid.x && steep.label.align === "start", "steep lines take their label on the right");
assert.equal(geo.control, undefined, "a clear path stays straight");

assert.ok(segmentHitsBox({ x: 0, y: 100 }, { x: 400, y: 100 }, { x: 200, y: 100, w: 40, h: 40 }));
assert.ok(!segmentHitsBox({ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 200, y: 100, w: 40, h: 40 }));
assert.ok(segmentHitsBox({ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 200, y: 30, w: 40, h: 40 }, 12), "padding widens the box");
assert.ok(!segmentHitsBox({ x: 0, y: 100 }, { x: 150, y: 100 }, { x: 200, y: 100, w: 40, h: 40 }), "a segment that stops short misses");

const lane = { width: 800, height: 600 };
const top = { x: 700, y: 100, w: 180, h: 56 };
const middle = { x: 700, y: 300, w: 180, h: 56 };
const low = { x: 700, y: 500, w: 180, h: 56 };
const around = edgeGeometry(top, low, [top, middle, low], lane);
assert.ok(around?.control, "a line through another node bends");
assert.ok(around.control.x < 700, "it bends toward the middle of the canvas");
assert.ok(around.mid.x < middle.x - middle.w / 2, "the curve clears the node in its way");
assert.equal(around.label.align, "end", "a label left of a steep curve ends at its point");
assert.ok(around.start.y > top.y && around.end.y < low.y, "the curve leaves and enters through the facing sides");
assert.equal(edgeGeometry(a, { ...a, x: 150 }), null, "overlapping nodes have no line");
assert.ok(boxesOverlap(a, { ...a, x: 190 }) && !boxesOverlap(a, b));

const boxes = [{ id: "a", ...a }, { id: "b", ...b }];
assert.equal(nodeAt(boxes, { x: 120, y: 110 }), "a");
assert.equal(nodeAt(boxes, { x: 170, y: 100 }), null, "outside every node");
assert.equal(nodeAt(boxes, { x: 170, y: 100 }, 28), "a", "the margin catches near misses");
assert.equal(nodeAt(boxes, { x: 120, y: 110 }, 0, "a"), null, "an excluded node is skipped");

console.log("Map geometry checks passed.");

//Function nodes stay compact even when they have many source controls in the inspector.
const fn = { id: "merge-fn", group: "hub" as const, variant: "function" as const, ...big };
assert.deepEqual(nodeSize(fn), NODE_SIZE);
const manyFunctions = Array.from({ length: 12 }, (_, index) => ({ ...fn, id: `fn-${index}` }));
const functionCanvas = { width: MIN_CANVAS_WIDTH, height: canvasHeight(manyFunctions) };
const functionLayout = defaultLayout(manyFunctions, functionCanvas);
for (let index = 1; index < manyFunctions.length; index++) {
  assert.ok(toPx(functionLayout[`fn-${index}`], functionCanvas).y - toPx(functionLayout[`fn-${index - 1}`], functionCanvas).y > NODE_SIZE.h);
}


const flow = flowGeometry(a, b, [], undefined, -5, 5)!;
assert.ok(flow.path.includes(" C"), "open routes use smooth port-to-port curves");
assert.equal(flow.start.x, a.x + a.w / 2 + 6);
assert.equal(flow.end.x, b.x - b.w / 2 - 9, "arrowheads stop before the destination card");
assert.equal(flow.start.y, a.y - 5);
assert.equal(flow.end.y, b.y + 5, "parallel inputs receive distinct ports");
assert.equal(flowGeometry(a, a), null, "overlapping cards don't draw misleading arrows");
assert.ok(flowGeometry(top, low, [top, middle, low], lane)?.path.includes(" Q"), "blocked routes retain obstacle avoidance");
