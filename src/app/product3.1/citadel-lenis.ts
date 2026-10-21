import type Lenis from "lenis";

//page-local. the citadel owns the instance; links borrow it so a jump eases through the morph.
let current: Lenis | null = null;

export function setPageLenis(lenis: Lenis | null) {
  current = lenis;
}

export function getPageLenis(): Lenis | null {
  return current;
}

//wheel and trackpad speed, in px/s, below which scrolling is untouched
const CALM = 1800;
//how hard speed past CALM is penalised: at 2× calm a delta keeps 1/(1 + DRAG), at 3× 1/(1 + 4·DRAG)
const DRAG = 1.6;
const WINDOW_MS = 150;

//air drag on the scroll: the faster the hand, the less each delta moves the page, so a fling slows into the
//next hold instead of sailing past it. normal-speed scrolling passes through unchanged; nothing gets longer.
export function createAirDrag() {
  const samples: { t: number; d: number }[] = [];
  return (delta: number, now = performance.now()): number => {
    samples.push({ t: now, d: Math.abs(delta) });
    while (samples.length && samples[0].t < now - WINDOW_MS) samples.shift();
    const speed = samples.reduce((sum, sample) => sum + sample.d, 0) / (WINDOW_MS / 1000);
    if (speed <= CALM) return 1;
    const over = (speed - CALM) / CALM;
    return 1 / (1 + DRAG * over * over);
  };
}
