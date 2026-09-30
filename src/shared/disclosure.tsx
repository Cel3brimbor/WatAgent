"use client";

import type { ReactNode } from "react";

//height animates via grid rows 0fr→1fr so nothing is measured in js; closed content is inert
export function Disclosure({ open, children, id }: { open: boolean; children: ReactNode; id?: string }) {
  return (
    <div id={id} className="disclosure" data-open={open ? "true" : "false"} inert={!open}>
      <div className="disclosure-inner">{children}</div>
    </div>
  );
}
