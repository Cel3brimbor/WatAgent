"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

export const CHAT_WIDTH_DEFAULT = 360;
export const CHAT_WIDTH_MIN = 280;
export const CHAT_WIDTH_MAX = 560;

const STORAGE_KEY = "watagent.chat-dock-width";

function clampWidth(value: number) {
  return Math.max(CHAT_WIDTH_MIN, Math.min(CHAT_WIDTH_MAX, value));
}

function remember(width: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    return;
  }
}

export function useChatResize() {
  const [width, setWidth] = useState(CHAT_WIDTH_DEFAULT);
  const [resizing, setResizing] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;
  const dragRef = useRef({ pointerId: -1, startX: 0, startWidth: 0 });

  useEffect(() => {
    let stored = Number.NaN;
    try {
      stored = Number.parseFloat(localStorage.getItem(STORAGE_KEY) ?? "");
    } catch {
      stored = Number.NaN;
    }
    if (Number.isFinite(stored)) setWidth(clampWidth(stored));
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "touch") return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
      setResizing(true);
    },
    [width],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!resizing || event.pointerId !== dragRef.current.pointerId) return;
      event.preventDefault();
      const next = clampWidth(dragRef.current.startWidth + (dragRef.current.startX - event.clientX));
      widthRef.current = next;
      setWidth(next);
    },
    [resizing],
  );

  const finishResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!resizing || event.pointerId !== dragRef.current.pointerId) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setResizing(false);
      remember(widthRef.current);
    },
    [resizing],
  );

  const reset = useCallback(() => {
    widthRef.current = CHAT_WIDTH_DEFAULT;
    setWidth(CHAT_WIDTH_DEFAULT);
    remember(CHAT_WIDTH_DEFAULT);
  }, []);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = clampWidth(widthRef.current + (event.key === "ArrowLeft" ? 16 : -16));
    widthRef.current = next;
    setWidth(next);
    remember(next);
  }, []);

  return {
    width,
    resizing,
    onPointerDown,
    onPointerMove,
    onPointerUp: finishResize,
    onPointerCancel: finishResize,
    onKeyDown,
    reset,
  };
}
