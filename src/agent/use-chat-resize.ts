"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { animateSpring, rubberband, type SpringHandle } from "@/shared/motion";

export const CHAT_WIDTH_DEFAULT = 360;
export const CHAT_WIDTH_MIN = 280;
export const CHAT_WIDTH_MAX = 560;

const STORAGE_KEY = "watagent.chat-dock-width";

function clampWidth(value: number) {
  return Math.max(CHAT_WIDTH_MIN, Math.min(CHAT_WIDTH_MAX, value));
}

//past the limits the edge keeps following the pointer, just with increasing resistance
function bandedWidth(raw: number) {
  if (raw > CHAT_WIDTH_MAX) return CHAT_WIDTH_MAX + rubberband(raw - CHAT_WIDTH_MAX, CHAT_WIDTH_MAX);
  if (raw < CHAT_WIDTH_MIN) return CHAT_WIDTH_MIN - rubberband(CHAT_WIDTH_MIN - raw, CHAT_WIDTH_MIN);
  return raw;
}

function remember(width: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(Math.round(width)));
  } catch {
    return;
  }
}

//width is painted straight onto the panel's --chat-w while live, so dragging doesn't re-render the chat
export function useChatResize(panelRef: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(CHAT_WIDTH_DEFAULT);
  const [resizing, setResizing] = useState(false);
  //true while js owns the width (drag or spring), which turns off the css width transition
  const [live, setLive] = useState(false);
  const liveWidth = useRef(width);
  const dragRef = useRef({ pointerId: -1, startX: 0, startWidth: 0 });
  const springRef = useRef<SpringHandle | null>(null);

  useEffect(() => {
    let stored = Number.NaN;
    try {
      stored = Number.parseFloat(localStorage.getItem(STORAGE_KEY) ?? "");
    } catch {
      stored = Number.NaN;
    }
    if (Number.isFinite(stored)) {
      liveWidth.current = clampWidth(stored);
      setWidth(liveWidth.current);
    }
  }, []);

  useEffect(
    () => () => {
      springRef.current?.stop();
    },
    [],
  );

  const paint = useCallback(
    (next: number) => {
      liveWidth.current = next;
      panelRef.current?.style.setProperty("--chat-w", `${next}px`);
    },
    [panelRef],
  );

  const commit = useCallback((next: number) => {
    liveWidth.current = next;
    setWidth(next);
    remember(next);
  }, []);

  const settle = useCallback(
    (to: number) => {
      springRef.current?.stop();
      setLive(true);
      springRef.current = animateSpring({
        from: liveWidth.current,
        to,
        damping: 1,
        response: 0.35,
        onUpdate: paint,
        onComplete: () => {
          springRef.current = null;
          commit(to);
          setLive(false);
        },
      });
    },
    [paint, commit],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "touch") return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      //grabbing mid-spring picks up from the on-screen width, not the old target
      const current = springRef.current ? springRef.current.stop().value : liveWidth.current;
      springRef.current = null;
      paint(current);
      dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: current };
      setResizing(true);
      setLive(true);
    },
    [paint],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!resizing || event.pointerId !== dragRef.current.pointerId) return;
      event.preventDefault();
      paint(bandedWidth(dragRef.current.startWidth + (dragRef.current.startX - event.clientX)));
    },
    [resizing, paint],
  );

  const finishResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!resizing || event.pointerId !== dragRef.current.pointerId) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setResizing(false);
      const released = liveWidth.current;
      const target = clampWidth(released);
      if (target !== released) {
        settle(target);
        return;
      }
      commit(released);
      setLive(false);
    },
    [resizing, settle, commit],
  );

  const reset = useCallback(() => settle(CHAT_WIDTH_DEFAULT), [settle]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      springRef.current?.stop();
      springRef.current = null;
      setLive(false);
      //css transition eases each 16px step, so it isn't a hard jump
      commit(clampWidth(liveWidth.current + (event.key === "ArrowLeft" ? 16 : -16)));
    },
    [commit],
  );

  return {
    width,
    resizing,
    live,
    onPointerDown,
    onPointerMove,
    onPointerUp: finishResize,
    onPointerCancel: finishResize,
    onKeyDown,
    reset,
  };
}
