import type { CSSProperties } from "react";
import type { TimelineItem } from "@/calendar/types";

export const HOUR_PX = 52;
export const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
export const MONTH_CELL_STRIP_MAX = 5;

export function nowLineTop(now: number, dayStartMs: number, hourPx = HOUR_PX): number | null {
  const minutes = (now - dayStartMs) / 60000;
  if (minutes < 0 || minutes > 24 * 60) return null;
  return (minutes / 60) * hourPx;
}

export function itemTopPx(startUTC: number, dayStartMs: number, hourPx = HOUR_PX): number {
  const minutes = Math.max(0, (startUTC - dayStartMs) / 60000);
  return (minutes / 60) * hourPx;
}

export function itemHeightPx(startUTC: number, endUTC: number, hourPx = HOUR_PX): number {
  const minutes = Math.max(0, (endUTC - startUTC) / 60000);
  return Math.max(18, (minutes / 60) * hourPx);
}

export function hourFromClientY(el: HTMLElement, clientY: number, hourPx = HOUR_PX): number {
  const rect = el.getBoundingClientRect();
  return Math.max(0, Math.min(23, Math.floor((clientY - rect.top) / hourPx)));
}

export type TimedLayout = {
  item: TimelineItem;
  top: number;
  height: number;
  col: number;
  cols: number;
  span: number;
  depth: number;
};

//close starts sit side by side; a start 45 minutes later reuses the column and indents
const HEADER_MS = 45 * 60 * 1000;

type WorkingLayout = TimedLayout & { startMs: number; endMs: number };

function rangesOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

//column indexes are local to each cluster, so compare the fraction of the day each card owns
function horizontalOverlap(a: TimedLayout, b: TimedLayout): boolean {
  return rangesOverlap(a.col * b.cols, (a.col + a.span) * b.cols, b.col * a.cols, (b.col + b.span) * a.cols);
}

export function layoutOverlappingBlocks(items: TimelineItem[], dayStartMs: number, hourPx = HOUR_PX): TimedLayout[] {
  const day = new Date(dayStartMs);
  const dayEndMs = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
  const dayBottom = itemTopPx(dayEndMs, dayStartMs, hourPx);
  //columns follow clock time. pixel tops drift by a fraction while zooming and packed cards jump sideways
  const sorted: WorkingLayout[] = items
    .filter((item) => !item.allDay && Number.isFinite(item.startUTC) && Number.isFinite(item.endUTC)
      && item.endUTC >= item.startUTC && item.startUTC < dayEndMs
      && (item.endUTC > dayStartMs || item.startUTC === dayStartMs))
    .map((item) => {
      const startMs = Math.round(Math.max(item.startUTC, dayStartMs));
      const endMs = Math.round(Math.min(Math.max(item.endUTC, startMs), dayEndMs));
      const top = itemTopPx(startMs, dayStartMs, hourPx);
      const bottom = Math.min(itemTopPx(endMs, dayStartMs, hourPx), dayBottom);
      const height = Math.min(Math.max(18, bottom - top), Math.max(0, dayBottom - top));
      return { item, top, height, col: 0, cols: 1, span: 1, depth: 0, startMs, endMs };
    })
    .sort((a, b) => a.startMs - b.startMs || (b.endMs - b.startMs) - (a.endMs - a.startMs) || a.item.id.localeCompare(b.item.id));
  const laid: WorkingLayout[] = [];
  let cluster: WorkingLayout[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;
  //a zero-length task still conflicts with whatever shares that instant
  const collisionEnd = (row: WorkingLayout) => row.endMs > row.startMs ? row.endMs : row.startMs + 1;
  const overlaps = (a: WorkingLayout, b: WorkingLayout) => rangesOverlap(a.startMs, collisionEnd(a), b.startMs, collisionEnd(b));

  function flush() {
    if (cluster.length === 0) return;
    const columns: WorkingLayout[][] = [];
    for (const row of cluster) {
      let col = columns.findIndex((entries) => entries.every((previous) => {
        const duration = previous.endMs - previous.startMs;
        const blocked = Math.min(duration > 0 ? duration : 1, HEADER_MS);
        return row.startMs >= previous.startMs + blocked;
      }));
      if (col < 0) {
        col = columns.length;
        columns.push([]);
      }
      row.col = col;
      const underneath = columns[col].filter((previous) => overlaps(previous, row));
      row.depth = underneath.reduce((depth, previous) => Math.max(depth, previous.depth + 1), 0);
      columns[col].push(row);
    }
    for (const row of cluster) {
      row.cols = columns.length;
      //recover unused space once neighboring events finish, rather than keeping
      //the rest of a busy stretch squeezed into the group's maximum column count
      for (let col = row.col + 1; col < columns.length; col++) {
        if (columns[col].some((other) => overlaps(row, other))) break;
        row.span++;
      }
      laid.push(row);
    }
    cluster = [];
    clusterEnd = Number.NEGATIVE_INFINITY;
  }

  for (const row of sorted) {
    if (cluster.length > 0 && row.startMs >= clusterEnd) flush();
    cluster.push(row);
    clusterEnd = Math.max(clusterEnd, collisionEnd(row));
  }
  flush();
  //the 18px floor is paint only. it must not cover the next card, and it must not open a column
  for (const row of laid) {
    const trueHeight = Math.max(0, Math.min(itemTopPx(row.endMs, dayStartMs, hourPx), dayBottom) - row.top);
    let paintBottom = row.top + row.height;
    for (const other of laid) {
      if (other === row || other.startMs < collisionEnd(row) || !horizontalOverlap(row, other)) continue;
      if (other.top < paintBottom) paintBottom = other.top;
    }
    row.height = Math.min(Math.max(trueHeight, paintBottom - row.top), Math.max(0, dayBottom - row.top));
  }
  return laid;
}

export function timedItemClass(height: number): string {
  if (height < 34) return "is-timed-short";
  if (height < 50) return "is-timed-medium";
  return "is-timed-tall";
}

export function timedItemStyle(layout: TimedLayout, columnPx = 0): CSSProperties {
  const gap = 2;
  const style = {
    top: layout.top,
    height: layout.height,
    "--timed-z": 1 + layout.depth,
  } as CSSProperties;
  //whole pixels from one shared edge. rounding each card alone leaves a gap that sticks while the column width jitters
  if (columnPx > 0) {
    const edge = (index: number) => Math.round((columnPx * index) / layout.cols);
    const inset = Math.min(layout.depth * 12, (edge(layout.col + layout.span) - edge(layout.col)) * 0.3);
    const left = Math.round(edge(layout.col) + gap + inset);
    const right = edge(layout.col + layout.span) - gap;
    style.left = left;
    style.width = Math.max(0, right - left);
    return style;
  }
  const widthPct = (100 * layout.span) / layout.cols;
  const inset = `min(${layout.depth * 12}px, ${widthPct * 0.3}%)`;
  const leftPct = (layout.col / layout.cols) * 100;
  style.left = `calc(${leftPct}% + ${gap}px + ${inset})`;
  style.width = `calc(${widthPct}% - ${gap * 2}px - ${inset})`;
  return style;
}

export function monthCellVisible(items: TimelineItem[]): {
  visible: TimelineItem[];
  overflow: number;
} {
  if (items.length <= MONTH_CELL_STRIP_MAX) return { visible: items, overflow: 0 };
  const keep = MONTH_CELL_STRIP_MAX - 1;
  return { visible: items.slice(0, keep), overflow: items.length - keep };
}
