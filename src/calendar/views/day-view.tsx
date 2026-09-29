"use client";

import { useRef } from "react";
import type { TimelineItem } from "@/calendar/types";
import {
  formatHourLabel,
  startOfLocalDay,
} from "@/calendar/date-utils";
import { TimelineStrip } from "@/calendar/timeline-strip";
import {
  HOUR_PX,
  HOURS,
  hourFromClientY,
  layoutOverlappingBlocks,
  nowLineTop,
  timedItemStyle,
} from "@/calendar/calendar-grid";
import { useNowMs } from "@/calendar/calendar-item-editor";

type Props = {
  focus: Date;
  items: TimelineItem[];
  onOpen: (item: TimelineItem) => void;
  onCreateTimed: (hour: number, minute?: number, endHour?: number) => void;
  onCreateAllDay: () => void;
  onCompleteTask?: (id: string, completed: boolean) => void;
};

export function CalendarDayView({
  focus,
  items,
  onOpen,
  onCreateTimed,
  onCreateAllDay,
  onCompleteTask,
}: Props) {
  const now = useNowMs();
  const dayStart = startOfLocalDay(focus);
  const allDay = items.filter((item) => item.allDay);
  const timed = layoutOverlappingBlocks(
    items.filter((item) => !item.allDay),
    dayStart.getTime(),
  );
  const nowTop = nowLineTop(now, dayStart.getTime());
  const dragStart = useRef<number | null>(null);

  return (
    <div className="calendar-day">
      <div className="calendar-all-day">
        <span className="calendar-all-day-label">All-day</span>
        <div className="calendar-all-day-items">
          {allDay.map((item) => (
            <TimelineStrip
              key={item.id}
              item={item}
              compact
              onOpen={onOpen}
              onCompleteTask={onCompleteTask}
            />
          ))}
          <button
            type="button"
            className="calendar-all-day-add"
            onClick={onCreateAllDay}
            aria-label="Add all-day item"
          >
            +
          </button>
        </div>
      </div>
      <div className="calendar-day-grid">
        <div className="calendar-hours">
          {HOURS.map((hour) => (
            <div key={hour} className="calendar-hour-label" style={{ height: HOUR_PX }}>
              {hour === 0 ? "" : formatHourLabel(hour)}
            </div>
          ))}
        </div>
        <div
          className="calendar-day-slots"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            dragStart.current = hourFromClientY(event.currentTarget, event.clientY);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => {
            if (dragStart.current == null) return;
            const endHour = hourFromClientY(event.currentTarget, event.clientY);
            const startHour = Math.min(dragStart.current, endHour);
            const lastHour = Math.max(dragStart.current, endHour);
            dragStart.current = null;
            onCreateTimed(startHour, 0, lastHour);
          }}
          onPointerCancel={() => {
            dragStart.current = null;
          }}
        >
          {HOURS.map((hour) => (
            <button
              key={hour}
              type="button"
              className="calendar-hour-slot"
              style={{ height: HOUR_PX }}
              aria-label={`Create at ${formatHourLabel(hour)}`}
              onClick={() => onCreateTimed(hour)}
            />
          ))}
          {timed.map((layout) => (
            <div
              key={layout.item.id}
              className="calendar-timed-item"
              style={timedItemStyle(layout)}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <TimelineStrip item={layout.item} onOpen={onOpen} onCompleteTask={onCompleteTask} />
            </div>
          ))}
          {nowTop != null ? (
            <div className="calendar-now-line" style={{ top: nowTop }} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
