"use client";

import { useEffect, useLayoutEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { usePresence } from "@/shared/use-presence";

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

function enabledItems(root: HTMLElement | null): HTMLButtonElement[] {
  return root ? [...root.querySelectorAll<HTMLButtonElement>(".context-menu-item:not(:disabled)")] : [];
}

export function ContextMenu({ state, items, onClose }: Props) {
  const ref = useRef<HTMLUListElement>(null);
  //keep the last items too, so the menu doesn't empty out while it animates away
  const presence = usePresence(state ? { state, items } : null);
  const open = Boolean(state);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const menu = ref.current;
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
      //hand focus back to the trigger unless the user already moved it somewhere on purpose
      const active = document.activeElement;
      const stranded = !active || active === document.body || Boolean(menu?.contains(active));
      if (stranded && previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!state || !el) return;
    const rect = el.getBoundingClientRect();
    const dx = Math.min(0, window.innerWidth - 8 - rect.right);
    const dy = Math.min(0, window.innerHeight - 8 - rect.bottom);
    el.style.left = `${state.x + dx}px`;
    el.style.top = `${state.y + dy}px`;
    //grow out of the point that opened it, even when flipped to stay on screen
    el.style.transformOrigin = `${Math.max(0, -dx)}px ${Math.max(0, -dy)}px`;
    enabledItems(el)[0]?.focus({ preventScroll: true });
  }, [state]);

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLUListElement>) {
    const list = enabledItems(ref.current);
    if (list.length === 0) return;
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (event.key === "ArrowDown") next = (at + 1) % list.length;
    else if (event.key === "ArrowUp") next = (at - 1 + list.length) % list.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = list.length - 1;
    else if (event.key === "Tab") {
      event.preventDefault();
      onClose();
      return;
    }
    if (next < 0) return;
    event.preventDefault();
    list[next].focus();
  }

  if (!presence.value || typeof document === "undefined") return null;
  const shown = presence.value;

  return createPortal(
    <ul
      ref={ref}
      className="context-menu"
      role="menu"
      data-state={presence.open ? "open" : "closed"}
      inert={!presence.open}
      style={{ left: shown.state.x, top: shown.state.y }}
      onKeyDown={onMenuKeyDown}
    >
      {shown.items.map((item) => (
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
