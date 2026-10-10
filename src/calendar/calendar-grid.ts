import type { CSSProperties } from "react";
import type { TimelineItem } from "@/calendar/types";

export const HOUR_PX = 52;
export const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
export const MONTH_CELL_STRIP_MAX = 5;

export function nowLineTop(now: number, dayStartMs: number): number | null {
  const minutes = (now - dayStartMs) / 60000;
  if (minutes < 0 || minutes > 24 * 60) return null;
  return (minutes / 60) * HOUR_PX;
}

export function itemTopPx(startUTC: number, dayStartMs: number): number {
  const minutes = Math.max(0, (startUTC - dayStartMs) / 60000);
  return (minutes / 60) * HOUR_PX;
}

export function itemHeightPx(startUTC: number, endUTC: number): number {
  const minutes = Math.max(0, (endUTC - startUTC) / 60000);
  return Math.max(18, (minutes / 60) * HOUR_PX);
}

export function hourFromClientY(el: HTMLElement, clientY: number): number {
  const rect = el.getBoundingClientRect();
  return Math.max(0, Math.min(23, Math.floor((clientY - rect.top) / HOUR_PX)));
}

// Fractional hours at quarter-hour boundaries, including midnight at the bottom.
export function quarterHourFromClientY(el: HTMLElement, clientY: number): number {
  const rect = el.getBoundingClientRect();
  return Math.max(0, Math.min(24, Math.round((clientY - rect.top) / HOUR_PX * 4) / 4));
}

// End is exclusive; even a stationary pointer selects at least fifteen minutes.
export function quarterHourRange(anchor: number, current: number): { start: number; end: number } {
  const start = Math.min(anchor, current);
  return { start, end: Math.max(start + 0.25, anchor, current) };
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

export function layoutOverlappingBlocks(items: TimelineItem[], dayStartMs: number): TimedLayout[] {
  const day = new Date(dayStartMs);
  const dayEndMs = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
  // Protect the title area, not the entire duration. This mirrors the observed
  // Apple Calendar pattern: close starts share columns, later starts are inset.
  const headerHeight = HOUR_PX * 0.75;
  const sorted = items
    .filter((item) => !item.allDay && Number.isFinite(item.startUTC) && Number.isFinite(item.endUTC)
      && item.endUTC >= item.startUTC && item.startUTC < dayEndMs
      && (item.endUTC > dayStartMs || item.startUTC === dayStartMs))
    .map((item) => {
      const start = Math.max(item.startUTC, dayStartMs);
      const end = Math.min(item.endUTC, dayEndMs);
      const top = itemTopPx(start, dayStartMs);
      const height = Math.min(itemHeightPx(start, end), itemTopPx(dayEndMs, dayStartMs) - top);
      return { item, top, height, col: 0, cols: 1, span: 1, depth: 0 };
    })
    .sort((a, b) => a.top - b.top || b.height - a.height || a.item.id.localeCompare(b.item.id));
  const laid: TimedLayout[] = [];
  let cluster: TimedLayout[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;
  const overlaps = (a: TimedLayout, b: TimedLayout) => a.top < b.top + b.height && b.top < a.top + a.height;

  function flush() {
    if (cluster.length === 0) return;
    const columns: TimedLayout[][] = [];
    for (const row of cluster) {
      let col = columns.findIndex((entries) => entries.every((previous) =>
        row.top >= previous.top + Math.min(previous.height, headerHeight),
      ));
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
      // Recover unused space once neighboring events finish, rather than keeping
      // the rest of a busy day squeezed into the group's maximum column count.
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
    if (cluster.length > 0 && row.top >= clusterEnd) flush();
    cluster.push(row);
    // Include minimum-height cards so very short events cannot hide each other.
    clusterEnd = Math.max(clusterEnd, row.top + row.height);
  }
  flush();
  return laid;
}

export function timedItemClass(height: number): string {
  if (height < 34) return "is-timed-short";
  if (height < 50) return "is-timed-medium";
  return "is-timed-tall";
}

export function timedItemStyle(layout: TimedLayout): CSSProperties {
  const gap = 2;
  const widthPct = (100 * layout.span) / layout.cols;
  const inset = `min(${layout.depth * 12}px, ${widthPct * 0.3}%)`;
  const leftPct = (layout.col / layout.cols) * 100;
  return {
    top: layout.top,
    height: layout.height,
    left: `calc(${leftPct}% + ${gap}px + ${inset})`,
    width: `calc(${widthPct}% - ${gap * 2}px - ${inset})`,
    "--timed-z": 1 + layout.depth,
  } as CSSProperties;
}

export function monthCellVisible(items: TimelineItem[]): {
  visible: TimelineItem[];
  overflow: number;
} {
  if (items.length <= MONTH_CELL_STRIP_MAX) return { visible: items, overflow: 0 };
  const keep = MONTH_CELL_STRIP_MAX - 1;
  return { visible: items.slice(0, keep), overflow: items.length - keep };
}
