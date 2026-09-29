"use client";

import type { CalendarItemDoc } from "@/calendar/types";

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
  const tasks = items
    .filter((item) => item.calendar.kind === "task")
    .sort((a, b) => {
      if (Boolean(a.calendar.completed) !== Boolean(b.calendar.completed)) {
        return a.calendar.completed ? 1 : -1;
      }
      return a.calendar.startUTC - b.calendar.startUTC;
    });
  const openCount = tasks.filter((item) => !item.calendar.completed).length;

  return (
    <section className="todo-list" aria-labelledby="todo-heading">
      <div className="todo-list-head">
        <div>
          <h2 id="todo-heading">To-do list</h2>
          <p>{openCount === 0 ? "Nothing left open" : `${openCount} open`}</p>
        </div>
        <button type="button" className="primary-btn" onClick={onCreate}>
          Add task
        </button>
      </div>
      {tasks.length === 0 ? (
        <p className="todo-empty">Tasks you add here or on the calendar show up in this list.</p>
      ) : (
        <ul>
          {tasks.map((item) => {
            const done = Boolean(item.calendar.completed);
            return (
              <li key={item.id} className={done ? "is-done" : undefined}>
                <button
                  type="button"
                  className={`todo-check${done ? " is-checked" : ""}`}
                  role="checkbox"
                  aria-checked={done}
                  aria-label={done ? `Mark ${item.title} open` : `Complete ${item.title}`}
                  onClick={() => onComplete(item.id, !done)}
                >
                  {done ? "✓" : ""}
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
