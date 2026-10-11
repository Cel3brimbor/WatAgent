"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { TimelineItem } from "@/calendar/types";

const STORAGE_KEY = "watagent.calendar.allDayBarHeight.v1";
const MIN_HEIGHT = 36;
const MAX_HEIGHT = 420;

function clampHeight(height: number): number {
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(height)));
}

function readHeight(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(raw) && raw > 0 ? clampHeight(raw) : null;
  } catch {
    return null;
  }
}

function writeHeight(height: number | null): void {
  try {
    if (height == null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(height));
  } catch {
    return;
  }
}

/**all-day and pinned dues with a title. a blank chip is just empty color*/
export function allDayItems(items: TimelineItem[]): TimelineItem[] {
  return items.filter((item) => (item.allDay || item.pinned) && item.title.trim().length > 0);
}

type Drag = { pointerId: number; startY: number; startHeight: number };

export function useAllDayResize() {
  const [height, setHeight] = useState<number | null>(readHeight);
  const [resizing, setResizing] = useState(false);
  const heightRef = useRef(height);
  const dragRef = useRef<Drag | null>(null);

  function apply(next: number | null) {
    const height = next == null ? null : clampHeight(next);
    heightRef.current = height;
    setHeight(height);
    return height;
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    const scroll = event.currentTarget.previousElementSibling;
    if (!(scroll instanceof HTMLElement)) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: scroll.getBoundingClientRect().height,
    };
    setResizing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    apply(drag.startHeight + (event.clientY - drag.startY));
  }

  function finish(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setResizing(false);
    writeHeight(heightRef.current);
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const scroll = event.currentTarget.previousElementSibling;
    const base = heightRef.current ?? (scroll instanceof HTMLElement ? scroll.getBoundingClientRect().height : MIN_HEIGHT);
    writeHeight(apply(base + (event.key === "ArrowDown" ? 28 : -28)));
  }

  function onDoubleClick() {
    apply(null);
    writeHeight(null);
  }

  return {
    height,
    resizing,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      onKeyDown,
      onDoubleClick,
    },
  };
}

export function AllDayResizeHandle({
  height,
  handleProps,
}: {
  height: number | null;
  handleProps: ReturnType<typeof useAllDayResize>["handleProps"];
}) {
  return (
    <div
      className="calendar-all-day-resize"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize all-day"
      aria-valuemin={MIN_HEIGHT}
      aria-valuemax={MAX_HEIGHT}
      aria-valuenow={height ?? undefined}
      tabIndex={0}
      title="Drag to resize. Double-click to fit the text."
      {...handleProps}
    />
  );
}
