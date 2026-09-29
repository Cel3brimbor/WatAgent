"use client";

import { useEffect, useRef, useState } from "react";
import type { TimelineItem } from "@/calendar/types";
import { formatMonthPopTitle, isToday, monthCells, weekdayLabels } from "@/calendar/date-utils";
import { monthCellVisible } from "@/calendar/calendar-grid";
import { TimelineStrip } from "@/calendar/timeline-strip";

type Props = {
  focus: Date;
  weekStartsOn: 0 | 1;
  itemsForDay: (date: Date) => TimelineItem[];
  onOpen: (item: TimelineItem) => void;
  onCreate: (date: Date) => void;
  onCompleteTask?: (id: string, completed: boolean) => void;
};

export function CalendarMonthView({
  focus,
  weekStartsOn,
  itemsForDay,
  onOpen,
  onCreate,
  onCompleteTask,
}: Props) {
  const cells = monthCells(focus, weekStartsOn);
  const labels = weekdayLabels(weekStartsOn);
  const [popKey, setPopKey] = useState<string | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!popKey) return;
    function onPointer(event: MouseEvent) {
      if (popRef.current?.contains(event.target as Node)) return;
      setPopKey(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPopKey(null);
    }
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [popKey]);

  function openPop(key: string) {
    setPopKey(key);
  }

  return (
    <div className="calendar-month">
      <div className="calendar-month-weekdays">
        {labels.map((label) => (
          <div key={label} className="calendar-month-weekday">
            {label}
          </div>
        ))}
      </div>
      <div className="calendar-month-grid">
        {cells.map((cell) => {
          const key = cell.date.toDateString();
          const items = itemsForDay(cell.date);
          const { visible, overflow } = monthCellVisible(items);
          const popOpen = popKey === key;
          return (
            <div
              key={key}
              className={`calendar-month-cell${cell.inMonth ? "" : " is-outside"}${isToday(cell.date) ? " is-today" : ""}${popOpen ? " is-pop-open" : ""}`}
              onClick={() => openPop(key)}
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
                      openPop(key);
                    }}
                  >
                    + {overflow} more
                  </button>
                ) : null}
              </div>
              {popOpen ? (
                <div
                  ref={popRef}
                  className="calendar-month-pop"
                  role="dialog"
                  aria-label={formatMonthPopTitle(cell.date)}
                  onClick={(event) => event.stopPropagation()}
                >
                  <header className="calendar-month-pop-head">
                    <h3>{formatMonthPopTitle(cell.date)}</h3>
                    <button
                      type="button"
                      className="ghost-btn"
                      aria-label="Close"
                      onClick={() => setPopKey(null)}
                    >
                      ×
                    </button>
                  </header>
                  <div className="calendar-month-pop-list">
                    {items.length === 0 ? (
                      <p className="calendar-month-pop-empty">No items yet.</p>
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
                    className="ghost-btn is-active calendar-month-pop-add"
                    aria-label="Add event or task"
                    onClick={() => {
                      setPopKey(null);
                      onCreate(cell.date);
                    }}
                  >
                    +
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
