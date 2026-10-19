"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { smoothScrollToElement } from "@/shared/motion";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children: ReactNode;
};

export function ProductScrollLink({ href, onClick, children, ...rest }: Props) {
  const hash = href.startsWith("#") ? href.slice(1) : "";

  return (
    <a
      href={href}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || !hash) return;
        const target = document.getElementById(hash);
        if (!target) return;
        event.preventDefault();
        smoothScrollToElement(target, "start");
        history.pushState(null, "", href);
      }}
    >
      {children}
    </a>
  );
}
