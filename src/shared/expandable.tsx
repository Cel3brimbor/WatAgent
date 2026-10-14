"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Disclosure } from "@/shared/disclosure";

//long enough to cover the disclosure close (260ms)
const HOLD_MS = 280;

//same height ease as a disclosure. the body mounts a frame before it opens, and stays through the close
export function Expandable({ open, children, id }: { open: boolean; children: ReactNode; id?: string }) {
  const [held, setHeld] = useState(open);
  const [shown, setShown] = useState(false);
  const seenOpen = useRef(open);

  useLayoutEffect(() => {
    if (open) {
      seenOpen.current = true;
      setHeld(true);
      const frame = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(frame);
    }
    setShown(false);
    if (!seenOpen.current) return;
    seenOpen.current = false;
    const timer = window.setTimeout(() => setHeld(false), HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <Disclosure open={shown} id={id}>
      {held ? children : null}
    </Disclosure>
  );
}
