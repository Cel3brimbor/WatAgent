"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { HOUR_PX } from "@/calendar/calendar-grid";
import { zoomHourPx } from "@/calendar/time-scale";

const LABEL_CLEARANCE = 14;

type Frame = { gridTop: number; stickyBottom: number };

function gridFrame(scroller: HTMLElement): Frame | null {
  const grid = scroller.querySelector(".calendar-day-grid, .calendar-week-body");
  if (!(grid instanceof HTMLElement)) return null;
  const scrollerTop = scroller.getBoundingClientRect().top;
  const sticky = scroller.querySelector(".calendar-sticky");
  const stickyBottom = sticky instanceof HTMLElement ? sticky.getBoundingClientRect().bottom - scrollerTop : 0;
  const gridTop = grid.getBoundingClientRect().top - scrollerTop + scroller.scrollTop;
  return { gridTop, stickyBottom };
}

function scrollTopForHour(frame: Frame, hour: number, hourPx: number): number {
  return Math.max(0, frame.gridTop + hour * hourPx - frame.stickyBottom - LABEL_CLEARANCE);
}

function anchorAt(scroller: HTMLElement, clientY: number, hourPx: number): { hour: number; viewportY: number } | null {
  const frame = gridFrame(scroller);
  if (!frame) return null;
  const viewportY = clientY - scroller.getBoundingClientRect().top;
  const into = scroller.scrollTop + viewportY - frame.gridTop;
  if (into < 0) {
    const visible = (scroller.scrollTop + frame.stickyBottom + LABEL_CLEARANCE - frame.gridTop) / hourPx;
    return { hour: Math.max(0, visible), viewportY: frame.stickyBottom + LABEL_CLEARANCE };
  }
  return { hour: into / hourPx, viewportY };
}

function writeScroll(scroller: HTMLElement, top: number, ignoring: { current: boolean }, placed: { current: number | null }) {
  ignoring.current = true;
  scroller.scrollTop = Math.max(0, top);
  placed.current = scroller.scrollTop;
  ignoring.current = false;
}

type Options = {
  scrollerRef: RefObject<HTMLElement | null>;
  active: boolean;
  resetKey: string;
  leadHour: number;
};

//hour height shared by day and week, and the opening scroll one hour before the first event
export function useTimedGridScroll({ scrollerRef, active, resetKey, leadHour }: Options): number {
  const [hourPx, setHourPx] = useState(HOUR_PX);
  const hourPxRef = useRef(hourPx);
  const resetRef = useRef(resetKey);
  const anchorRef = useRef<{ hour: number; viewportY: number } | null>(null);
  const ignoring = useRef(false);
  const placed = useRef<number | null>(null);
  const movedKey = useRef<string | null>(null);
  const pointerDown = useRef(false);

  hourPxRef.current = hourPx;
  if (resetRef.current !== resetKey) {
    resetRef.current = resetKey;
    anchorRef.current = null;
  }

  function markMoved() {
    movedKey.current = resetRef.current;
  }

  useLayoutEffect(() => {
    if (!active) return;
    if (movedKey.current === resetKey) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const frame = gridFrame(scroller);
    if (!frame) return;
    writeScroll(scroller, scrollTopForHour(frame, leadHour, hourPxRef.current), ignoring, placed);
    const hourIndex = Math.min(23, Math.max(0, Math.floor(leadHour)));
    const frameId = requestAnimationFrame(() => {
      if (movedKey.current === resetKey) return;
      const node = scrollerRef.current;
      if (!node) return;
      const sticky = node.querySelector(".calendar-sticky");
      const label = node.querySelectorAll(".calendar-hour-label")[hourIndex];
      if (!(sticky instanceof HTMLElement) || !(label instanceof HTMLElement)) return;
      const overlap = sticky.getBoundingClientRect().bottom - label.getBoundingClientRect().top + 4;
      if (overlap > 1) writeScroll(node, node.scrollTop - overlap, ignoring, placed);
    });
    return () => cancelAnimationFrame(frameId);
  }, [active, resetKey, leadHour, scrollerRef]);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const scroller = scrollerRef.current;
    if (!anchor || !scroller || !active) return;
    anchorRef.current = null;
    const frame = gridFrame(scroller);
    if (!frame) return;
    writeScroll(scroller, frame.gridTop + anchor.hour * hourPx - anchor.viewportY, ignoring, placed);
  }, [hourPx, active, scrollerRef]);

  useEffectWheel(scrollerRef, active, (event) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onHours = event.target instanceof Element && Boolean(event.target.closest(".calendar-hours"));
    const zoomGesture = event.ctrlKey || event.metaKey || onHours;
    if (!zoomGesture) {
      markMoved();
      return;
    }
    event.preventDefault();
    const current = hourPxRef.current;
    const next = zoomHourPx(current, event.deltaY);
    if (next === current) return;
    anchorRef.current = anchorAt(scroller, event.clientY, current);
    markMoved();
    hourPxRef.current = next;
    setHourPx(next);
  }, (event) => {
    if (ignoring.current) return;
    if (!pointerDown.current) return;
    if (placed.current != null && Math.abs(event.currentTarget.scrollTop - placed.current) <= 1) return;
    markMoved();
  }, (down) => {
    pointerDown.current = down;
  });

  return hourPx;
}

function useEffectWheel(
  scrollerRef: RefObject<HTMLElement | null>,
  active: boolean,
  onWheel: (event: WheelEvent) => void,
  onScroll: (event: Event & { currentTarget: HTMLElement }) => void,
  onPointer: (down: boolean) => void,
) {
  const wheelRef = useRef(onWheel);
  const scrollRef = useRef(onScroll);
  const pointerRef = useRef(onPointer);
  wheelRef.current = onWheel;
  scrollRef.current = onScroll;
  pointerRef.current = onPointer;

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !active) return;
    const wheel = (event: WheelEvent) => wheelRef.current(event);
    const scroll = (event: Event) => {
      if (event.currentTarget instanceof HTMLElement) scrollRef.current(event as Event & { currentTarget: HTMLElement });
    };
    const down = () => pointerRef.current(true);
    const up = () => pointerRef.current(false);
    scroller.addEventListener("wheel", wheel, { passive: false });
    scroller.addEventListener("scroll", scroll, { passive: true });
    scroller.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      scroller.removeEventListener("wheel", wheel);
      scroller.removeEventListener("scroll", scroll);
      scroller.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [active, scrollerRef]);
}
