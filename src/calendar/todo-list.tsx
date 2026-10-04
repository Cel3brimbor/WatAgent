"use client";

import { useRef, useState, type ReactNode } from "react";
import type { KeywordTask } from "@/calendar/keyword-tasks";
import type { CalendarItemDoc } from "@/calendar/types";
import { startOfLocalDay } from "@/calendar/date-utils";
import { CheckIcon, PlusIcon } from "@/shared/icons";
import { useFlip } from "@/shared/use-flip";

type Props = {
  items: CalendarItemDoc[];
  onOpen: (item: CalendarItemDoc) => void;
  onComplete: (id: string, completed: boolean) => void;
  onCreate: () => void;
  keywordTasks?: KeywordTask[];
  calendarName?: (id: string) => string;
  onKeywordComplete?: (key: string, done: boolean) => void;
  onKeywordOpen?: (task: KeywordTask) => void;
  /** The keyword rules panel, shown above the list. */
  rules?: ReactNode;
};

//keyword tasks due longer ago than this stay out of the list until you ask for them, or a term's feed floods it
const RECENT_DAYS = 14;

type Row =
  | { kind: "own"; id: string; title: string; dueUTC: number; allDay: boolean; done: boolean; item: CalendarItemDoc }
  | { kind: "keyword"; id: string; title: string; dueUTC: number; allDay: boolean; done: boolean; task: KeywordTask };

function whenLabel(dueUTC: number, allDay: boolean): string {
  const start = new Date(dueUTC);
  const date = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (allDay) return date;
  const time = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date}, ${time}`;
}

export function TodoList({ items, onOpen, onComplete, onCreate, keywordTasks = [], calendarName, onKeywordComplete, onKeywordOpen, rules }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const [showOlder, setShowOlder] = useState(false);
  const recentFrom = startOfLocalDay(new Date()).getTime() - RECENT_DAYS * 24 * 60 * 60 * 1000;
  const olderCount = keywordTasks.filter((task) => task.dueUTC < recentFrom).length;
  const rows: Row[] = [
    ...items
      .filter((item) => item.calendar.kind === "task")
      .map((item): Row => ({
        kind: "own",
        id: item.id,
        title: item.title,
        dueUTC: item.calendar.startUTC,
        allDay: item.calendar.allDay,
        done: Boolean(item.calendar.completed),
        item,
      })),
    ...keywordTasks
      .filter((task) => showOlder || task.dueUTC >= recentFrom)
      .map((task): Row => ({ kind: "keyword", id: `ktask:${task.key}`, title: task.title, dueUTC: task.dueUTC, allDay: task.allDay, done: task.done, task })),
  ].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.dueUTC - b.dueUTC;
  });
  const openCount = rows.filter((row) => !row.done).length;
  const now = Date.now();
  //completing a task slides it down to the done group instead of teleporting
  useFlip(listRef, rows.map((row) => row.id).join("|"));

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
      {rules}
      {rows.length === 0 ? (
        <p className="todo-empty">Tasks you add here or on the calendar, and events your keyword rules find, show up in this list.</p>
      ) : (
        <ul ref={listRef}>
          {rows.map((row) => {
            const overdue = !row.done && row.dueUTC < (row.allDay ? startOfLocalDay(new Date(now)).getTime() : now);
            const draft = row.kind === "own" && row.item.editorDraft;
            const className = [row.done ? "is-done" : "", draft ? "is-editor-draft" : "", row.kind === "keyword" ? "is-keyword" : ""].filter(Boolean).join(" ");
            return (
              <li key={row.id} data-flip-id={row.id} className={className || undefined}>
                <button
                  type="button"
                  className={`todo-check${row.done ? " is-checked" : ""}`}
                  role="checkbox"
                  aria-checked={row.done}
                  aria-label={row.done ? `Mark ${row.title} open` : `Complete ${row.title}`}
                  onClick={() => {
                    if (row.kind === "own") onComplete(row.id, !row.done);
                    else onKeywordComplete?.(row.task.key, !row.done);
                  }}
                >
                  <CheckIcon />
                </button>
                <button
                  type="button"
                  className="todo-main"
                  title={row.kind === "keyword" ? "Show this event on the calendar" : undefined}
                  onClick={() => {
                    if (row.kind === "own") onOpen(row.item);
                    else onKeywordOpen?.(row.task);
                  }}
                >
                  <span>{row.title}</span>
                  <small>
                    <span className={overdue ? "todo-overdue" : undefined}>
                      {row.kind === "keyword" ? "Due " : ""}
                      {whenLabel(row.dueUTC, row.allDay)}
                      {overdue ? " · overdue" : ""}
                    </span>
                    {row.kind === "keyword" ? (
                      <span className="todo-origin">
                        {calendarName ? calendarName(row.task.source.mergedCalendarId ?? row.task.calendarId) : null}
                        <em className="todo-keyword">{row.task.keyword}</em>
                      </span>
                    ) : null}
                  </small>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {olderCount > 0 ? (
        <button type="button" className="smart-tag-link todo-older" onClick={() => setShowOlder((current) => !current)}>
          {showOlder ? "Hide older calendar tasks" : `Show ${olderCount} older calendar task${olderCount === 1 ? "" : "s"}`}
        </button>
      ) : null}
    </section>
  );
}
