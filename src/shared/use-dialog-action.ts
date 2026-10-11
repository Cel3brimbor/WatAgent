"use client";

import { useEffect, useRef, useState } from "react";

//paint the local exit first. an immediate callback runs on the click, before that exit
export function useDialogAction(open: boolean) {
  const [closing, setClosing] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef<number | null>(null);
  useEffect(() => () => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    if (timer.current != null) clearTimeout(timer.current);
    pending.current = null;
  }, []);

  useEffect(() => {
    if (open) return;
    if (frame.current != null) cancelAnimationFrame(frame.current);
    if (timer.current != null) clearTimeout(timer.current);
    frame.current = null;
    timer.current = null;
    pending.current = null;
    setClosing(false);
  }, [open]);

  function complete() {
    const action = pending.current;
    if (!action) return;
    pending.current = null;
    if (timer.current != null) clearTimeout(timer.current);
    timer.current = null;
    try { action(); }
    finally { setClosing(false); }
  }

  //immediate runs on the click, before the exit, so a row can leave with the dialog
  function run(action: () => void, immediate?: () => void) {
    if (!open || pending.current) return;
    immediate?.();
    pending.current = action;
    setClosing(true);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      // Fallback for interrupted animations; normally animationend completes it first.
      timer.current = setTimeout(complete, reducedMotion ? 0 : 160);
    });
  }

  return { visible: open && !closing, pending: closing, run, complete };
}
