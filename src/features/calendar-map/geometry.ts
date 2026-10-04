import type { MapNode, MapPoint } from "./types";

export type Pt = { x: number; y: number };
export type Size = { width: number; height: number };
/** A node on screen: centre and size in px. */
export type Box = Pt & { w: number; h: number };

/** Narrower frames pan across a canvas this wide instead of squeezing the map. */
export const MIN_CANVAS_WIDTH = 820;
/** Kept clear at the top for breathing room and at the bottom for the floating palette. */
export const TOP_CLEARANCE = 64;
//room for the palette, which can wrap onto a second row
export const PALETTE_CLEARANCE = 120;
const LANE_GAP = 96;
export const NODE_SIZE = { w: 218, h: 68 };
//the space between nodes in a lane; a plain node plus this is LANE_GAP
const NODE_GAP = LANE_GAP - NODE_SIZE.h;
/** A box node: the usual header, then a row per item. Same width, so it fits any lane. */
export const BOX_ROW = 34;
const BOX_PAD = 8;

/** A node's size in px. Box nodes grow a row per item, with room for one when empty. */
export function nodeSize(node: Pick<MapNode, "box" | "variant">): { w: number; h: number } {
  if (!node.box || node.variant === "function") return NODE_SIZE;
  return { w: NODE_SIZE.w, h: NODE_SIZE.h + Math.max(1, node.box.rows.length) * BOX_ROW + BOX_PAD };
}

