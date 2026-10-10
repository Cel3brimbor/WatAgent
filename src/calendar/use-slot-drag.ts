"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { hourFromClientY, quarterHourFromClientY, quarterHourRange } from "@/calendar/calendar-grid";

export type SlotSelection<K> = { key: K; start: number; end: number };

type Drag<K> = { key: K; pointerId: number; anchor: number; preview: boolean };

//drag-to-create with a live selection from pointer-down, so the range is visible the whole way through
export function useSlotDrag<K>(onCommit: (key: K, startHour: number, endHour: number) => void) {
  const [selection, setSelection] = useState<SlotSelection<K> | null>(null);
  const dragRef = useRef<Drag<K> | null>(null);
  const lastRef = useRef<number>(-1);

  function show(key: K, anchor: number, current: number) {
    if (current === lastRef.current) return;
    lastRef.current = current;
    setSelection({ key, ...quarterHourRange(anchor, current) });
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
        //touch pans the grid; only preview for precise pointers so scrolling doesn't flash a block
        const preview = event.pointerType !== "touch";
        const hour = preview
          ? Math.min(23.75, quarterHourFromClientY(event.currentTarget, event.clientY))
          : hourFromClientY(event.currentTarget, event.clientY);
        dragRef.current = { key, pointerId: event.pointerId, anchor: hour, preview };
        event.currentTarget.setPointerCapture(event.pointerId);
        if (preview) show(key, hour, hour);
      },
      onPointerMove(event: ReactPointerEvent<HTMLElement>) {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId || !drag.preview) return;
        show(drag.key, drag.anchor, quarterHourFromClientY(event.currentTarget, event.clientY));
      },
      onPointerUp(event: ReactPointerEvent<HTMLElement>) {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const hour = drag.preview
          ? quarterHourFromClientY(event.currentTarget, event.clientY)
          : hourFromClientY(event.currentTarget, event.clientY);
        const range = drag.preview
          ? quarterHourRange(drag.anchor, hour)
          : { start: Math.min(drag.anchor, hour), end: Math.max(drag.anchor, hour) + 1 };
        clear();
        onCommit(drag.key, range.start, range.end);
      },
      onPointerCancel() {
        clear();
      },
    };
  }

  return { selection, bind };
}
