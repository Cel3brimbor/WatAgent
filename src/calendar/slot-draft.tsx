"use client";

import { HOUR_PX } from "@/calendar/calendar-grid";
import { formatHourLabel } from "@/calendar/date-utils";

function endLabel(hour: number): string {
  return hour >= 24 ? formatHourLabel(0) : formatHourLabel(hour);
}

export function SlotDraft({ start, end }: { start: number; end: number }) {
  return (
    <div
      className="calendar-slot-draft"
      style={{ top: start * HOUR_PX, height: (end - start + 1) * HOUR_PX }}
      aria-hidden="true"
    >
      <span className="calendar-slot-draft-title">New event</span>
      <span className="calendar-slot-draft-time">
        {formatHourLabel(start)} – {endLabel(end + 1)}
      </span>
    </div>
  );
}
