"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { AGENT_EFFORTS, agentEffortLabel, type AgentEffort } from "@/agent/agent-effort";
import { CheckIcon, ChevronDownIcon } from "@/shared/icons";
import { usePresence } from "@/shared/use-presence";

type Props = {
  value: AgentEffort;
  onChange: (effort: AgentEffort) => void;
  disabled?: boolean;
};

function enabledOptions(root: HTMLElement | null): HTMLButtonElement[] {
  return root ? [...root.querySelectorAll<HTMLButtonElement>(".context-menu-item:not(:disabled)")] : [];
}

export function AgentEffortButton({ value, onChange, disabled = false }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const presence = usePresence(open ? value : null);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    const button = buttonRef.current;
    if (!open || !menu || !button) return;
    const trigger = button.getBoundingClientRect();
    const menuBox = menu.getBoundingClientRect();
    const gap = 6;
    let top = trigger.top - gap - menuBox.height;
    let originY = menuBox.height;
    if (top < 8) {
      top = Math.min(trigger.bottom + gap, window.innerHeight - 8 - menuBox.height);
      originY = 0;
    }
    let left = trigger.left;
    const overflowX = left + menuBox.width - (window.innerWidth - 8);
    if (overflowX > 0) left -= overflowX;
    if (left < 8) left = 8;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.transformOrigin = `${Math.max(0, trigger.left - left)}px ${originY}px`;
    const options = enabledOptions(menu);
    const selected = options.find((option) => option.getAttribute("aria-selected") === "true");
    (selected ?? options[0])?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const button = buttonRef.current;
    const menu = menuRef.current;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    const timer = window.setTimeout(() => {
      window.addEventListener("pointerdown", onPointerDown, true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown, true);
      const active = document.activeElement;
      const stranded = !active || active === document.body || Boolean(menu?.contains(active));
      if (stranded) button?.focus({ preventScroll: true });
    };
  }, [open]);

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLUListElement>) {
    const list = enabledOptions(menuRef.current);
    if (list.length === 0) return;
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (event.key === "ArrowDown") next = (at + 1) % list.length;
    else if (event.key === "ArrowUp") next = (at - 1 + list.length) % list.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = list.length - 1;
    else if (event.key === "Tab") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (next < 0) return;
    event.preventDefault();
    list[next].focus();
  }

  const label = agentEffortLabel(value);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="composer-effort"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Agent effort, ${label}`}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
        }}
      >
        <span className="composer-effort-name">Effort</span>
        <span className="composer-effort-value">{label}</span>
        <ChevronDownIcon />
      </button>
      {presence.value && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={menuRef}
              className="context-menu effort-menu"
              role="listbox"
              aria-label="Agent effort"
              data-state={presence.open ? "open" : "closed"}
              inert={!presence.open}
              onKeyDown={onMenuKeyDown}
            >
              <li role="presentation">
                <p className="effort-menu-label">Agent effort</p>
              </li>
              {AGENT_EFFORTS.map((effort) => {
                const selected = effort === presence.value;
                return (
                  <li key={effort} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`context-menu-item${selected ? " is-selected" : ""}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        onChange(effort);
                        setOpen(false);
                      }}
                    >
                      <span>{agentEffortLabel(effort)}</span>
                      {selected ? <CheckIcon /> : <span className="effort-menu-check" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
