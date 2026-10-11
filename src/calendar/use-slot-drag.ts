"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { HOUR_PX, hourFromClientY, quarterHourFromClientY, quarterHourRange } from "@/calendar/calendar-grid";

export type SlotSelection<K> = { key: K; start: number; end: number };
export function createSlotSelectionStore<K>() {
  let selection: SlotSelection<K> | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => selection,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    set(next: SlotSelection<K> | null) {
      if (selection === next || (selection && next && selection.key === next.key && selection.start === next.start && selection.end === next.end)) return;
      selection = next;
      listeners.forEach(listener => listener());
    },
  };
}
export type SlotSelectionStore<K> = ReturnType<typeof createSlotSelectionStore<K>>;
type Drag<K> = { key: K; pointerId: number; anchor: number; preview: boolean };

// Only the preview subscribes to pointer updates; the event grid stays out of the drag loop.
export function useSlotDrag<K>(onCommit: (key: K, startHour: number, endHour: number) => void, hourPx = HOUR_PX) {
  const [selectionStore] = useState(() => createSlotSelectionStore<K>());
  const dragRef = useRef<Drag<K> | null>(null);
  const frameRef = useRef<number | null>(null);
  const latestRef = useRef<{ element: HTMLElement; y: number } | null>(null);
  useEffect(() => () => { if (frameRef.current != null) cancelAnimationFrame(frameRef.current); }, []);

  function clear() {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    latestRef.current = null;
    dragRef.current = null;
    selectionStore.set(null);
  }
  function bind(key: K) {
    return {
      onPointerDown(event: ReactPointerEvent<HTMLElement>) {
        if (event.button !== 0 || dragRef.current) return;
        const preview = event.pointerType !== "touch";
        const hour = preview
          ? Math.min(23.75, quarterHourFromClientY(event.currentTarget, event.clientY, hourPx))
          : hourFromClientY(event.currentTarget, event.clientY, hourPx);
        dragRef.current = { key, pointerId: event.pointerId, anchor: hour, preview };
        event.currentTarget.setPointerCapture(event.pointerId);
        if (preview) selectionStore.set({ key, ...quarterHourRange(hour, hour) });
      },
      onPointerMove(event: ReactPointerEvent<HTMLElement>) {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId || !drag.preview) return;
        latestRef.current = { element: event.currentTarget, y: event.clientY };
        if (frameRef.current != null) return;
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null;
          const latest = latestRef.current;
          if (!latest || dragRef.current !== drag) return;
          selectionStore.set({ key: drag.key, ...quarterHourRange(drag.anchor, quarterHourFromClientY(latest.element, latest.y, hourPx)) });
        });
      },
      onPointerUp(event: ReactPointerEvent<HTMLElement>) {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const hour = drag.preview
          ? quarterHourFromClientY(event.currentTarget, event.clientY, hourPx)
          : hourFromClientY(event.currentTarget, event.clientY, hourPx);
        const range = drag.preview ? quarterHourRange(drag.anchor, hour)
          : { start: Math.min(drag.anchor, hour), end: Math.max(drag.anchor, hour) + 1 };
        clear();
        onCommit(drag.key, range.start, range.end);
      },
      onPointerCancel: clear,
      onLostPointerCapture: clear,
    };
  }
  return { selectionStore, bind };
}
