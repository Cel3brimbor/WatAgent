"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { prefersReducedMotion } from "@/shared/motion";

function liveTranslateY(node: HTMLElement): number {
  const transform = getComputedStyle(node).transform;
  if (!transform || transform === "none") return 0;
  return new DOMMatrixReadOnly(transform).m42;
}

//children tagged with data-flip-id glide from their old slot instead of teleporting on reorder.
//a reorder mid-glide starts from the on-screen position (old layout + live transform), not the old target.
export function useFlip(containerRef: RefObject<HTMLElement | null>, orderKey: string) {
  const tops = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const nodes = [...root.querySelectorAll<HTMLElement>("[data-flip-id]")];
    const previous = tops.current;
    const next = new Map<string, number>();
    const reduce = prefersReducedMotion();

    for (const node of nodes) {
      const id = node.dataset.flipId as string;
      const top = node.offsetTop;
      next.set(id, top);
      const before = previous.get(id);
      if (before == null || reduce) continue;
      const dy = before + liveTranslateY(node) - top;
      if (Math.abs(dy) < 1) continue;
      node.style.transition = "none";
      node.style.transform = `translate3d(0, ${dy}px, 0)`;
      //commit the inverted position before releasing it into the transition
      void node.offsetHeight;
      node.style.transition = "transform var(--dur-spring) var(--ease-spring)";
      node.style.transform = "";
    }
    tops.current = next;
  }, [containerRef, orderKey]);
}
