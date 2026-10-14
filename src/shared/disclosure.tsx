"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { revealExpandableSoon } from "@/shared/reveal-expandable";

//height animates via grid rows 0fr→1fr so nothing is measured in js; closed content is inert
export function Disclosure({ open, children, id }: { open: boolean; children: ReactNode; id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(open);

  useLayoutEffect(() => {
    const node = ref.current;
    const opened = open && !wasOpen.current;
    wasOpen.current = open;
    if (!opened || !node) return;
    return revealExpandableSoon(node);
  }, [open]);

  return (
    <div ref={ref} id={id} className="disclosure" data-open={open ? "true" : "false"} inert={!open}>
      <div className="disclosure-inner">{children}</div>
    </div>
  );
}
