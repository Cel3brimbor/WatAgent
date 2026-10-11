"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

//clientWidth is already a whole pixel, and it does not change while the column only scrolls
export function useColumnWidths(count: number): [(index: number) => (node: HTMLDivElement | null) => void, number[]] {
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const widthsRef = useRef<number[]>([]);
  const observerRef = useRef<ResizeObserver | null>(null);
  const countRef = useRef(count);
  const [widths, setWidths] = useState<number[]>([]);
  const callbacks = useRef(new Map<number, (node: HTMLDivElement | null) => void>());

  countRef.current = count;

  const publish = useCallback(() => {
    const next = nodes.current.slice(0, countRef.current).map((node) => node?.clientWidth ?? 0);
    const prev = widthsRef.current;
    if (next.length === prev.length && next.every((value, index) => value === prev[index])) return;
    widthsRef.current = next;
    setWidths(next);
  }, []);

  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => publish());
    observerRef.current = observer;
    for (const node of nodes.current) {
      if (node) observer.observe(node);
    }
    publish();
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [count, publish]);

  const refAt = useCallback((index: number) => {
    let callback = callbacks.current.get(index);
    if (!callback) {
      callback = (node) => {
        const previous = nodes.current[index];
        if (previous && previous !== node) observerRef.current?.unobserve(previous);
        nodes.current[index] = node;
        if (node) observerRef.current?.observe(node);
        publish();
      };
      callbacks.current.set(index, callback);
    }
    return callback;
  }, [publish]);

  return [refAt, widths];
}
