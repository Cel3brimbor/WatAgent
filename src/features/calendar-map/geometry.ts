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

/** Curved port-to-port arrows; crowded routes keep the obstacle-aware fallback. */
export function flowGeometry(
  from: Box,
  to: Box,
  obstacles: Box[] = [],
  canvas?: Size,
  fromOffset = 0,
  toOffset = 0,
): (EdgeGeometry & { path: string }) | null {
  const fallback = edgeGeometry(from, to, obstacles, canvas, 8);
  if (!fallback) return null;
  if (fallback.control)
    return {
      ...fallback,
      path: `M${fallback.start.x} ${fallback.start.y} Q${fallback.control.x} ${fallback.control.y} ${fallback.end.x} ${fallback.end.y}`,
    };
  const horizontal = Math.abs(to.x - from.x) > (from.w + to.w) / 2 + 24;
  const sign = horizontal ? Math.sign(to.x - from.x) : Math.sign(to.y - from.y) || 1;
  const start = horizontal
    ? { x: from.x + sign * (from.w / 2 + 6), y: from.y + fromOffset }
    : { x: from.x + fromOffset, y: from.y + sign * (from.h / 2 + 6) };
  const end = horizontal
    ? { x: to.x - sign * (to.w / 2 + 9), y: to.y + toOffset }
    : { x: to.x + toOffset, y: to.y - sign * (to.h / 2 + 9) };
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
