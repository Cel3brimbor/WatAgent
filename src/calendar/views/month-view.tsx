"use client";

import { useEffect, useRef, useState } from "react";
import type { TimelineItem } from "@/calendar/types";
import { formatMonthPopTitle, isToday, monthCells, weekdayLabels } from "@/calendar/date-utils";
import { monthCellVisible } from "@/calendar/calendar-grid";
import { TimelineStrip } from "@/calendar/timeline-strip";
import { usePresence } from "@/shared/use-presence";
import { CloseIcon, PlusIcon } from "@/shared/icons";

type Props = {
  focus: Date;
  onSelectDate: (date: Date) => void;
  weekStartsOn: 0 | 1;
  itemsForDay: (date: Date) => TimelineItem[];
  onOpen: (item: TimelineItem) => void;
  onCreate: (date: Date) => void;
  onCompleteTask?: (id: string, completed: boolean) => void;
};

export function CalendarMonthView({
  focus,
  onSelectDate,
  weekStartsOn,
  itemsForDay,
  onOpen,
  onCreate,
  onCompleteTask,
}: Props) {
  const cells = monthCells(focus, weekStartsOn);
  const mobileCells = cells.slice(0, Math.ceil((cells.findLastIndex((cell) => cell.inMonth) + 1) / 7) * 7);
  const labels = weekdayLabels(weekStartsOn);
  const [popKey, setPopKey] = useState<string | null>(null);
  const pop = usePresence(popKey);
  const popRef = useRef<HTMLDivElement | null>(null);
  const selectedDay = focus;
  const selectedItems = itemsForDay(selectedDay);

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
          const items = itemsForDay(cell.date);
          const { visible, overflow } = monthCellVisible(items);
          const popShown = pop.value === key;
          return (
            <div
              key={key}
              className={`calendar-month-cell${cell.inMonth ? "" : " is-outside"}${isToday(cell.date) ? " is-today" : ""}${popShown ? " is-pop-open" : ""}`}
              onClick={() => setPopKey(key)}
            >
              <span className="calendar-month-day">{cell.date.getDate()}</span>
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
                      setPopKey(key);
                    }}
                  >
                    {overflow} more
                  </button>
                ) : null}
              </div>
              {popShown ? (
                <div
                  ref={popKey === key ? popRef : undefined}
                  className="calendar-month-pop"
                  role="dialog"
                  aria-label={formatMonthPopTitle(cell.date)}
                  data-state={pop.open ? "open" : "closed"}
                  inert={!pop.open}
                  onClick={(event) => event.stopPropagation()}
                >
                  <header className="calendar-month-pop-head">
                    <h3>{formatMonthPopTitle(cell.date)}</h3>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Close"
                      onClick={() => setPopKey(null)}
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
                  <button
                    type="button"
                    className="ghost-btn calendar-month-pop-add"
                    onClick={() => {
                      setPopKey(null);
                      onCreate(cell.date);
                    }}
                  >
                    <PlusIcon />
                    New event
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
    <div className="calendar-month-mobile">
      <div className="calendar-mobile-weekdays" aria-hidden="true">
        {labels.map((label) => <span key={label}>{label.slice(0, 1)}</span>)}
      </div>
      <div className="calendar-mobile-dates" aria-label="Choose a date">
        {mobileCells.map((cell) => {
          const items = itemsForDay(cell.date);
          const selected = cell.date.toDateString() === selectedDay.toDateString();
          return (
            <button key={cell.date.toDateString()} type="button"
              className={`calendar-mobile-date${cell.inMonth ? "" : " is-outside"}${isToday(cell.date) ? " is-today" : ""}${selected ? " is-selected" : ""}`}
              aria-label={`${cell.date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}, ${items.length} scheduled`}
              aria-pressed={selected} aria-current={isToday(cell.date) ? "date" : undefined}
              onClick={() => onSelectDate(cell.date)}>
              <span className="calendar-mobile-date-number">{cell.date.getDate()}</span>
              <span className="calendar-mobile-date-dots" aria-hidden="true">
                {items.slice(0, 3).map((item) => <i key={item.id} style={{ backgroundColor: item.calendarColor ?? item.google?.calendarColor ?? "var(--accent)" }} />)}
              </span>
            </button>
          );
        })}
      </div>
      <section className="calendar-mobile-agenda" aria-label="Selected day agenda">
        <header>
          <div><p>{isToday(selectedDay) ? "Today" : selectedDay.toLocaleDateString(undefined, { weekday: "long" })}</p>
            <h3 aria-live="polite">{selectedDay.toLocaleDateString(undefined, { month: "long", day: "numeric" })}</h3></div>
        </header>
        {selectedItems.length ? selectedItems.map((item) => (
          <div className="calendar-mobile-agenda-row" key={item.id}>
            <span className="calendar-mobile-agenda-time">{item.allDay ? "all-day" : new Date(item.startUTC).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
            <TimelineStrip item={item} layout="card" onOpen={onOpen} onCompleteTask={onCompleteTask} />
          </div>
        )) : <p className="calendar-mobile-agenda-empty">No events. A little room in your day.</p>}
      </section>
    </div>
    </div>
  );
}
