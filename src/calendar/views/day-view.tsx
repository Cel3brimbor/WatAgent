"use client";

import { memo, useMemo } from "react";
import type { TimelineItem } from "@/calendar/types";
import { formatHourLabel } from "@/calendar/date-utils";
import { TimelineStrip } from "@/calendar/timeline-strip";
import { HOUR_PX, HOURS } from "@/calendar/calendar-grid";
import { labelEvery } from "@/calendar/time-scale";
import { useColumnWidths } from "@/calendar/use-column-width";
import { useSlotDrag } from "@/calendar/use-slot-drag";
import type { CalendarDraft } from "@/calendar/calendar-item-editor";
import { timedDraftSlotForDay } from "@/calendar/editor-draft";
import { AllDayResizeHandle, useAllDayResize } from "@/calendar/all-day-bar";
import { DayItemsOverride, useAllDayTimeline } from "@/calendar/day-builder";
import { useStableCallback } from "@/shared/use-stable-callback";
import { WeekDayColumn } from "@/calendar/views/week-view";

type Props = {
  focus: Date;
  items?: TimelineItem[];
  editorDraft?: CalendarDraft | null;
  onOpen: (item: TimelineItem, anchor?: DOMRect) => void;
  onCreateTimed: (hour: number, minute?: number, endHour?: number) => void;
  onCreateAllDay: () => void;
  onCompleteTask?: (id: string, completed: boolean) => void;
  readOnly?: boolean;
  hourPx?: number;
};

function DayAllDay({
  date,
  readOnly,
  onOpen,
  onCreateAllDay,
  onCompleteTask,
}: {
  date: Date;
  readOnly: boolean;
  onOpen: (item: TimelineItem, anchor?: DOMRect) => void;
  onCreateAllDay: () => void;
  onCompleteTask: (id: string, completed: boolean) => void;
}) {
  const topped = useAllDayTimeline(date);
  const allDay = useAllDayResize();
  const empty = topped.length === 0;
  return (
    <div className={`calendar-all-day-frame${allDay.resizing ? " is-resizing" : ""}`} data-empty={empty}>
      <div
        className={`calendar-all-day-scroll${allDay.height != null ? " is-sized" : ""}`}
        style={allDay.height != null ? { height: allDay.height } : undefined}
      >
        <div className="calendar-all-day" data-empty={empty}>
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
  );
}

function DayGrid({
  focus,
  editorDraft,
  onOpen,
  onCreateTimed,
  onCreateAllDay,
  onCompleteTask,
  readOnly = false,
  hourPx = HOUR_PX,
}: Omit<Props, "items">) {
  const openItem = useStableCallback(onOpen);
  const createAllDay = useStableCallback(onCreateAllDay);
  const completeTask = useStableCallback(onCompleteTask);
  const createTimed = useStableCallback((_date: Date, hour: number, endHour?: number) => {
    onCreateTimed(hour, 0, endHour);
  });
  const labelStep = labelEvery(hourPx);
  const [columnRef, columnWidths] = useColumnWidths(1);
  const slots = useSlotDrag<"day">((_key, startHour, endHour) => onCreateTimed(startHour, 0, endHour), hourPx);
  const drag = slots.selection?.key === "day" ? slots.selection : null;
  const draftSlot = drag ?? timedDraftSlotForDay(editorDraft ?? null, focus);
  const selection = draftSlot ? { start: draftSlot.start, end: draftSlot.end } : null;

  return (
    <div className="calendar-day">
      <div className="calendar-sticky">
        <DayAllDay
          date={focus}
          readOnly={readOnly}
          onOpen={openItem}
          onCreateAllDay={createAllDay}
          onCompleteTask={completeTask}
        />
      </div>
      <div className="calendar-day-grid">
        <div className="calendar-hours" title="Scroll to zoom">
          {HOURS.map((hour) => (
            <div key={hour} className="calendar-hour-label" style={{ height: hourPx }}>
              {hour === 0 || hour % labelStep !== 0 ? "" : formatHourLabel(hour)}
            </div>
          ))}
        </div>
        <WeekDayColumn
          date={focus}
          hourPx={hourPx}
          columnWidth={columnWidths[0] ?? 0}
          readOnly={readOnly}
          variant="day"
          nodeRef={columnRef(0)}
          bind={slots.bind("day")}
          onOpen={openItem}
          onCreateTimed={createTimed}
          onCompleteTask={completeTask}
          selection={selection}
          draftKind={selection ? editorDraft?.kind : undefined}
          draftTitle={selection ? editorDraft?.title : undefined}
        />
      </div>
    </div>
  );
}

//same bail-out as the week shell: parent renders must not repaint this column
export const CalendarDayView = memo(function CalendarDayView({ items, ...rest }: Props) {
  const override = useMemo(() => (items ? () => items : null), [items]);
  return (
    <DayItemsOverride itemsForDay={override}>
      <DayGrid {...rest} />
    </DayItemsOverride>
  );
});
