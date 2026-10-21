"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { smoothScrollToElement } from "@/shared/motion";
import { getPageLenis } from "./citadel-lenis";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children: ReactNode;
};

export function scrollToTarget(target: HTMLElement) {
  const lenis = getPageLenis();
  if (!lenis) {
    smoothScrollToElement(target, "start");
    return;
  }
  //two springs on one scroller fight, so the page lenis takes the jump when it exists
  const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  lenis.scrollTo(target, { offset: -margin, duration: 1.6 });
}

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
        scrollToTarget(target);
        history.pushState(null, "", href);
      }}
    >
      {children}
    </a>
  );
}
