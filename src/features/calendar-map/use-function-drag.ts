"use client";

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { animateSpring, type SpringHandle } from "@/shared/motion";
import type { Pt } from "./geometry";
import { capturePointer } from "./pointer";

export type FunctionDragOptions = {
  /** Pressed and released without moving. */
  onTap: (fnId: string) => void;
  onStart: (fnId: string, clientX: number, clientY: number) => void;
  onMove: (fnId: string, clientX: number, clientY: number) => void;
  /** Released or cancelled. true when a node took the function. */
  onEnd: (fnId: string, clientX: number, clientY: number, cancelled: boolean) => boolean;
  /** The ghost's spot and its chip's spot, in the map's own px. */
  ghostAt: () => Pt | null;
  home: (fnId: string) => Pt | null;
  placeGhost: (fnId: string, at: Pt) => void;
  clearGhost: () => void;
};

type Press = { fnId: string; pointerId: number; x: number; y: number; moved: boolean };

const HYSTERESIS = 5;

//a chip lifts into a ghost that follows the pointer; when nothing takes it, it flies back the way it came
export function useFunctionDrag(options: FunctionDragOptions) {
  const opts = useRef(options);
  useEffect(() => {
    opts.current = options;
  });
  const press = useRef<Press | null>(null);
  const returning = useRef<{ handles: SpringHandle[] }>({ handles: [] });

  function stopReturn() {
    for (const handle of returning.current.handles) handle.stop();
    returning.current.handles = [];
  }

  useEffect(() => {
    const flight = returning.current;
    return () => {
      for (const handle of flight.handles) handle.stop();
    };
  }, []);

  function flyHome(fnId: string) {
    const o = opts.current;
    const from = o.ghostAt();
    const to = o.home(fnId);
    if (!from || !to) {
      o.clearGhost();
      return;
    }
    const live = { ...from };
    let pending = 2;
    const done = () => {
      pending -= 1;
      if (pending > 0) return;
      returning.current.handles = [];
      opts.current.clearGhost();
    };
    const axis = (key: "x" | "y") =>
      animateSpring({
        from: from[key],
        to: to[key],
        response: 0.3,
        onUpdate: (value) => {
          live[key] = value;
          opts.current.placeGhost(fnId, { ...live });
        },
        onComplete: done,
      });
    const handles = [axis("x"), axis("y")];
    if (pending > 0) returning.current.handles = handles;
  }

  function end(event: ReactPointerEvent<HTMLElement>, cancelled: boolean) {
    const current = press.current;
    if (!current || current.pointerId !== event.pointerId) return;
    press.current = null;
    if (!current.moved) {
      if (!cancelled) opts.current.onTap(current.fnId);
      return;
    }
    if (!opts.current.onEnd(current.fnId, event.clientX, event.clientY, cancelled)) flyHome(current.fnId);
  }

  function bind(fnId: string) {
    return {
      onPointerDown(event: ReactPointerEvent<HTMLElement>) {
        if (event.button !== 0) return;
        stopReturn();
        opts.current.clearGhost();
        press.current = { fnId, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
        capturePointer(event.currentTarget, event.pointerId);
      },
      onPointerMove(event: ReactPointerEvent<HTMLElement>) {
        const current = press.current;
        if (!current || current.pointerId !== event.pointerId) return;
        if (!current.moved) {
          if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < HYSTERESIS) return;
          current.moved = true;
          opts.current.onStart(fnId, event.clientX, event.clientY);
        }
        opts.current.onMove(fnId, event.clientX, event.clientY);
      },
      onPointerUp(event: ReactPointerEvent<HTMLElement>) {
        end(event, false);
      },
      onPointerCancel(event: ReactPointerEvent<HTMLElement>) {
        end(event, true);
      },
    };
  }

  return { bind };
}
