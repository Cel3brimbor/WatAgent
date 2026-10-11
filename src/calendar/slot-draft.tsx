"use client";

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
      className={`calendar-slot-draft is-${kind}`}
      style={{ top: start * hourPx, height: (end - start + 1) * hourPx }}
      aria-hidden="true"
    >
      <span className="calendar-slot-draft-title">{label}</span>
      <span className="calendar-slot-draft-time">
        {formatHourLabel(start)} – {endLabel(end + 1)}
      </span>
    </div>
  );
}
