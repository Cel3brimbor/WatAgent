"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { HOUR_PX, hourFromClientY } from "@/calendar/calendar-grid";

export type SlotSelection<K> = { key: K; start: number; end: number };

type Drag<K> = { key: K; pointerId: number; anchor: number; preview: boolean };

//drag-to-create with a live selection from pointer-down, so the range is visible the whole way through
export function useSlotDrag<K>(onCommit: (key: K, startHour: number, endHour: number) => void, hourPx = HOUR_PX) {
  const [selection, setSelection] = useState<SlotSelection<K> | null>(null);
  const dragRef = useRef<Drag<K> | null>(null);
  const lastRef = useRef<number>(-1);

  function show(key: K, anchor: number, current: number) {
    if (current === lastRef.current) return;
    lastRef.current = current;
    setSelection({ key, start: Math.min(anchor, current), end: Math.max(anchor, current) });
  }

  function clear() {
    dragRef.current = null;
    lastRef.current = -1;
    setSelection(null);
  }

  function bind(key: K) {
    return {
      onPointerDown(event: ReactPointerEvent<HTMLElement>) {
        if (event.button !== 0) return;
        const hour = hourFromClientY(event.currentTarget, event.clientY, hourPx);
        //touch pans the grid; only preview for precise pointers so scrolling doesn't flash a block
        const preview = event.pointerType !== "touch";
        dragRef.current = { key, pointerId: event.pointerId, anchor: hour, preview };
        event.currentTarget.setPointerCapture(event.pointerId);
        if (preview) show(key, hour, hour);
      },
      onPointerMove(event: ReactPointerEvent<HTMLElement>) {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId || !drag.preview) return;
        show(drag.key, drag.anchor, hourFromClientY(event.currentTarget, event.clientY, hourPx));
      },
      onPointerUp(event: ReactPointerEvent<HTMLElement>) {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const hour = hourFromClientY(event.currentTarget, event.clientY, hourPx);
        clear();
        onCommit(drag.key, Math.min(drag.anchor, hour), Math.max(drag.anchor, hour));
      },
      onPointerCancel() {
        clear();
      },
    };
  }

  return { selection, bind };
}
