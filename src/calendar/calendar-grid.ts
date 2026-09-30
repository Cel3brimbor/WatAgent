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

export type TimedLayout = {
  item: TimelineItem;
  top: number;
  height: number;
  col: number;
  cols: number;
};

export function layoutOverlappingBlocks(items: TimelineItem[], dayStartMs: number): TimedLayout[] {
  const sorted = [...items].sort((a, b) => {
    if (a.startUTC !== b.startUTC) return a.startUTC - b.startUTC;
    if (a.endUTC !== b.endUTC) return b.endUTC - a.endUTC;
    return a.id.localeCompare(b.id);
  });

  const laid: TimedLayout[] = [];
  let cluster: TimelineItem[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  function flush() {
    if (cluster.length === 0) return;
    const colEnds: number[] = [];
    const cols: number[] = [];
    for (const item of cluster) {
      let col = colEnds.findIndex((end) => end <= item.startUTC);
      if (col < 0) {
        col = colEnds.length;
        colEnds.push(0);
      }
      colEnds[col] = item.endUTC;
      cols.push(col);
    }
    const colCount = Math.max(1, colEnds.length);
    cluster.forEach((item, i) => {
      laid.push({
        item,
        top: itemTopPx(item.startUTC, dayStartMs),
        height: itemHeightPx(item.startUTC, item.endUTC),
        col: cols[i],
        cols: colCount,
      });
    });
    cluster = [];
    clusterEnd = Number.NEGATIVE_INFINITY;
  }

  for (const item of sorted) {
    if (cluster.length > 0 && item.startUTC >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.endUTC);
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
  const widthPct = 100 / layout.cols;
  const leftPct = (layout.col / layout.cols) * 100;
  return {
    top: layout.top,
    height: layout.height,
    left: `calc(${leftPct}% + ${gap}px)`,
    width: `calc(${widthPct}% - ${gap * 2}px)`,
    zIndex: 1 + layout.col,
  };
}

export function monthCellVisible(items: TimelineItem[]): {
  visible: TimelineItem[];
  overflow: number;
} {
  if (items.length <= MONTH_CELL_STRIP_MAX) return { visible: items, overflow: 0 };
  const keep = MONTH_CELL_STRIP_MAX - 1;
  return { visible: items.slice(0, keep), overflow: items.length - keep };
}
