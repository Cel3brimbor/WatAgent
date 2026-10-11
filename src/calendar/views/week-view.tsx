"use client";

import { memo, useContext, useMemo, useRef, type CSSProperties } from "react";
import type { CalendarItemKind, TimelineItem } from "@/calendar/types";
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
  timedItemClass,
  timedItemStyle,
} from "@/calendar/calendar-grid";
import { intervalMinutes, labelEvery } from "@/calendar/time-scale";
import { useColumnWidths } from "@/calendar/use-column-width";
import { useSlotDrag, type SlotSelection } from "@/calendar/use-slot-drag";
import { SlotDraft } from "@/calendar/slot-draft";
import type { CalendarDraft } from "@/calendar/calendar-item-editor";
import { timedDraftSlotForDay } from "@/calendar/editor-draft";
import { AllDayResizeHandle, allDayItems, useAllDayResize } from "@/calendar/all-day-bar";
import { ColumnItemsContext, DayItemsOverride, useAllDayTimeline, useHasAllDay, useTimedTimeline } from "@/calendar/day-builder";
import { NowLine } from "@/calendar/now-line";
import { useStableCallback } from "@/shared/use-stable-callback";

type Props = {
  focus: Date;
  weekStartsOn: 0 | 1;
  itemsForDay?: (date: Date) => TimelineItem[];
  editorDraft?: CalendarDraft | null;
  onOpen: (item: TimelineItem, anchor?: DOMRect) => void;
  onCreateTimed: (date: Date, hour: number, endHour?: number) => void;
  onCreateAllDay: (date: Date) => void;
  onSelectDay: (date: Date) => void;
  onCompleteTask?: (id: string, completed: boolean) => void;
  /** Show these days instead of the full week (the 5-day view passes Monday–Friday). */
  days?: Date[];
  readOnly?: boolean;
  hourPx?: number;
};

type OpenItem = (item: TimelineItem, anchor?: DOMRect) => void;
type CompleteTask = (id: string, completed: boolean) => void;
type HourSlot = { start: number; end: number } | null;

const NO_BIND = {};

function sameSlot(a: HourSlot, b: HourSlot): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.start === b.start && a.end === b.end;
}

type ColumnProps = {
  date: Date;
  hourPx: number;
  columnWidth: number;
  readOnly: boolean;
  variant: "week" | "day";
  nodeRef: (node: HTMLDivElement | null) => void;
  bind: Record<string, unknown>;
  onOpen: OpenItem;
  onCreateTimed: (date: Date, hour: number, endHour?: number) => void;
  onCompleteTask: CompleteTask;
  selection: HourSlot;
  draftKind?: CalendarItemKind;
  draftTitle?: string;
};

function columnEqual(prev: ColumnProps, next: ColumnProps): boolean {
  return prev.date === next.date
    && prev.hourPx === next.hourPx
    && prev.columnWidth === next.columnWidth
    && prev.readOnly === next.readOnly
    && prev.variant === next.variant
    && prev.nodeRef === next.nodeRef
    && prev.bind === next.bind
    && prev.onOpen === next.onOpen
    && prev.onCreateTimed === next.onCreateTimed
    && prev.onCompleteTask === next.onCompleteTask
    && prev.draftKind === next.draftKind
    && prev.draftTitle === next.draftTitle
    && sameSlot(prev.selection, next.selection);
}

export const WeekDayColumn = memo(function WeekDayColumn({
  date,
  hourPx,
  columnWidth,
  readOnly,
  variant,
  nodeRef,
  bind,
  onOpen,
  onCreateTimed,
  onCompleteTask,
  selection,
  draftKind,
  draftTitle,
}: ColumnProps) {
  const items = useTimedTimeline(date);
  const dayStart = startOfLocalDay(date);
  const dayStartMs = dayStart.getTime();
  const timed = useMemo(
    () => layoutOverlappingBlocks(items, dayStartMs, hourPx),
    [items, dayStartMs, hourPx],
  );
  const interval = intervalMinutes(hourPx);
  const tone = variant === "week"
    ? `${isToday(date) ? " is-today" : ""}${date.getDay() % 6 === 0 ? " is-weekend" : ""}`
    : "";
  const className = variant === "day" ? "calendar-day-slots" : `calendar-week-col${tone}`;
  return (
    <div
      ref={nodeRef}
      className={className}
      data-interval={interval}
      {...(readOnly ? NO_BIND : bind)}
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
          style={timedItemStyle(layout, columnWidth)}
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
          kind={draftKind}
          title={draftTitle}
          hourPx={hourPx}
        />
      ) : null}
      {isToday(date) ? <NowLine dayStartMs={dayStartMs} hourPx={hourPx} /> : null}
    </div>
  );
}, columnEqual);

type AllDayCellProps = {
  date: Date;
  readOnly: boolean;
  onOpen: OpenItem;
  onCreateAllDay: (date: Date) => void;
  onCompleteTask: CompleteTask;
};

