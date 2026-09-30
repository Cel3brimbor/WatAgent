"use client";

import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { animateSpring, createVelocityTracker, project, rubberband, type SpringHandle } from "@/shared/motion";

//how far the projected resting point must travel (as a share of the sheet) to count as a dismiss
const DISMISS_RATIO = 0.35;
const ACTIVATE_PX = 6;

type Drag = { pointerId: number; startY: number; origin: number; active: boolean };

//drag-down-to-dismiss for a bottom sheet: 1:1 tracking, rubber-band upward, momentum decides the outcome
export function useSheetDismiss(sheetRef: RefObject<HTMLElement | null>, open: boolean, onDismiss: () => void) {
  const dragRef = useRef<Drag | null>(null);
  const offsetRef = useRef(0);
  const springRef = useRef<SpringHandle | null>(null);
  const trackerRef = useRef(createVelocityTracker());
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(
    () => () => {
      springRef.current?.stop();
    },
    [],
  );

  //reopened while still parked offscreen: hand the position back to css so it slides home
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!open || !sheet || offsetRef.current === 0) return;
    springRef.current?.stop();
    springRef.current = null;
    offsetRef.current = 0;
    sheet.style.transition = "";
    sheet.style.transform = "";
  }, [open, sheetRef]);

  function paint(offset: number) {
    offsetRef.current = offset;
    const sheet = sheetRef.current;
    if (!sheet) return;
    sheet.style.transform = offset === 0 ? "" : `translate3d(0, ${offset}px, 0)`;
  }

  function release(velocity: number) {
    const sheet = sheetRef.current;
    const height = sheet?.offsetHeight || window.innerHeight;
    const resting = offsetRef.current + project(velocity);
    const dismiss = resting > height * DISMISS_RATIO && velocity > -200;
    springRef.current = animateSpring({
      from: offsetRef.current,
      to: dismiss ? height : 0,
      velocity,
      //a thrown sheet carries momentum, so it's allowed a touch of give on the way home
      damping: dismiss ? 1 : 0.8,
      response: 0.3,
      onUpdate: paint,
      onComplete: () => {
        springRef.current = null;
        if (dismiss) {
          //leave the sheet parked offscreen; it unmounts with its exit state already matching
          dismissRef.current();
          return;
        }
        if (sheet) sheet.style.transition = "";
        paint(0);
      },
    });
  }

  return {
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      const sheet = sheetRef.current;
      if (!sheet) return;
      //catch it mid-flight: stop the spring and continue from where it is on screen
      const origin = springRef.current ? springRef.current.stop().value : offsetRef.current;
      springRef.current = null;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { pointerId: event.pointerId, startY: event.clientY, origin, active: origin !== 0 };
      trackerRef.current.reset();
      trackerRef.current.add(event.clientY);
      sheet.style.transition = "none";
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      trackerRef.current.add(event.clientY);
      const delta = event.clientY - drag.startY;
      if (!drag.active && Math.abs(delta) < ACTIVATE_PX) return;
      drag.active = true;
      const raw = drag.origin + delta;
      const height = sheetRef.current?.offsetHeight || window.innerHeight;
      paint(raw < 0 ? rubberband(raw, height) : raw);
    },
    onPointerUp(event: ReactPointerEvent<HTMLElement>) {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      if (!drag.active) {
        if (sheetRef.current) sheetRef.current.style.transition = "";
        return;
      }
      release(trackerRef.current.velocity());
    },
    onPointerCancel() {
      if (!dragRef.current) return;
      dragRef.current = null;
      release(0);
    },
  };
}
