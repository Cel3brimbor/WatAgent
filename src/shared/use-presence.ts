"use client";

import { useEffect, useRef, useState } from "react";

export const EXIT_MS = 200;

type Presence<T> = {
  //the live value, or the last one while the exit transition plays
  value: T | null;
  //false while exiting; drive data-state and inert from this
  open: boolean;
};

//keeps an overlay mounted long enough to play its exit along the same path it entered
export function usePresence<T>(value: T | null | undefined | false, exitMs = EXIT_MS): Presence<T> {
  const present = Boolean(value);
  const keptRef = useRef<T | null>(null);
  if (value) keptRef.current = value;
  const [mounted, setMounted] = useState(present);

  useEffect(() => {
    if (present) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => {
      keptRef.current = null;
      setMounted(false);
    }, exitMs);
    return () => window.clearTimeout(timer);
  }, [present, exitMs]);

  if (value) return { value, open: true };
  return { value: mounted ? keptRef.current : null, open: false };
}
