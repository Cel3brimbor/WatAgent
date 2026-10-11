"use client";

import { useCallback, useRef } from "react";

//one function identity; the body is whatever was passed on the latest render
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R;
export function useStableCallback<A extends unknown[], R>(fn: ((...args: A) => R) | undefined): (...args: A) => R;
export function useStableCallback<A extends unknown[], R>(
  fn: ((...args: A) => R) | undefined,
): (...args: A) => R {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: A) => {
    const current = ref.current;
    if (current) return current(...args);
    return undefined as R;
  }, []);
}
