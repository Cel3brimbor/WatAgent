"use client";

import { useRef } from "react";
import type { TimelineItem } from "@/calendar/types";
import {
  addDays,
  formatHourLabel,
  isToday,
  startOfLocalDay,
  startOfWeek,
  weekdayLabels,
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
  weekStartsOn: 0 | 1;
  itemsForDay: (date: Date) => TimelineItem[];
  onOpen: (item: TimelineItem) => void;
  onCreateTimed: (date: Date, hour: number, endHour?: number) => void;
  onCreateAllDay: (date: Date) => void;
  onSelectDay: (date: Date) => void;
  onCompleteTask?: (id: string, completed: boolean) => void;
};

export function CalendarWeekView({
  focus,
  weekStartsOn,
  itemsForDay,
  onOpen,
  onCreateTimed,
  onCreateAllDay,
  onSelectDay,
  onCompleteTask,
}: Props) {
  const now = useNowMs();
  const weekStart = startOfWeek(focus, weekStartsOn);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const labels = weekdayLabels(weekStartsOn);
  const dragStart = useRef<number | null>(null);

  return (
    <div className="calendar-week">
      <div className="calendar-week-head">
        <div className="calendar-week-gutter" />
        {days.map((date, i) => (
          <button
            key={date.toISOString()}
            type="button"
            className={`calendar-week-day-head${isToday(date) ? " is-today" : ""}`}
            onClick={() => onSelectDay(date)}
          >
            <span>{labels[i]}</span>
            <strong>{date.getDate()}</strong>
          </button>
        ))}
      </div>
      <div className="calendar-week-all-day">
        <span className="calendar-all-day-label">All-day</span>
        {days.map((date) => {
          const allDay = itemsForDay(date).filter((item) => item.allDay);
          return (
            <div key={`${date.toISOString()}-all`} className="calendar-week-all-day-col">
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
                onClick={() => onCreateAllDay(date)}
              >
                +
              </button>
            </div>
          );
        })}
      </div>
      <div className="calendar-week-body">
        <div className="calendar-hours">
          {HOURS.map((hour) => (
            <div key={hour} className="calendar-hour-label" style={{ height: HOUR_PX }}>
              {hour === 0 ? "" : formatHourLabel(hour)}
            </div>
          ))}
        </div>
        {days.map((date) => {
          const dayStart = startOfLocalDay(date);
          const timed = layoutOverlappingBlocks(
            itemsForDay(date).filter((item) => !item.allDay),
            dayStart.getTime(),
          );
          const nowTop = isToday(date) ? nowLineTop(now, dayStart.getTime()) : null;
          return (
            <div
              key={date.toISOString()}
              className="calendar-week-col"
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
                onCreateTimed(date, startHour, lastHour);
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
                  onClick={() => onCreateTimed(date, hour)}
                />
              ))}
              {timed.map((layout) => (
                <div
                  key={layout.item.id}
                  className="calendar-timed-item"
                  style={timedItemStyle(layout)}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <TimelineStrip
                    item={layout.item}
                    compact
                    onOpen={onOpen}
                    onCompleteTask={onCompleteTask}
                  />
                </div>
              ))}
              {nowTop != null ? (
                <div className="calendar-now-line" style={{ top: nowTop }} />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
