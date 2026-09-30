"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

//only the top-most dialog reacts to keys (e.g. confirm stacked on the editor)
const stack: symbol[] = [];

type Options = {
  open: boolean;
  onEscape: () => void;
  //defaults to the first focusable element (or whatever already has autoFocus)
  initialFocus?: RefObject<HTMLElement | null>;
};

//modal wayfinding: focus moves in, tab stays in, escape gets out, focus returns to the trigger
export function useDialog(ref: RefObject<HTMLElement | null>, { open, onEscape, initialFocus }: Options) {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    if (!open) return;
    const id = Symbol("dialog");
    stack.push(id);
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    if (root && !root.contains(document.activeElement)) {
      const target = initialFocus?.current ?? root.querySelector<HTMLElement>(FOCUSABLE);
      target?.focus({ preventScroll: true });
    }

    function onKey(event: KeyboardEvent) {
      if (stack[stack.length - 1] !== id) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        escapeRef.current();
        return;
      }
      if (event.key !== "Tab" || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      stack.splice(stack.indexOf(id), 1);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [open, ref, initialFocus]);
}
