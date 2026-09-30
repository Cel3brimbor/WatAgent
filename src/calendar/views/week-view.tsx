"use client";

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
  layoutOverlappingBlocks,
  nowLineTop,
  timedItemClass,
  timedItemStyle,
} from "@/calendar/calendar-grid";
import { useNowMs } from "@/calendar/calendar-item-editor";
import { useSlotDrag } from "@/calendar/use-slot-drag";
import { SlotDraft } from "@/calendar/slot-draft";
import { PlusIcon } from "@/shared/icons";

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
  const slots = useSlotDrag<number>((dayIndex, startHour, endHour) =>
    onCreateTimed(days[dayIndex], startHour, endHour),
  );

  return (
    <div className="calendar-week">
      <div className="calendar-sticky">
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
                    layout="card"
                    onOpen={onOpen}
                    onCompleteTask={onCompleteTask}
                  />
                ))}
                <button
                  type="button"
                  className="calendar-all-day-add"
                  aria-label="Add all-day item"
                  onClick={() => onCreateAllDay(date)}
                >
                  <PlusIcon />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div className="calendar-week-body">
        <div className="calendar-hours">
          {HOURS.map((hour) => (
            <div key={hour} className="calendar-hour-label" style={{ height: HOUR_PX }}>
              {hour === 0 ? "" : formatHourLabel(hour)}
            </div>
          ))}
        </div>
        {days.map((date, dayIndex) => {
          const dayStart = startOfLocalDay(date);
          const timed = layoutOverlappingBlocks(
            itemsForDay(date).filter((item) => !item.allDay),
            dayStart.getTime(),
          );
          const nowTop = isToday(date) ? nowLineTop(now, dayStart.getTime()) : null;
          const selection = slots.selection?.key === dayIndex ? slots.selection : null;
          return (
            <div key={date.toISOString()} className="calendar-week-col" {...slots.bind(dayIndex)}>
              {HOURS.map((hour) => (
                <button
                  key={hour}
                  type="button"
                  className="calendar-hour-slot"
                  style={{ height: HOUR_PX }}
                  aria-label={`Create at ${formatHourLabel(hour)}`}
                  onClick={() => onCreateTimed(date, hour)}
                />
              ))}
              {timed.map((layout) => (
                <div
                  key={layout.item.id}
                  className={`calendar-timed-item ${timedItemClass(layout.height)}`}
                  style={timedItemStyle(layout)}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <TimelineStrip
                    item={layout.item}
                    layout="card"
                    onOpen={onOpen}
                    onCompleteTask={onCompleteTask}
                  />
                </div>
              ))}
              {selection ? <SlotDraft start={selection.start} end={selection.end} /> : null}
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
