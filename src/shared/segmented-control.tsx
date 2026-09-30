"use client";

import { useRef, type CSSProperties, type KeyboardEvent } from "react";

export type SegmentOption<T extends string> = { value: T; label: string; hint?: string };

type Props<T extends string> = {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
};

export function SegmentedControl<T extends string>({ value, options, onChange, label, className }: Props<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const delta =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={className ? `segmented ${className}` : "segmented"}
      style={{ "--segments": options.length, "--segment-index": index } as CSSProperties}
    >
      <span className="segmented-thumb" aria-hidden="true" />
      {options.map((option, i) => {
        const checked = i === index;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            title={option.hint}
            className="segmented-option"
            onClick={() => onChange(option.value)}
            onKeyDown={onKeyDown}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
