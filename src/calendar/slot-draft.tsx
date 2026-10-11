"use client";

import { useSyncExternalStore } from "react";
import { DraftTitle } from "@/calendar/draft-title-preview";
import type { SlotSelectionStore } from "@/calendar/use-slot-drag";
import type { CalendarDraft } from "@/calendar/calendar-item-editor";
import { timedDraftSlotForDay } from "@/calendar/editor-draft";
import type { CalendarItemKind } from "@/calendar/types";
import { HOUR_PX } from "@/calendar/calendar-grid";
import { formatHourLabel } from "@/calendar/date-utils";

function endLabel(hour: number): string {
  return hour >= 24 ? formatHourLabel(0) : formatHourLabel(hour);
}

export function SlotDraft({
  start,
  end,
  kind = "event",
  title,
  hourPx = HOUR_PX,
  liveTitle = false,
}: {
  start: number;
  end: number;
  kind?: CalendarItemKind;
  title?: string;
  hourPx?: number;
  liveTitle?: boolean;
}) {
  const label =
    title?.trim() || (kind === "task" ? "New task" : "New event");
  return (
    <div
      className={`calendar-slot-draft is-${kind}${end - start < 0.75 ? " is-short" : ""}${liveTitle ? " is-editing" : " is-dragging"}`}
      style={{ top: start * hourPx, height: (end - start) * hourPx }}
      aria-hidden="true"
    >
      <span className="calendar-slot-draft-title">{liveTitle ? <DraftTitle fallback={label} placeholder={kind === "task" ? "New task" : "New event"} /> : label}</span>
      <span className="calendar-slot-draft-time">
        {formatHourLabel(start)} – {endLabel(end)}
      </span>
    </div>
  );
}

const noSelection = () => null;
export function SlotDragPreview<K>({ store, slotKey, day, editorDraft, hourPx }: {
  store: SlotSelectionStore<K>;
  slotKey: K;
  day: Date;
  editorDraft?: CalendarDraft | null;
  hourPx: number;
}) {
  const drag = useSyncExternalStore(store.subscribe, () => {
    const selected = store.getSnapshot();
    return selected?.key === slotKey ? selected : null;
  }, noSelection);
  const range = drag ?? timedDraftSlotForDay(editorDraft ?? null, day);
  if (!range) return null;
  return <SlotDraft start={range.start} end={range.end} kind={editorDraft?.kind} title={editorDraft?.title} hourPx={hourPx} liveTitle={!drag} />;
}
