"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "@/shared/icons";

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function monthDays(month: Date, weekStartsOn = 1): Date[] {
  const start = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  start.setDate(1 - (start.getDay() - weekStartsOn + 7) % 7);
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index, 12));
}

export function EditorDatePicker({ utc, label, min, onPick, onClose }: {
  utc: number;
  label: string;
  min?: string;
  onPick: (value: string) => void;
  onClose: () => void;
}) {
  const selected = new Date(utc);
  const [month, setMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1, 12));
  const [focused, setFocused] = useState(() => dateKey(selected));
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => { panelRef.current?.scrollIntoView({ block: "nearest" }); }, []);
  const gridRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const days = monthDays(month);
  const today = dateKey(new Date());
  const choose = (date: Date) => { if (!min || dateKey(date) >= min) onPick(dateKey(date)); };
  function moveFocus(date: Date) {
    const key = dateKey(date);
    if (min && key < min) return;
    setFocused(key);
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1, 12));
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${key}"]`)?.focus());
  }
  function moveMonth(offset: number) {
    const date = new Date(month.getFullYear(), month.getMonth() + offset, 1, 12);
    setMonth(date);
    const first = daysForFocus(date);
    setFocused(dateKey(first));
  }
  function daysForFocus(date: Date) {
    if (!min || dateKey(date) >= min) return date;
    const [y, m, d] = min.split("-").map(Number);
    return new Date(y, m - 1, d, 12);
  }
  return (
    <div ref={panelRef} className="editor-date-picker" role="group" aria-label={`Choose ${label.toLowerCase()}`} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    }}>
      <div className="editor-date-picker-head">
        <div><span className="editor-date-picker-caption">{label}</span><h3 id={headingId} aria-live="polite">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h3></div>
        <button type="button" className="icon-btn" aria-label="Previous month" disabled={Boolean(min && dateKey(new Date(month.getFullYear(), month.getMonth(), 0)) < min)} onClick={() => moveMonth(-1)}><ChevronLeftIcon /></button>
        <button type="button" className="icon-btn" aria-label="Next month" onClick={() => moveMonth(1)}><ChevronRightIcon /></button>
        <button type="button" className="icon-btn" aria-label="Close date picker" onClick={onClose}><CloseIcon /></button>
      </div>
      <div className="editor-date-weekdays" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <span key={index}>{new Date(2024, 0, 1 + index).toLocaleDateString(undefined, { weekday: "narrow" })}</span>)}</div>
      <div className="editor-date-grid" ref={gridRef} role="grid" aria-labelledby={headingId}>
        {Array.from({ length: 6 }, (_, week) => <div role="row" key={week}>{days.slice(week * 7, week * 7 + 7).map((date) => {
          const key = dateKey(date);
          const active = key === dateKey(selected);
          return <div role="gridcell" aria-selected={active} key={key}><button type="button" data-date={key} data-outside={date.getMonth() !== month.getMonth() || undefined} data-selected={active || undefined} aria-current={key === today ? "date" : undefined} aria-label={date.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })} disabled={Boolean(min && key < min)} tabIndex={focused === key ? 0 : -1} onFocus={() => setFocused(key)} onClick={() => choose(date)} onKeyDown={(event) => {
            const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -(date.getDay() + 6) % 7, End: 6 - (date.getDay() + 6) % 7 };
            if (event.key in offsets) { event.preventDefault(); moveFocus(new Date(date.getFullYear(), date.getMonth(), date.getDate() + offsets[event.key], 12)); }
            if (event.key === "PageUp" || event.key === "PageDown") {
              event.preventDefault();
              const next = new Date(date.getFullYear(), date.getMonth() + (event.key === "PageUp" ? -1 : 1), 1, 12);
              next.setDate(Math.min(date.getDate(), new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
              moveFocus(next);
            }
          }}>{date.getDate()}</button></div>;
        })}</div>)}
      </div>
      <div className="editor-date-shortcuts">{[0, 1].map((offset) => {
        const date = new Date(); date.setDate(date.getDate() + offset);
        return <button type="button" key={offset} disabled={Boolean(min && dateKey(date) < min)} onClick={() => choose(date)}>{offset === 0 ? "Today" : "Tomorrow"}</button>;
      })}<span>Use arrow keys to explore</span></div>
    </div>
  );
}
