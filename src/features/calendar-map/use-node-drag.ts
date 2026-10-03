"use client";

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import {
  animateSpring,
  createVelocityTracker,
  project,
  rubberband,
  type SpringHandle,
  type VelocityTracker,
} from "@/shared/motion";
import { clamp, type Pt } from "./geometry";
import { capturePointer } from "./pointer";

type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

export type NodeDragOptions = {
  /** Pointer position on the canvas, in px. */
  toCanvas: (clientX: number, clientY: number) => Pt;
  /** A node's live centre, in px. */
  centre: (id: string) => Pt;
  bounds: (id: string) => Bounds;
  /** The size the rubber band stretches against. */
  span: () => { width: number; height: number };
  move: (id: string, centre: Pt) => void;
  onPress: (id: string | null) => void;
  onTap: (id: string) => void;
  /** While dragging: the node this one would be dropped on, if any. */
  over: (id: string, centre: Pt) => string | null;
  onOver: (targetId: string | null) => void;
  /** Released on a node. true sends the dragged node back where it started. */
  drop: (id: string, targetId: string) => boolean;
  onSettled: (id: string) => void;
};

type Drag = {
  id: string;
  pointerId: number;
  grab: Pt;
  origin: Pt;
  startClient: Pt;
  moved: boolean;
  xs: VelocityTracker;
  ys: VelocityTracker;
  last: Pt;
  target: string | null;
};

const HYSTERESIS = 4;
const FLICK = 600;

//past an edge the node keeps following, but with growing resistance
function band(value: number, min: number, max: number, span: number): number {
  if (value < min) return min + rubberband(value - min, span);
  if (value > max) return max + rubberband(value - max, span);
  return value;
}

//1:1 tracking from where the node was grabbed, then a momentum hand-off into per-axis springs.
//grabbing a node mid-flight stops its springs and carries on from the on-screen position.
export function useNodeDrag(options: NodeDragOptions) {
  const opts = useRef(options);
  useEffect(() => {
    opts.current = options;
  });
  const drag = useRef<Drag | null>(null);
  const springs = useRef(new Map<string, SpringHandle[]>());

  function stop(id: string) {
    for (const handle of springs.current.get(id) ?? []) handle.stop();
    springs.current.delete(id);
  }

  function settle(id: string, to: Pt, velocity: Pt = { x: 0, y: 0 }, damping = 1) {
    settleFrom(id, opts.current.centre(id), to, velocity, damping);
  }

  //from an explicit spot, for moves that start before the node has rendered there
  function settleFrom(id: string, from: Pt, to: Pt, velocity: Pt = { x: 0, y: 0 }, damping = 1) {
    stop(id);
    const live = { ...from };
    let pending = 2;
    const done = () => {
      pending -= 1;
      if (pending > 0) return;
      springs.current.delete(id);
      opts.current.onSettled(id);
    };
    const axis = (key: "x" | "y") =>
      animateSpring({
        from: from[key],
        to: to[key],
        velocity: velocity[key],
        damping,
        response: 0.35,
        onUpdate: (value) => {
          live[key] = value;
          opts.current.move(id, { ...live });
        },
        onComplete: done,
      });
    const handles = [axis("x"), axis("y")];
    if (pending > 0) springs.current.set(id, handles);
  }

  useEffect(() => {
    const running = springs.current;
    return () => {
      for (const handles of running.values()) for (const handle of handles) handle.stop();
      running.clear();
    };
  }, []);

  function finish(event: ReactPointerEvent<HTMLElement>, cancelled: boolean) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    const o = opts.current;
    o.onPress(null);
    if (current.target) o.onOver(null);
    if (!current.moved) {
      if (!cancelled) o.onTap(current.id);
      return;
    }
    if (!cancelled && current.target && o.drop(current.id, current.target)) {
      settle(current.id, current.origin);
      return;
    }
    const bounds = o.bounds(current.id);
    const velocity = { x: current.xs.velocity(), y: current.ys.velocity() };
    //aim for where the throw would come to rest, then let the springs carry the release speed there
    const to = {
      x: clamp(current.last.x + project(velocity.x, 0.99), bounds.minX, bounds.maxX),
      y: clamp(current.last.y + project(velocity.y, 0.99), bounds.minY, bounds.maxY),
    };
    settle(current.id, to, velocity, Math.hypot(velocity.x, velocity.y) > FLICK ? 0.8 : 1);
  }

  function bind(id: string) {
    return {
      onPointerDown(event: ReactPointerEvent<HTMLElement>) {
        if (event.button !== 0 || drag.current) return;
        stop(id);
        const o = opts.current;
        const at = o.toCanvas(event.clientX, event.clientY);
        const centre = o.centre(id);
        const xs = createVelocityTracker();
        const ys = createVelocityTracker();
        xs.add(at.x);
        ys.add(at.y);
        drag.current = {
          id,
          pointerId: event.pointerId,
          grab: { x: at.x - centre.x, y: at.y - centre.y },
          origin: centre,
          startClient: { x: event.clientX, y: event.clientY },
          moved: false,
          xs,
          ys,
          last: centre,
          target: null,
        };
        capturePointer(event.currentTarget, event.pointerId);
        o.onPress(id);
      },
      onPointerMove(event: ReactPointerEvent<HTMLElement>) {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        if (!current.moved && Math.hypot(event.clientX - current.startClient.x, event.clientY - current.startClient.y) < HYSTERESIS) {
          return;
        }
        current.moved = true;
        const o = opts.current;
        const at = o.toCanvas(event.clientX, event.clientY);
        current.xs.add(at.x);
        current.ys.add(at.y);
        const bounds = o.bounds(id);
        const span = o.span();
        const next = {
          x: band(at.x - current.grab.x, bounds.minX, bounds.maxX, span.width),
          y: band(at.y - current.grab.y, bounds.minY, bounds.maxY, span.height),
        };
        current.last = next;
        o.move(id, next);
        const target = o.over(id, next);
        if (target !== current.target) {
          current.target = target;
          o.onOver(target);
        }
      },
      onPointerUp(event: ReactPointerEvent<HTMLElement>) {
        finish(event, false);
      },
      onPointerCancel(event: ReactPointerEvent<HTMLElement>) {
        finish(event, true);
      },
    };
  }

  return { bind, settle, settleFrom, stop };
}
