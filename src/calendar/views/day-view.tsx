"use client";

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
import { useNowMs } from "@/calendar/calendar-item-editor";
import { useSlotDrag } from "@/calendar/use-slot-drag";
import { SlotDraft } from "@/calendar/slot-draft";
import type { CalendarDraft } from "@/calendar/calendar-item-editor";
import { timedDraftSlotForDay } from "@/calendar/editor-draft";
import { PlusIcon } from "@/shared/icons";

type Props = {
  focus: Date;
  items: TimelineItem[];
  editorDraft?: CalendarDraft | null;
  onOpen: (item: TimelineItem) => void;
  onCreateTimed: (hour: number, minute?: number, endHour?: number) => void;
  onCreateAllDay: () => void;
  onCompleteTask?: (id: string, completed: boolean) => void;
  readOnly?: boolean;
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
}: Props) {
  const now = useNowMs();
  const dayStart = startOfLocalDay(focus);
  const topped = items.filter((item) => item.allDay || item.pinned);
  const timed = layoutOverlappingBlocks(
    items.filter((item) => !item.allDay && !item.pinned),
    dayStart.getTime(),
  );
  const nowTop = nowLineTop(now, dayStart.getTime());
  const slots = useSlotDrag<"day">((_key, startHour, endHour) => onCreateTimed(startHour, 0, endHour));
  const dragSlot = slots.selection;
  const draftSlot = dragSlot ?? timedDraftSlotForDay(editorDraft ?? null, focus);
  const draftLabel = editorDraft?.title;
  const draftKind = editorDraft?.kind;

  return (
    <div className="calendar-day">
      <div className="calendar-sticky">
        <div className="calendar-all-day" data-empty={topped.length === 0}>
          <span className="calendar-all-day-label">All-day</span>
          <div className="calendar-all-day-items">
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
                onClick={onCreateAllDay}
                aria-label="Add all-day item"
              >
                <PlusIcon />
              </button>
            )}
          </div>
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
        <div className="calendar-day-slots" {...(readOnly ? {} : slots.bind("day"))}>
          {HOURS.map((hour) => (
            readOnly ? (
              <div key={hour} className="calendar-hour-slot" style={{ height: HOUR_PX }} />
            ) : (
              <button
                key={hour}
                type="button"
                className="calendar-hour-slot"
                style={{ height: HOUR_PX }}
                aria-label={`Create at ${formatHourLabel(hour)}`}
                onClick={() => onCreateTimed(hour)}
              />
            )
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
          {draftSlot ? (
            <SlotDraft
              start={draftSlot.start}
              end={draftSlot.end}
              kind={draftKind}
              title={draftLabel}
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
