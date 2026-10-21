import type Lenis from "lenis";

//page-local. the citadel owns the instance; links borrow it so a jump eases through the morph.
let current: Lenis | null = null;

export function setPageLenis(lenis: Lenis | null) {
  current = lenis;
}

export function getPageLenis(): Lenis | null {
  return current;
}