//a lane's nodes stacked with NODE_GAP between them
function laneHeight(lane: Pick<MapNode, "box" | "variant">[]): number {
  return lane.reduce((sum, node) => sum + nodeSize(node).h, 0) + NODE_GAP * Math.max(0, lane.length - 1);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

//tall enough that the longest lane keeps its nodes NODE_GAP apart (plain nodes: LANE_GAP between centres)
export function canvasHeight(nodes: Pick<MapNode, "group" | "box" | "variant">[]): number {
  const longest = Math.max(
    NODE_SIZE.h,
    ...(["left", "hub", "right"] as const).map((group) => laneHeight(nodes.filter((node) => node.group === group))),
  );
  return Math.max(400, TOP_CLEARANCE + PALETTE_CLEARANCE + longest + NODE_GAP);
}

//hub in the middle with a column either side, in the order given, spread evenly from top to bottom
export function defaultLayout(
  nodes: Pick<MapNode, "id" | "group" | "box" | "variant" | "variant">[],
  size: Size,
): Record<string, MapPoint> {
  const height = Math.max(1, size.height);
  const top = TOP_CLEARANCE;
  const bottom = Math.max(top, height - PALETTE_CLEARANCE);
  const out: Record<string, MapPoint> = {};
  const place = (group: MapNode["group"], x: number) => {
    const lane = nodes.filter((node) => node.group === group);
    if (lane.length === 1) {
      out[lane[0].id] = { x, y: (top + bottom) / 2 / height };
      return;
    }
    const filled = lane.reduce((sum, node) => sum + nodeSize(node).h, 0);
    const gap = NODE_GAP;
    let edge = top + Math.max(0, (bottom - top - filled - gap * (lane.length - 1)) / 2);
    for (const node of lane) {
      const h = nodeSize(node).h;
      out[node.id] = { x, y: (edge + h / 2) / height };
      edge += h + gap;
    }
  };
  place("hub", 0.5);
  place("left", 0.16);
  place("right", 0.84);
  return out;
}

export function toPx(point: MapPoint, size: Size): Pt {
  return { x: point.x * size.width, y: point.y * size.height };
}

export function toUnit(point: Pt, size: Size): MapPoint {
  return {
    x: size.width > 0 ? clamp(point.x / size.width, 0, 1) : 0.5,
    y: size.height > 0 ? clamp(point.y / size.height, 0, 1) : 0.5,
  };
}

/** Where a node's centre may sit with the whole node on the canvas. */
export function centreBounds(size: Size, node: { w: number; h: number }): { minX: number; maxX: number; minY: number; maxY: number } {
  return {
    minX: node.w / 2,
    maxX: Math.max(node.w / 2, size.width - node.w / 2),
    minY: node.h / 2,
    maxY: Math.max(node.h / 2, size.height - node.h / 2),
  };
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}

/** Where the line from a box's centre toward a point leaves the box, pushed out by gap. */
export function exitPoint(box: Box, toward: Pt, gap = 0): Pt {
  const dx = toward.x - box.x;
  const dy = toward.y - box.y;
  if (dx === 0 && dy === 0) return { x: box.x, y: box.y };
  const scale = Math.min(dx === 0 ? Infinity : box.w / 2 / Math.abs(dx), dy === 0 ? Infinity : box.h / 2 / Math.abs(dy));
  const length = Math.hypot(dx, dy);
  return { x: box.x + dx * scale + (dx / length) * gap, y: box.y + dy * scale + (dy / length) * gap };
}

export type EdgeGeometry = {
  start: Pt;
  end: Pt;
  /** Set when the line bends around a node in its way: a quadratic curve through this control point. */
  control?: Pt;
  /** Halfway along the line or curve. */
  mid: Pt;
  /** Beside the line, off to one side so it never sits on the stroke. */
  label: Pt & { align: "start" | "middle" | "end" };
};

//does the segment a→b pass through the box, grown by pad? (Liang–Barsky clipping)
export function segmentHitsBox(a: Pt, b: Pt, box: Box, pad = 0): boolean {
  const left = box.x - box.w / 2 - pad;
  const right = box.x + box.w / 2 + pad;
  const top = box.y - box.h / 2 - pad;
  const bottom = box.y + box.h / 2 + pad;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let low = 0;
  let high = 1;
  const edges: Array<[number, number]> = [
    [-dx, a.x - left],
    [dx, right - a.x],
    [-dy, a.y - top],
    [dy, bottom - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) low = Math.max(low, t);
    else high = Math.min(high, t);
    if (low > high) return false;
  }
  return true;
}

function labelBeside(point: Pt, nx: number, ny: number, offset: number): EdgeGeometry["label"] {
  const steep = Math.abs(ny) < Math.abs(nx) * 0.5;
  return {
    x: point.x + nx * offset,
    y: point.y + ny * offset,
    align: steep ? (nx >= 0 ? "start" : "end") : "middle",
  };
}

//null while the two nodes overlap, since there's no line to draw between them.
//a straight line that would cut through another node bends around it, toward the middle of the canvas.
export function edgeGeometry(from: Box, to: Box, obstacles: Box[] = [], canvas?: Size, gap = 4): EdgeGeometry | null {
  if (boxesOverlap(from, to)) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const blocking = obstacles.filter(
    (box) => box !== from && box !== to && !boxesOverlap(box, from) && !boxesOverlap(box, to) && segmentHitsBox(from, to, box, 10),
  );
  if (blocking.length === 0) {
    const start = exitPoint(from, to, gap);
    const end = exitPoint(to, from, gap);
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    let nx = -dy / length;
    let ny = dx / length;
    //steep lines take their label on the right, the rest above
    const steep = Math.abs(dx) < Math.abs(dy) * 0.5;
    if (steep ? nx < 0 : ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    return { start, end, mid, label: labelBeside(mid, nx, ny, 14) };
  }
  const centre = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const nx = -dy / length;
  const ny = dx / length;
  //a quadratic curve reaches half its control offset, so double what the widest blocker needs
  const clearance = Math.max(...blocking.map((box) => (Math.abs(nx) * box.w) / 2 + (Math.abs(ny) * box.h) / 2)) + 18;
  const others = obstacles.filter((box) => box !== from && box !== to);
  const bend = (sign: 1 | -1) => {
    const control = { x: centre.x + sign * nx * clearance * 2, y: centre.y + sign * ny * clearance * 2 };
    const start = exitPoint(from, control, gap);
    const end = exitPoint(to, control, gap);
    const at = (t: number) => ({
      x: (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * control.x + t * t * end.x,
      y: (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * control.y + t * t * end.y,
    });
    //how often the curve runs through a node or off the canvas
    let hits = 0;
    for (let t = 0.15; t < 0.9; t += 0.1) {
      const point = at(t);
      if (others.some((box) => Math.abs(point.x - box.x) < box.w / 2 + 6 && Math.abs(point.y - box.y) < box.h / 2 + 6)) hits += 1;
      if (canvas && (point.x < 0 || point.y < 0 || point.x > canvas.width || point.y > canvas.height)) hits += 1;
    }
    return { sign, control, start, end, mid: at(0.5), hits };
  };
  const towardMiddle: 1 | -1 = canvas && nx * (canvas.width / 2 - centre.x) + ny * (canvas.height / 2 - centre.y) < 0 ? -1 : 1;
  const first = bend(towardMiddle);
  const second = bend(towardMiddle === 1 ? -1 : 1);
  const best = second.hits < first.hits ? second : first;
  return {
    start: best.start,
    end: best.end,
    control: best.control,
    mid: best.mid,
    label: labelBeside(best.mid, best.sign * nx, best.sign * ny, 12),
  };
}

/** The node under a point, counting a margin around each one; the nearest centre wins. */
export function nodeAt(boxes: Array<Box & { id: string }>, point: Pt, margin = 0, except?: string): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const box of boxes) {
    if (box.id === except) continue;
    if (Math.abs(point.x - box.x) > box.w / 2 + margin || Math.abs(point.y - box.y) > box.h / 2 + margin) continue;
    const distance = Math.hypot(point.x - box.x, point.y - box.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = box.id;
    }
  }
  return best;
}

//room a straight arrow needs between two nodes: the gap at each end plus a shaft the arrowhead doesn't swallow
export const DIRECT_MIN = 36;
//a line leaves its node this far out, and stops this far short of the next so the arrowhead fits
const START_GAP = 6;
const END_GAP = 9;
//a loop leaves and lands this far in from the near corners, and rises this far past the nodes
const LOOP_INSET = 34;
const LOOP_INSET_Y = 20;
const LOOP_LIFT = 30;
//each leg of an elbow gets at least this much, so the arrowhead never sits on the bend
const ELBOW_LEG = 22;

export type FlowGeometry = EdgeGeometry & { path: string };

function cubicAt(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

//how often a curve runs through another node or off the canvas, sampled along its length
function crossings(points: Pt[], others: Box[], canvas?: Size): number {
  let hits = 0;
  for (const point of points) {
    if (others.some((box) => Math.abs(point.x - box.x) < box.w / 2 + 6 && Math.abs(point.y - box.y) < box.h / 2 + 6)) hits += 1;
    if (canvas && (point.x < 0 || point.y < 0 || point.x > canvas.width || point.y > canvas.height)) hits += 1;
  }
  return hits;
}

/**
 * Two nodes too close for a straight arrow: an arc around the outside. Side by side it leaves the source's top (or
 * bottom) near the gap, rises clear of both and comes down into the target. Stacked, it does the same around the
 * right (or left) side. The arrowhead always points into the target.
 */
function loopGeometry(from: Box, to: Box, sideways: boolean, side: 1 | -1, fromOffset: number, toOffset: number): FlowGeometry & { samples: Pt[] } {
  let start: Pt;
  let end: Pt;
  let c1: Pt;
  let c2: Pt;
  if (sideways) {
    const sign = Math.sign(to.x - from.x) || 1;
    const fromEdge = from.y + (side * from.h) / 2;
    const toEdge = to.y + (side * to.h) / 2;
    start = { x: from.x + sign * (from.w / 2 - LOOP_INSET) + fromOffset, y: fromEdge + side * START_GAP };
    end = { x: to.x - sign * (to.w / 2 - LOOP_INSET) + toOffset, y: toEdge + side * END_GAP };
    const peak = side < 0 ? Math.min(start.y, end.y) - LOOP_LIFT : Math.max(start.y, end.y) + LOOP_LIFT;
    c1 = { x: start.x, y: peak };
    c2 = { x: end.x, y: peak };
  } else {
    const sign = Math.sign(to.y - from.y) || 1;
    const fromEdge = from.x + (side * from.w) / 2;
    const toEdge = to.x + (side * to.w) / 2;
    start = { x: fromEdge + side * START_GAP, y: from.y + sign * (from.h / 2 - LOOP_INSET_Y) + fromOffset };
    end = { x: toEdge + side * END_GAP, y: to.y - sign * (to.h / 2 - LOOP_INSET_Y) + toOffset };
    const peak = side > 0 ? Math.max(start.x, end.x) + LOOP_LIFT : Math.min(start.x, end.x) - LOOP_LIFT;
    c1 = { x: peak, y: start.y };
    c2 = { x: peak, y: end.y };
  }
  const mid = cubicAt(start, c1, c2, end, 0.5);
  const label: EdgeGeometry["label"] = sideways
    ? { x: mid.x, y: mid.y + side * 12, align: "middle" }
    : { x: mid.x + side * 12, y: mid.y, align: side > 0 ? "start" : "end" };
  const samples: Pt[] = [];
  for (let t = 0.1; t < 0.95; t += 0.1) samples.push(cubicAt(start, c1, c2, end, t));
  return { start, end, mid, label, path: `M${start.x} ${start.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`, samples };
}

/**
 * Two close nodes offset diagonally: an L that leaves the source's side and turns into the target's top or bottom
 * (or leaves the top or bottom and turns into a side). Null when the nodes line up too squarely for the turn to clear
 * them, which is when a loop takes over.
 */
function elbowGeometry(from: Box, to: Box, sideFirst: boolean, fromOffset: number, toOffset: number): (FlowGeometry & { samples: Pt[] }) | null {
  const sx = Math.sign(to.x - from.x);
  const sy = Math.sign(to.y - from.y);
  if (sx === 0 || sy === 0) return null;
  let start: Pt;
  let end: Pt;
  let corner: Pt;
  if (sideFirst) {
    start = { x: from.x + sx * (from.w / 2 + START_GAP), y: from.y + fromOffset };
    //land on the target's facing edge, a turn's length past the source and clear of the target's corners
    const x = clamp(start.x + sx * ELBOW_LEG, to.x - to.w / 2 + LOOP_INSET, to.x + to.w / 2 - LOOP_INSET) + toOffset;
    end = { x, y: to.y - sy * (to.h / 2 + END_GAP) };
    corner = { x: end.x, y: start.y };
  } else {
    start = { x: from.x + fromOffset, y: from.y + sy * (from.h / 2 + START_GAP) };
    const y = clamp(start.y + sy * ELBOW_LEG, to.y - to.h / 2 + LOOP_INSET_Y, to.y + to.h / 2 - LOOP_INSET_Y) + toOffset;
    end = { x: to.x - sx * (to.w / 2 + END_GAP), y };
    corner = { x: start.x, y: end.y };
  }
  //both legs must run forward, far enough to read as a turn
  const firstLeg = sideFirst ? sx * (corner.x - start.x) : sy * (corner.y - start.y);
  const secondLeg = sideFirst ? sy * (end.y - corner.y) : sx * (end.x - corner.x);
  if (firstLeg < ELBOW_LEG || secondLeg < ELBOW_LEG) return null;
  const mid = cubicAt(start, corner, corner, end, 0.5);
  const samples: Pt[] = [];
  for (let t = 0.1; t < 0.95; t += 0.1) samples.push(cubicAt(start, corner, corner, end, t));
  //the label sits on the outside of the bend
  const out = sideFirst ? { x: sx, y: -sy } : { x: -sx, y: sy };
  return {
    start,
    end,
    mid,
    label: { x: mid.x + out.x * 10, y: mid.y + out.y * 10, align: out.x > 0 ? "start" : "end" },
    path: `M${start.x} ${start.y} C${corner.x} ${corner.y} ${corner.x} ${corner.y} ${end.x} ${end.y}`,
    samples,
  };
}

/**
 * Curved port-to-port arrows. Each line leaves through the sides of the two nodes that face each other across the
 * wider gap, so it never doubles back through them. Nodes too close for a straight arrow get an elbow when they're
 * offset, or a loop around the outside when they line up, whichever runs into fewer other nodes. Routes a third
 * node blocks keep the obstacle-aware fallback.
 */
export function flowGeometry(
  from: Box,
  to: Box,
  obstacles: Box[] = [],
  canvas?: Size,
  fromOffset = 0,
  toOffset = 0,
): FlowGeometry | null {
  const fallback = edgeGeometry(from, to, obstacles, canvas, 8);
  if (!fallback) return null;
  //the clear space between the two nodes on each axis; boxes that don't overlap have room on at least one
  const gapX = Math.abs(to.x - from.x) - (from.w + to.w) / 2;
  const gapY = Math.abs(to.y - from.y) - (from.h + to.h) / 2;
  //lanes run left to right, so sideways wins whenever it has room for a proper arrow
  const horizontal = gapX >= DIRECT_MIN || gapX >= gapY;
  if ((horizontal ? gapX : gapY) < DIRECT_MIN) {
    const others = obstacles.filter((box) => box !== from && box !== to);
    //in order of preference: the elbows, then over the top or down the right, then the other side; the first clearest wins
    const candidates = [
      elbowGeometry(from, to, true, fromOffset, toOffset),
      elbowGeometry(from, to, false, fromOffset, toOffset),
      loopGeometry(from, to, horizontal, horizontal ? -1 : 1, fromOffset, toOffset),
      loopGeometry(from, to, horizontal, horizontal ? 1 : -1, fromOffset, toOffset),
    ].filter((candidate): candidate is FlowGeometry & { samples: Pt[] } => candidate != null);
    let best = candidates[0]!;
    let fewest = crossings(best.samples, others, canvas);
    for (const candidate of candidates.slice(1)) {
      const hits = crossings(candidate.samples, others, canvas);
      if (hits < fewest) {
        best = candidate;
        fewest = hits;
      }
    }
    const { samples: _samples, ...geometry } = best;
    return geometry;
  }
  if (fallback.control)
    return {
      ...fallback,
      path: `M${fallback.start.x} ${fallback.start.y} Q${fallback.control.x} ${fallback.control.y} ${fallback.end.x} ${fallback.end.y}`,
    };
  const sign = horizontal ? Math.sign(to.x - from.x) : Math.sign(to.y - from.y) || 1;
  const start = horizontal
    ? { x: from.x + sign * (from.w / 2 + START_GAP), y: from.y + fromOffset }
    : { x: from.x + fromOffset, y: from.y + sign * (from.h / 2 + START_GAP) };
  const end = horizontal
    ? { x: to.x - sign * (to.w / 2 + END_GAP), y: to.y + toOffset }
    : { x: to.x + toOffset, y: to.y - sign * (to.h / 2 + END_GAP) };
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const c1 = horizontal ? { x: mid.x, y: start.y } : { x: start.x, y: mid.y };
  const c2 = horizontal ? { x: mid.x, y: end.y } : { x: end.x, y: mid.y };
  return {
    start,
    end,
    mid,
    label: { x: mid.x, y: mid.y - 12, align: "middle" },
    path: `M${start.x} ${start.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`,
  };
}
