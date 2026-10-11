"use client";

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { HOUR_PX, hourFromClientY, quarterHourFromClientY, quarterHourRange } from "@/calendar/calendar-grid";
import { afterPaint } from "@/shared/after-paint";

export type SlotSelection<K> = { key: K; start: number; end: number };

type Drag<K> = { key: K; pointerId: number; anchor: number; preview: boolean };

//drag-to-create with a live selection from pointer-down, so the range is visible the whole way through
type PointerBind = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
};

export function useSlotDrag<K>(onCommit: (key: K, startHour: number, endHour: number) => void, hourPx = HOUR_PX) {
  const [selection, setSelection] = useState<SlotSelection<K> | null>(null);
  const dragRef = useRef<Drag<K> | null>(null);
  const lastRef = useRef<number>(-1);
  const onCommitRef = useRef(onCommit);
  const hourPxRef = useRef(hourPx);
  const boundRef = useRef(new Map<K, PointerBind>());
  const previewGen = useRef(0);
  onCommitRef.current = onCommit;
  hourPxRef.current = hourPx;

  const showRef = useRef<(key: K, anchor: number, current: number) => void>(() => {});
  const clearRef = useRef<() => void>(() => {});
  const dropPreviewRef = useRef<(gen: number) => void>(() => {});
  showRef.current = (key, anchor, current) => {
    if (current === lastRef.current) return;
    lastRef.current = current;
    setSelection({ key, ...quarterHourRange(anchor, current) });
  };
  clearRef.current = () => {
    dragRef.current = null;
    lastRef.current = -1;
    setSelection(null);
  };
  dropPreviewRef.current = (gen) => {
    afterPaint(() => {
      if (previewGen.current !== gen) return;
      setSelection(null);
    });
  };

  //handlers stay the same object per column so a pointer move does not invalidate the other days
  const bind = useCallback((key: K) => {
    const cached = boundRef.current.get(key);
    if (cached) return cached;
    const handlers: PointerBind = {
      onPointerDown(event) {
        if (event.button !== 0) return;
        //touch pans the grid; only preview for precise pointers so scrolling doesn't flash a block
        const preview = event.pointerType !== "touch";
        const px = hourPxRef.current;
        const hour = preview
          ? Math.min(23.75, quarterHourFromClientY(event.currentTarget, event.clientY, px))
          : hourFromClientY(event.currentTarget, event.clientY, px);
        previewGen.current += 1;
        dragRef.current = { key, pointerId: event.pointerId, anchor: hour, preview };
        event.currentTarget.setPointerCapture(event.pointerId);
        if (preview) showRef.current(key, hour, hour);
      },
      onPointerMove(event) {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId || !drag.preview) return;
        showRef.current(drag.key, drag.anchor, quarterHourFromClientY(event.currentTarget, event.clientY, hourPxRef.current));
      },
      onPointerUp(event) {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const px = hourPxRef.current;
        const hour = drag.preview
          ? quarterHourFromClientY(event.currentTarget, event.clientY, px)
          : hourFromClientY(event.currentTarget, event.clientY, px);
        const range = drag.preview
          ? quarterHourRange(drag.anchor, hour)
          : { start: Math.min(drag.anchor, hour), end: Math.max(drag.anchor, hour) + 1 };
        const gen = previewGen.current;
        dragRef.current = null;
        lastRef.current = -1;
        //open the editor before the column drops its preview
        onCommitRef.current(drag.key, range.start, range.end);
        dropPreviewRef.current(gen);
      },
      onPointerCancel() {
        clearRef.current();
      },
    };
    boundRef.current.set(key, handlers);
    return handlers;
  }, []);

  return { selection, bind };
}
