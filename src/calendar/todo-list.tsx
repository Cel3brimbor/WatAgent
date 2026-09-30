"use client";

import { useRef } from "react";
import type { CalendarItemDoc } from "@/calendar/types";
import { CheckIcon, PlusIcon } from "@/shared/icons";
import { useFlip } from "@/shared/use-flip";

type Props = {
  items: CalendarItemDoc[];
  onOpen: (item: CalendarItemDoc) => void;
  onComplete: (id: string, completed: boolean) => void;
  onCreate: () => void;
};

function whenLabel(item: CalendarItemDoc): string {
  const start = new Date(item.calendar.startUTC);
  const date = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (item.calendar.allDay) return date;
  const time = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date}, ${time}`;
}

export function TodoList({ items, onOpen, onComplete, onCreate }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const tasks = items
    .filter((item) => item.calendar.kind === "task")
    .sort((a, b) => {
      if (Boolean(a.calendar.completed) !== Boolean(b.calendar.completed)) {
        return a.calendar.completed ? 1 : -1;
      }
      return a.calendar.startUTC - b.calendar.startUTC;
    });
  const openCount = tasks.filter((item) => !item.calendar.completed).length;
  //completing a task slides it down to the done group instead of teleporting
  useFlip(listRef, tasks.map((item) => item.id).join("|"));

  return (
    <section className="todo-list" aria-labelledby="todo-heading">
      <div className="todo-list-head">
        <div>
          <h2 id="todo-heading">To-do list</h2>
          <p>{openCount === 0 ? "Nothing left open" : `${openCount} open`}</p>
        </div>
        <button type="button" className="primary-btn" onClick={onCreate}>
          <PlusIcon />
          Add task
        </button>
      </div>
      {tasks.length === 0 ? (
        <p className="todo-empty">Tasks you add here or on the calendar show up in this list.</p>
      ) : (
        <ul ref={listRef}>
          {tasks.map((item) => {
            const done = Boolean(item.calendar.completed);
            return (
              <li key={item.id} data-flip-id={item.id} className={done ? "is-done" : undefined}>
                <button
                  type="button"
                  className={`todo-check${done ? " is-checked" : ""}`}
                  role="checkbox"
                  aria-checked={done}
                  aria-label={done ? `Mark ${item.title} open` : `Complete ${item.title}`}
                  onClick={() => onComplete(item.id, !done)}
                >
                  <CheckIcon />
                </button>
                <button type="button" className="todo-main" onClick={() => onOpen(item)}>
                  <span>{item.title}</span>
                  <small>{whenLabel(item)}</small>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
