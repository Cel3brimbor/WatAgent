"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CalendarItemKind } from "@/calendar/types";
import { HOUR_PX } from "@/calendar/calendar-grid";
import { formatHourLabel } from "@/calendar/date-utils";
import type { CalendarDraft } from "@/calendar/calendar-item-editor";
import { timedDraftSlotForDay } from "@/calendar/editor-draft";

function endLabel(hour: number): string {
  return hour >= 24 ? formatHourLabel(0) : formatHourLabel(hour);
}

export function SlotDraft({
  start,
  end,
  kind = "event",
  title,
  hourPx = HOUR_PX,
}: {
  start: number;
  end: number;
  kind?: CalendarItemKind;
  title?: string;
  hourPx?: number;
}) {
  const label =
    title?.trim() || (kind === "task" ? "New task" : "New event");
  return (
    <div
      className={`calendar-slot-draft is-${kind}${end - start < 0.75 ? " is-short" : ""}`}
      style={{ top: start * hourPx, height: (end - start) * hourPx }}
      aria-hidden="true"
    >
      <span className="calendar-slot-draft-title">{label}</span>
      <span className="calendar-slot-draft-time">
        {formatHourLabel(start)} – {endLabel(end)}
      </span>
    </div>
  );
}

const EditorDraftContext = createContext<CalendarDraft | null>(null);

export function EditorDraftProvider({ value, children }: { value: CalendarDraft | null; children: ReactNode }) {
  return <EditorDraftContext.Provider value={value}>{children}</EditorDraftContext.Provider>;
}

//only this subscribes, so opening the dialog does not rebuild the day or week
export function EditorSlot({ day, hourPx }: { day: Date; hourPx?: number }) {
  const draft = useContext(EditorDraftContext);
  const slot = !draft || draft.id || draft.google ? null : timedDraftSlotForDay(draft, day);
  if (!draft || !slot) return null;
  return <SlotDraft start={slot.start} end={slot.end} kind={draft.kind} title={draft.title} hourPx={hourPx} />;
}
