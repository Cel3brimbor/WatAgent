"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

export type ContextMenuItem = {
  id: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export type ContextMenuPosition = { x: number; y: number };
export type ContextMenuState = ContextMenuPosition | null;

type Props = {
  state: ContextMenuState;
  items: ContextMenuItem[];
  onClose: () => void;
};

export function menuStateFromElement(el: HTMLElement): ContextMenuPosition {
  const rect = el.getBoundingClientRect();
  return { x: rect.left, y: rect.bottom + 4 };
}

export function ContextMenu({ state, items, onClose }: Props) {
  const ref = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!state) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onPointerDown(event: PointerEvent) {
      if (ref.current?.contains(event.target as Node)) return;
      onClose();
    }
    window.addEventListener("keydown", onKey);
    const timer = window.setTimeout(() => {
      window.addEventListener("pointerdown", onPointerDown, true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [state, onClose]);

  useLayoutEffect(() => {
    if (!state || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const dx = Math.min(0, window.innerWidth - 8 - rect.right);
    const dy = Math.min(0, window.innerHeight - 8 - rect.bottom);
    if (dx !== 0 || dy !== 0) {
      ref.current.style.left = `${state.x + dx}px`;
      ref.current.style.top = `${state.y + dy}px`;
    }
  }, [state]);

  if (!state || typeof document === "undefined") return null;

  return createPortal(
    <ul ref={ref} className="context-menu" role="menu" style={{ left: state.x, top: state.y }}>
      {items.map((item) => (
        <li key={item.id} role="none">
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={`context-menu-item${item.danger ? " is-danger" : ""}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              if (item.disabled) return;
              item.onSelect();
              onClose();
            }}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>,
    document.body,
  );
}
