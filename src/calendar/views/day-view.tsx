"use client";

import { useMemo } from "react";
import type { TimelineItem } from "@/calendar/types";
import {
  formatHourLabel,
  startOfLocalDay,
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
import { AllDayResizeHandle, allDayItems, useAllDayResize } from "@/calendar/all-day-bar";

type Props = {
  focus: Date;
  items: TimelineItem[];
  editorDraft?: CalendarDraft | null;
  onOpen: (item: TimelineItem) => void;
  onCreateTimed: (hour: number, minute?: number, endHour?: number) => void;
  onCreateAllDay: () => void;
  onCompleteTask?: (id: string, completed: boolean) => void;
  readOnly?: boolean;
  hourPx?: number;
};

export function CalendarDayView({
  focus,
  items,
  editorDraft,
  onOpen,
  onCreateTimed,
  onCreateAllDay,
  onCompleteTask,
  readOnly = false,
  hourPx = HOUR_PX,
}: Props) {
  const now = useNowMs();
  const dayStart = startOfLocalDay(focus);
  const dayStartMs = dayStart.getTime();
  const timed = useMemo(() => layoutOverlappingBlocks(
    items.filter((item) => !item.allDay && !item.pinned),
    dayStartMs,
    hourPx,
  ), [items, dayStartMs, hourPx]);
  const nowTop = nowLineTop(now, dayStart.getTime(), hourPx);
  const interval = intervalMinutes(hourPx);
  const labelStep = labelEvery(hourPx);
  const [columnRef, columnWidths] = useColumnWidths(1);
  const allDay = useAllDayResize();
  const topped = allDayItems(items);
  const slots = useSlotDrag<"day">((_key, startHour, endHour) => onCreateTimed(startHour, 0, endHour), hourPx);
  const dragSlot = slots.selection;
  const draftSlot = dragSlot ?? timedDraftSlotForDay(editorDraft ?? null, focus);
  const draftLabel = editorDraft?.title;
  const draftKind = editorDraft?.kind;

  return (
    <div className="calendar-day">
      <div className="calendar-sticky">
        <div className={`calendar-all-day-frame${allDay.resizing ? " is-resizing" : ""}`} data-empty={topped.length === 0}>
        <div
          className={`calendar-all-day-scroll${allDay.height != null ? " is-sized" : ""}`}
          style={allDay.height != null ? { height: allDay.height } : undefined}
        >
        <div className="calendar-all-day" data-empty={topped.length === 0}>
          <span className="calendar-all-day-label">All-day</span>
          <div
            className="calendar-all-day-items"
            onDoubleClick={
              readOnly
                ? undefined
                : (event) => {
                    if ((event.target as HTMLElement).closest(".calendar-strip")) return;
                    onCreateAllDay();
                  }
            }
          >
            {topped.map((item) => (
              <TimelineStrip
                key={item.id}
                item={item}
                layout="card"
                onOpen={onOpen}
                onCompleteTask={onCompleteTask}
              />
            ))}
          </div>
        </div>
        </div>
        <AllDayResizeHandle height={allDay.height} handleProps={allDay.handleProps} />
        </div>
      </div>
      <div className="calendar-day-grid">
        <div className="calendar-hours" title="Scroll to zoom">
          {HOURS.map((hour) => (
            <div key={hour} className="calendar-hour-label" style={{ height: hourPx }}>
              {hour === 0 || hour % labelStep !== 0 ? "" : formatHourLabel(hour)}
            </div>
          ))}
        </div>
        <div className="calendar-day-slots" data-interval={interval} ref={columnRef(0)} {...(readOnly ? {} : slots.bind("day"))}>
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
                onClick={() => onCreateTimed(hour)}
              />
            )
          ))}
          {timed.map((layout) => (
            <div
              key={layout.item.id}
              className={`calendar-timed-item ${timedItemClass(layout.height)}`}
              style={timedItemStyle(layout, columnWidths[0] ?? 0)}
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
          {draftSlot ? (
            <SlotDraft
              start={draftSlot.start}
              end={draftSlot.end}
              kind={draftKind}
              title={draftLabel}
              hourPx={hourPx}
            />
          ) : null}
          {nowTop != null ? (
            <div className="calendar-now-line" style={{ top: nowTop }} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