export const WeekAllDayCell = memo(function WeekAllDayCell({
  date,
  readOnly,
  onOpen,
  onCreateAllDay,
  onCompleteTask,
}: AllDayCellProps) {
  const topped = useAllDayTimeline(date);
  const tone = `${isToday(date) ? " is-today" : ""}${date.getDay() % 6 === 0 ? " is-weekend" : ""}`;
  return (
    <div
      className={`calendar-week-all-day-col${tone}`}
      onDoubleClick={
        readOnly
          ? undefined
          : (event) => {
              if ((event.target as HTMLElement).closest(".calendar-strip")) return;
              onCreateAllDay(date);
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
  );
});

function WeekAllDaySection({
  days,
  readOnly,
  onOpen,
  onCreateAllDay,
  onCompleteTask,
}: {
  days: Date[];
  readOnly: boolean;
  onOpen: OpenItem;
  onCreateAllDay: (date: Date) => void;
  onCompleteTask: CompleteTask;
}) {
  const override = useContext(ColumnItemsContext);
  const fromStore = useHasAllDay(days);
  const hasAllDay = override
    ? days.some((date) => allDayItems(override(date)).length > 0)
    : fromStore;
  const allDay = useAllDayResize();
  return (
    <div className={`calendar-all-day-frame${allDay.resizing ? " is-resizing" : ""}`} data-empty={!hasAllDay}>
      <div
        className={`calendar-all-day-scroll${allDay.height != null ? " is-sized" : ""}`}
        style={allDay.height != null ? { height: allDay.height } : undefined}
      >
        <div className="calendar-week-all-day" data-empty={!hasAllDay}>
          <span className="calendar-all-day-label">All-day</span>
          {days.map((date) => (
            <WeekAllDayCell
              key={`${date.toISOString()}-all`}
              date={date}
              readOnly={readOnly}
              onOpen={onOpen}
              onCreateAllDay={onCreateAllDay}
              onCompleteTask={onCompleteTask}
            />
          ))}
        </div>
      </div>
      <AllDayResizeHandle height={allDay.height} handleProps={allDay.handleProps} />
    </div>
  );
}

type ShownSlot = {
  selection: HourSlot;
  draftKind: CalendarItemKind | undefined;
  draftTitle: string | undefined;
};

function slotForDay(
  dayIndex: number,
  date: Date,
  drag: SlotSelection<number> | null,
  editorDraft: CalendarDraft | null | undefined,
  prev: ShownSlot | undefined,
): ShownSlot {
  const dragged = drag?.key === dayIndex;
  const slot = dragged
    ? { start: drag.start, end: drag.end }
    : timedDraftSlotForDay(editorDraft ?? null, date);
  const draftKind = slot ? editorDraft?.kind : undefined;
  const draftTitle = slot ? editorDraft?.title : undefined;
  if (prev && prev.draftKind === draftKind && prev.draftTitle === draftTitle && sameSlot(prev.selection, slot)) return prev;
  return { selection: slot, draftKind, draftTitle };
}

function WeekGrid({
  focus,
  weekStartsOn,
  editorDraft,
  onOpen,
  onCreateTimed,
  onCreateAllDay,
  onSelectDay,
  onCompleteTask,
  days: shownDays,
  readOnly = false,
  hourPx = HOUR_PX,
}: Omit<Props, "itemsForDay">) {
  const openItem = useStableCallback(onOpen);
  const createTimed = useStableCallback(onCreateTimed);
  const createAllDay = useStableCallback(onCreateAllDay);
  const completeTask = useStableCallback(onCompleteTask);
  const labelStep = labelEvery(hourPx);
  const weekStartMs = startOfWeek(focus, weekStartsOn).getTime();
  const days = useMemo(
    () => shownDays ?? Array.from({ length: 7 }, (_, i) => addDays(new Date(weekStartMs), i)),
    [shownDays, weekStartMs],
  );
  const [columnRef, columnWidths] = useColumnWidths(days.length);
  const labels = days.map((date) => date.toLocaleDateString(undefined, { weekday: "short" }));
  const slots = useSlotDrag<number>(
    (dayIndex, startHour, endHour) => createTimed(days[dayIndex], startHour, endHour),
    hourPx,
  );
  const slotCache = useRef<ShownSlot[]>([]);
  const shownSlots = days.map((date, dayIndex) => {
    const next = slotForDay(dayIndex, date, slots.selection, editorDraft, slotCache.current[dayIndex]);
    slotCache.current[dayIndex] = next;
    return next;
  });

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
        <WeekAllDaySection
          days={days}
          readOnly={readOnly}
          onOpen={openItem}
          onCreateAllDay={createAllDay}
          onCompleteTask={completeTask}
        />
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
          const shown = shownSlots[dayIndex];
          return (
            <WeekDayColumn
              key={date.toISOString()}
              date={date}
              hourPx={hourPx}
              columnWidth={columnWidths[dayIndex] ?? 0}
              readOnly={readOnly}
              variant="week"
              nodeRef={columnRef(dayIndex)}
              bind={slots.bind(dayIndex)}
              onOpen={openItem}
              onCreateTimed={createTimed}
              onCompleteTask={completeTask}
              selection={shown.selection}
              draftKind={shown.draftKind}
              draftTitle={shown.draftTitle}
            />
          );
        })}
      </div>
    </div>
  );
}

//a save, poll, or chat frame re-renders the app. this shell bails out so only the subscribed day column paints
export const CalendarWeekView = memo(function CalendarWeekView({ itemsForDay, ...rest }: Props) {
  return (
    <DayItemsOverride itemsForDay={itemsForDay ?? null}>
      <WeekGrid {...rest} />
    </DayItemsOverride>
  );
});
