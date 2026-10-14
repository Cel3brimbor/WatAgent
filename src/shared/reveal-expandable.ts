import { prefersReducedMotion } from "@/shared/motion";

const MARGIN = 12;

function canScroll(node: HTMLElement): boolean {
  const overflow = getComputedStyle(node).overflowY;
  return overflow === "auto" || overflow === "scroll" || overflow === "overlay";
}

//the control that opened the panel, when it sits just above the panel
function baseOf(panel: HTMLElement): HTMLElement {
  const prev = panel.previousElementSibling;
  if (!(prev instanceof HTMLElement)) return panel;
  if (prev.getBoundingClientRect().height > 72) return panel;
  return prev;
}

function shiftFor(viewTop: number, viewBottom: number, baseTop: number, panelBottom: number): number {
  const viewHeight = viewBottom - viewTop;
  const span = panelBottom - baseTop;
  if (span + MARGIN * 2 <= viewHeight) {
    if (panelBottom > viewBottom - MARGIN) return panelBottom - (viewBottom - MARGIN);
    if (baseTop < viewTop + MARGIN) return baseTop - (viewTop + MARGIN);
    return 0;
  }
  //taller than the scroller: park the base at the top so the opened body starts on screen
  return baseTop - (viewTop + MARGIN);
}

function applyShift(scroller: HTMLElement, shift: number) {
  if (Math.abs(shift) < 2) return;
  const next = scroller.scrollTop + shift;
  const max = scroller.scrollHeight - scroller.clientHeight;
  scroller.scrollTop = Math.max(0, Math.min(max, next));
}

//scroll every clipping ancestor so the open panel's base stays in view
export function revealExpandable(panel: HTMLElement, base?: HTMLElement) {
  const anchor = base ?? baseOf(panel);
  let parent = panel.parentElement;
  while (parent) {
    if (canScroll(parent)) {
      const box = parent.getBoundingClientRect();
      const shift = shiftFor(box.top, box.top + parent.clientHeight, anchor.getBoundingClientRect().top, panel.getBoundingClientRect().bottom);
      applyShift(parent, shift);
    }
    parent = parent.parentElement;
  }
  const root = document.scrollingElement;
  if (root instanceof HTMLElement && root.scrollHeight > root.clientHeight + 1) {
    const shift = shiftFor(0, window.innerHeight, anchor.getBoundingClientRect().top, panel.getBoundingClientRect().bottom);
    applyShift(root, shift);
  }
}

//follow the open animation; a late layout pass is what makes the sidebar actually move
export function revealExpandableSoon(panel: HTMLElement, base?: HTMLElement): () => void {
  const anchor = base ?? baseOf(panel);
  revealExpandable(panel, anchor);
  if (prefersReducedMotion()) return () => {};
  let frames = 0;
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  window.addEventListener("wheel", stop, { passive: true, capture: true });
  window.addEventListener("touchmove", stop, { passive: true, capture: true });
  const finish = () => {
    stopped = true;
    window.removeEventListener("wheel", stop, { capture: true });
    window.removeEventListener("touchmove", stop, { capture: true });
  };
  const step = () => {
    frames += 1;
    if (stopped || frames > 24 || !panel.isConnected) {
      finish();
      return;
    }
    revealExpandable(panel, anchor);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return finish;
}
