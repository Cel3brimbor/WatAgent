"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { prefersReducedMotion } from "@/shared/motion";

function liveTranslateY(node: HTMLElement): number {
  const transform = getComputedStyle(node).transform;
  if (!transform || transform === "none") return 0;
  return new DOMMatrixReadOnly(transform).m42;
}

// Reorders pick up from each row's visible position, including an interrupted glide.
export function useFlip(containerRef: RefObject<HTMLElement | null>, orderKey: string) {
  const tops = useRef(new Map<string, number>());
  const animations = useRef(new Map<HTMLElement, Animation>());

  useEffect(() => () => {
    animations.current.forEach((animation) => animation.cancel());
    animations.current.clear();
  }, []);

  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const previous = tops.current;
    const next = new Map<string, number>();
    const reduce = prefersReducedMotion();
    // Read every position before starting any animation; avoid one forced layout per row.
    const moves = [...root.querySelectorAll<HTMLElement>("[data-flip-id]")].map((node) => {
      const id = node.dataset.flipId as string;
      const top = node.offsetTop;
      next.set(id, top);
      const before = previous.get(id);
      return { node, dy: before == null || reduce ? 0 : before + liveTranslateY(node) - top };
    });
    const style = getComputedStyle(root);
    const duration = Number.parseFloat(style.getPropertyValue("--dur-spring")) || 300;
    // WAAPI uses the cubic fallback on browsers without linear() easing support.
    const easing = style.getPropertyValue("--ease-spring").trim() || "cubic-bezier(0.25, 1, 0.5, 1)";
    animations.current.forEach((animation) => animation.cancel());
    animations.current.clear();
    for (const { node, dy } of moves) {
      if (Math.abs(dy) < 1) continue;
      const animation = node.animate(
        [{ transform: `translate3d(0, ${dy}px, 0)` }, { transform: "translate3d(0, 0, 0)" }],
        { duration, easing },
      );
      animations.current.set(node, animation);
      animation.onfinish = () => animations.current.delete(node);
    }
    tops.current = next;
  }, [containerRef, orderKey]);
}
