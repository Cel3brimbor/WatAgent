"use client";

import type { CSSProperties } from "react";
import type { TimelineItem } from "@/calendar/types";
import {
  addDays,
  formatHourLabel,
  isToday,
  startOfLocalDay,
  startOfWeek,
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
import { intervalMinutes, labelEvery } from "@/calendar/time-scale";
import { useColumnWidths } from "@/calendar/use-column-width";
import { useNowMs } from "@/calendar/calendar-item-editor";
import { useSlotDrag } from "@/calendar/use-slot-drag";
import { SlotDraft } from "@/calendar/slot-draft";
import type { CalendarDraft } from "@/calendar/calendar-item-editor";
import { timedDraftSlotForDay } from "@/calendar/editor-draft";
import { PlusIcon } from "@/shared/icons";
import { AllDayResizeHandle, allDayItems, useAllDayResize } from "@/calendar/all-day-bar";

type Props = {
  focus: Date;
  weekStartsOn: 0 | 1;
  itemsForDay: (date: Date) => TimelineItem[];
  editorDraft?: CalendarDraft | null;
  onOpen: (item: TimelineItem) => void;
  onCreateTimed: (date: Date, hour: number, endHour?: number) => void;
  onCreateAllDay: (date: Date) => void;
  onSelectDay: (date: Date) => void;
  onCompleteTask?: (id: string, completed: boolean) => void;
  /** Show these days instead of the full week (the 5-day view passes Monday–Friday). */
  days?: Date[];
  readOnly?: boolean;
  hourPx?: number;
};

export function CalendarWeekView({
  focus,
  weekStartsOn,
  itemsForDay,
  editorDraft,
  onOpen,
  onCreateTimed,
  onCreateAllDay,
  onSelectDay,
  onCompleteTask,
  days: shownDays,
  readOnly = false,
  hourPx = HOUR_PX,
}: Props) {
  const now = useNowMs();
  const interval = intervalMinutes(hourPx);
  const labelStep = labelEvery(hourPx);
  const weekStart = startOfWeek(focus, weekStartsOn);
  const days = shownDays ?? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const [columnRef, columnWidths] = useColumnWidths(days.length);
  const labels = days.map((date) => date.toLocaleDateString(undefined, { weekday: "short" }));
  const slots = useSlotDrag<number>(
    (dayIndex, startHour, endHour) => onCreateTimed(days[dayIndex], startHour, endHour),
    hourPx,
  );
  const allDay = useAllDayResize();
  const hasAllDay = days.some((date) => allDayItems(itemsForDay(date)).length > 0);

  return (
    <div className="calendar-week" style={{ "--week-days": days.length } as CSSProperties}>
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
        <div className={`calendar-all-day-frame${allDay.resizing ? " is-resizing" : ""}`} data-empty={!hasAllDay}>
        <div
          className={`calendar-all-day-scroll${allDay.height != null ? " is-sized" : ""}`}
          style={allDay.height != null ? { height: allDay.height } : undefined}
        >
        <div className="calendar-week-all-day" data-empty={!hasAllDay}>
          <span className="calendar-all-day-label">All-day</span>
          {days.map((date) => {
            const topped = allDayItems(itemsForDay(date));
            const tone = `${isToday(date) ? " is-today" : ""}${date.getDay() % 6 === 0 ? " is-weekend" : ""}`;
            return (
              <div key={`${date.toISOString()}-all`} className={`calendar-week-all-day-col${tone}`}>
                {topped.map((item) => (
                  <TimelineStrip
                    key={item.id}
                    item={item}
                    layout="card"
                    onOpen={onOpen}
                    onCompleteTask={onCompleteTask}
                  />
                ))}
                {readOnly ? null : (
                  <button
                    type="button"
                    className="calendar-all-day-add"
                    aria-label="Add all-day item"
                    onClick={() => onCreateAllDay(date)}
                  >
                    <PlusIcon />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        </div>
        <AllDayResizeHandle height={allDay.height} handleProps={allDay.handleProps} />
        </div>
      </div>
      <div className="calendar-week-body">
        <div className="calendar-hours" title="Scroll to zoom">
          {HOURS.map((hour) => (
            <div key={hour} className="calendar-hour-label" style={{ height: hourPx }}>
              {hour === 0 || hour % labelStep !== 0 ? "" : formatHourLabel(hour)}
            </div>
          ))}
        </div>
        {days.map((date, dayIndex) => {
          const dayStart = startOfLocalDay(date);
          const dayItems = itemsForDay(date);
          const timed = layoutOverlappingBlocks(
            dayItems.filter((item) => !item.allDay && !item.pinned),
            dayStart.getTime(),
            hourPx,
          );
          const nowTop = isToday(date) ? nowLineTop(now, dayStart.getTime(), hourPx) : null;
          const tone = `${isToday(date) ? " is-today" : ""}${date.getDay() % 6 === 0 ? " is-weekend" : ""}`;
          const selection =
            slots.selection?.key === dayIndex
              ? slots.selection
              : timedDraftSlotForDay(editorDraft ?? null, date);
          return (
            <div
              key={date.toISOString()}
              ref={columnRef(dayIndex)}
              className={`calendar-week-col${tone}`}
              data-interval={interval}
              {...(readOnly ? {} : slots.bind(dayIndex))}
            >
              {HOURS.map((hour) => (
                readOnly ? (
                  <div key={hour} className="calendar-hour-slot" style={{ height: hourPx }} />
                ) : (
                  <button
                    key={hour}
                    type="button"
                    className="calendar-hour-slot"
                    style={{ height: hourPx }}
                    aria-label={`Create at ${formatHourLabel(hour)}`}
                    onClick={() => onCreateTimed(date, hour)}
                  />
                )
              ))}
              {timed.map((layout) => (
                <div
                  key={layout.item.id}
                  className={`calendar-timed-item ${timedItemClass(layout.height)}`}
                  style={timedItemStyle(layout, columnWidths[dayIndex] ?? 0)}
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
              {selection ? (
                <SlotDraft
                  start={selection.start}
                  end={selection.end}
                  kind={editorDraft?.kind}
                  title={editorDraft?.title}
                  hourPx={hourPx}
                />
              ) : null}
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
