"use client";

import { memo, useEffect, useRef, useState, type RefObject } from "react";
import type { TimelineItem } from "@/calendar/types";
import { formatMonthPopTitle, isToday, monthCells, startOfLocalDay, weekdayLabels } from "@/calendar/date-utils";
import { monthCellVisible } from "@/calendar/calendar-grid";
import { TimelineStrip } from "@/calendar/timeline-strip";
import { DayItemsOverride, useDayTimeline } from "@/calendar/day-builder";
import { usePresence } from "@/shared/use-presence";
import { useStableCallback } from "@/shared/use-stable-callback";
import { CloseIcon } from "@/shared/icons";

type Props = {
  focus: Date;
  onSelectDate: (date: Date) => void;
  weekStartsOn: 0 | 1;
  itemsForDay?: (date: Date) => TimelineItem[];
  onOpen: (item: TimelineItem, anchor?: DOMRect) => void;
  onCreate: (date: Date) => void;
  onCompleteTask?: (id: string, completed: boolean) => void;
  readOnly?: boolean;
};

type OpenItem = (item: TimelineItem, anchor?: DOMRect) => void;
type CompleteTask = (id: string, completed: boolean) => void;

function sameInstant(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

type CellProps = {
  date: Date;
  inMonth: boolean;
  today: boolean;
  popActive: boolean;
  popOpen: boolean;
  readOnly: boolean;
  popRef: RefObject<HTMLDivElement | null>;
  onSelectDate: (date: Date) => void;
  onOpenPop: (key: string) => void;
  onClosePop: () => void;
  onOpen: OpenItem;
  onCreate: (date: Date) => void;
  onCompleteTask: CompleteTask;
};

function cellEqual(prev: CellProps, next: CellProps): boolean {
  return sameInstant(prev.date, next.date)
    && prev.inMonth === next.inMonth
    && prev.today === next.today
    && prev.popActive === next.popActive
    && prev.popOpen === next.popOpen
    && prev.readOnly === next.readOnly
    && prev.popRef === next.popRef
    && prev.onSelectDate === next.onSelectDate
    && prev.onOpenPop === next.onOpenPop
    && prev.onClosePop === next.onClosePop
    && prev.onOpen === next.onOpen
    && prev.onCreate === next.onCreate
    && prev.onCompleteTask === next.onCompleteTask;
}

export const MonthCell = memo(function MonthCell({
  date,
  inMonth,
  today,
  popActive,
  popOpen,
  readOnly,
  popRef,
  onSelectDate,
  onOpenPop,
  onClosePop,
  onOpen,
  onCreate,
  onCompleteTask,
}: CellProps) {
  const items = useDayTimeline(date);
  const key = date.toDateString();
  const { visible, overflow } = monthCellVisible(items);
  return (
    <div
      className={`calendar-month-cell${inMonth ? "" : " is-outside"}${today ? " is-today" : ""}${popActive ? " is-pop-open" : ""}`}
      onClick={() => {
        onSelectDate(date);
        onOpenPop(key);
      }}
      onDoubleClick={readOnly ? undefined : (event) => {
        if ((event.target as HTMLElement).closest("button, .calendar-strip, .calendar-month-pop")) return;
        onClosePop();
        onCreate(date);
      }}
    >
      <span className="calendar-month-day">{date.getDate()}</span>
      <div className="calendar-month-pills">
        {visible.map((item) => (
          <TimelineStrip
            key={item.id}
            item={item}
            compact
            onOpen={onOpen}
            onCompleteTask={onCompleteTask}
          />
        ))}
        {overflow > 0 ? (
          <button
            type="button"
            className="calendar-more"
            onClick={(event) => {
              event.stopPropagation();
              onOpenPop(key);
            }}
          >
            {overflow} more
          </button>
        ) : null}
      </div>
      {popActive ? (
        <div
          ref={popRef}
          className="calendar-month-pop"
          role="dialog"
          aria-label={formatMonthPopTitle(date)}
          data-state={popOpen ? "open" : "closed"}
          inert={!popOpen}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="calendar-month-pop-head">
            <h3>{formatMonthPopTitle(date)}</h3>
            <button
              type="button"
              className="icon-btn"
              aria-label="Close"
              onClick={() => onClosePop()}
            >
              <CloseIcon />
            </button>
          </header>
          <div className="calendar-month-pop-list">
            {items.length === 0 ? (
              <p className="calendar-month-pop-empty">Nothing scheduled.</p>
            ) : (
              items.map((item) => (
                <TimelineStrip
                  key={item.id}
                  item={item}
                  compact
                  onOpen={onOpen}
                  onCompleteTask={onCompleteTask}
                />
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}, cellEqual);

type DateDotProps = {
  date: Date;
  inMonth: boolean;
  today: boolean;
  selected: boolean;
  onSelectDate: (date: Date) => void;
};

function dateDotEqual(prev: DateDotProps, next: DateDotProps): boolean {
  return sameInstant(prev.date, next.date)
    && prev.inMonth === next.inMonth
    && prev.today === next.today
    && prev.selected === next.selected
    && prev.onSelectDate === next.onSelectDate;
}

const MonthDateDot = memo(function MonthDateDot({ date, inMonth, today, selected, onSelectDate }: DateDotProps) {
  const items = useDayTimeline(date);
  return (
    <button
      type="button"
      className={`calendar-mobile-date${inMonth ? "" : " is-outside"}${today ? " is-today" : ""}${selected ? " is-selected" : ""}`}
      aria-label={`${date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}, ${items.length} scheduled`}
      aria-pressed={selected}
      aria-current={today ? "date" : undefined}
      onClick={() => onSelectDate(date)}
    >
      <span className="calendar-mobile-date-number">{date.getDate()}</span>
      <span className="calendar-mobile-date-dots" aria-hidden="true">
        {items.slice(0, 3).map((item) => (
          <i key={item.id} style={{ backgroundColor: item.calendarColor ?? item.google?.calendarColor ?? "var(--accent)" }} />
        ))}
      </span>
    </button>
  );
}, dateDotEqual);

type AgendaProps = {
  date: Date;
  onOpen: OpenItem;
  onCompleteTask: CompleteTask;
};

function agendaEqual(prev: AgendaProps, next: AgendaProps): boolean {
  return sameInstant(prev.date, next.date) && prev.onOpen === next.onOpen && prev.onCompleteTask === next.onCompleteTask;
}

const MonthAgenda = memo(function MonthAgenda({ date, onOpen, onCompleteTask }: AgendaProps) {
  const items = useDayTimeline(date);
  const today = isToday(date);
  return (
    <section className="calendar-mobile-agenda" aria-label="Selected day agenda">
      <header>
        <div>
          <p>{today ? "Today" : date.toLocaleDateString(undefined, { weekday: "long" })}</p>
          <h3 aria-live="polite">{date.toLocaleDateString(undefined, { month: "long", day: "numeric" })}</h3>
        </div>
      </header>
      {items.length ? items.map((item) => (
        <div className="calendar-mobile-agenda-row" key={item.id}>
          <span className="calendar-mobile-agenda-time">
            {item.allDay ? "all-day" : new Date(item.startUTC).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </span>
          <TimelineStrip item={item} layout="card" onOpen={onOpen} onCompleteTask={onCompleteTask} />
        </div>
      )) : <p className="calendar-mobile-agenda-empty">No events. A little room in your day.</p>}
    </section>
  );
}, agendaEqual);

function MonthLayout({
  focus,
  onSelectDate,
  weekStartsOn,
  onOpen,
  onCreate,
  onCompleteTask,
  readOnly = false,
}: Omit<Props, "itemsForDay">) {
  const cells = monthCells(focus, weekStartsOn);
  const mobileCells = cells.slice(0, Math.ceil((cells.findLastIndex((cell) => cell.inMonth) + 1) / 7) * 7);
  const labels = weekdayLabels(weekStartsOn);
  const [popKey, setPopKey] = useState<string | null>(null);
  const pop = usePresence(popKey);
  const popRef = useRef<HTMLDivElement | null>(null);
  const todayMs = startOfLocalDay(new Date()).getTime();
  const selectedKey = focus.toDateString();
  const selectDate = useStableCallback(onSelectDate);
  const openItem = useStableCallback(onOpen);
  const createItem = useStableCallback(onCreate);
  const completeTask = useStableCallback(onCompleteTask);
  const openPop = useStableCallback((key: string) => setPopKey(key));
  const closePop = useStableCallback(() => setPopKey(null));

  useEffect(() => {
    if (!popKey) return;
    function onPointer(event: PointerEvent) {
      if (popRef.current?.contains(event.target as Node)) return;
      setPopKey(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPopKey(null);
    }
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [popKey]);

  return (
    <div className="calendar-month-layout">
      <div className="calendar-month calendar-month-desktop">
        <div className="calendar-sticky">
          <div className="calendar-month-weekdays">
            {labels.map((label) => (
              <div key={label} className="calendar-month-weekday">
                {label}
              </div>
            ))}
          </div>
        </div>
        <div className="calendar-month-grid">
          {cells.map((cell) => {
            const key = cell.date.toDateString();
            const active = pop.value === key;
            return (
              <MonthCell
                key={key}
                date={cell.date}
                inMonth={cell.inMonth}
                today={startOfLocalDay(cell.date).getTime() === todayMs}
                popActive={active}
                popOpen={active && pop.open}
                readOnly={readOnly}
                popRef={popRef}
                onSelectDate={selectDate}
                onOpenPop={openPop}
                onClosePop={closePop}
                onOpen={openItem}
                onCreate={createItem}
                onCompleteTask={completeTask}
              />
            );
          })}
        </div>
      </div>
      <div className="calendar-month-mobile">
        <div className="calendar-mobile-weekdays" aria-hidden="true">
          {labels.map((label) => <span key={label}>{label.slice(0, 1)}</span>)}
        </div>
        <div className="calendar-mobile-dates" aria-label="Choose a date">
          {mobileCells.map((cell) => (
            <MonthDateDot
              key={cell.date.toDateString()}
              date={cell.date}
              inMonth={cell.inMonth}
              today={startOfLocalDay(cell.date).getTime() === todayMs}
              selected={cell.date.toDateString() === selectedKey}
              onSelectDate={selectDate}
            />
          ))}
        </div>
        <MonthAgenda date={focus} onOpen={openItem} onCompleteTask={completeTask} />
      </div>
    </div>
  );
}

//parent renders stay off the month grid; a cell still updates from its own day subscription
export const CalendarMonthView = memo(function CalendarMonthView({ itemsForDay, ...rest }: Props) {
  return (
    <DayItemsOverride itemsForDay={itemsForDay ?? null}>
      <MonthLayout {...rest} />
    </DayItemsOverride>
  );
});
