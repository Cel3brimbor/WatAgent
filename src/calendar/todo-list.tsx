"use client";

import { useRef, useState, type ReactNode } from "react";
import type { KeywordTask } from "@/calendar/keyword-tasks";
import type { CalendarItemDoc } from "@/calendar/types";
import { addDays, startOfLocalDay } from "@/calendar/date-utils";
import { ChevronIcon } from "@/calendar/sidebar-icons";
import { Disclosure } from "@/shared/disclosure";
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
const DAY_MS = 86_400_000;

type Row =
  | { kind: "own"; id: string; title: string; dueUTC: number; allDay: boolean; done: boolean; item: CalendarItemDoc }
  | { kind: "keyword"; id: string; title: string; dueUTC: number; allDay: boolean; done: boolean; task: KeywordTask };

type GroupId = "overdue" | "today" | "week" | "later" | "done";

const GROUP_TITLES: Record<GroupId, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "Next 7 days",
  later: "Later",
  done: "Done",
};

//nearby days read as words, the rest of the week as a weekday, everything else as a date
function whenLabel(dueUTC: number, allDay: boolean, today: Date): string {
  const due = new Date(dueUTC);
  const days = Math.round((startOfLocalDay(due).getTime() - today.getTime()) / DAY_MS);
  const day =
    days === 0 ? "Today"
      : days === 1 ? "Tomorrow"
        : days === -1 ? "Yesterday"
          : days > 1 && days < 7 ? due.toLocaleDateString(undefined, { weekday: "long" })
            : due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (allDay) return day;
  return `${day}, ${due.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function groupOf(row: Row, now: number, today: Date): GroupId {
  if (row.done) return "done";
  //an all-day task stays on time through its whole day
  if (row.dueUTC < (row.allDay ? today.getTime() : now)) return "overdue";
  if (row.dueUTC < addDays(today, 1).getTime()) return "today";
  if (row.dueUTC < addDays(today, 7).getTime()) return "week";
  return "later";
}

export function TodoList({ items, onOpen, onComplete, onCreate, keywordTasks = [], calendarName, onKeywordComplete, onKeywordOpen, rules }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [showOlder, setShowOlder] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const now = Date.now();
  const today = startOfLocalDay(new Date(now));
  const recentFrom = today.getTime() - RECENT_DAYS * DAY_MS;
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
  ].sort((a, b) => a.dueUTC - b.dueUTC);
  const groups = new Map<GroupId, Row[]>();
  for (const row of rows) {
    const id = groupOf(row, now, today);
    groups.set(id, [...(groups.get(id) ?? []), row]);
  }
  const done = groups.get("done") ?? [];
  const openCount = rows.length - done.length;
  //completing a task slides the rest up instead of teleporting
  useFlip(listRef, rows.map((row) => `${row.id}:${row.done}`).join("|"));

  function renderRow(row: Row) {
    const draft = row.kind === "own" && row.item.editorDraft;
    const className = [row.done ? "is-done" : "", draft ? "is-editor-draft" : ""].filter(Boolean).join(" ");
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
          title={row.kind === "keyword" ? `Matched “${row.task.keyword}”. Opens the event on the calendar.` : undefined}
          onClick={() => {
            if (row.kind === "own") onOpen(row.item);
            else onKeywordOpen?.(row.task);
          }}
        >
          <span>{row.title}</span>
          <small>
            {whenLabel(row.dueUTC, row.allDay, today)}
            {row.kind === "keyword" && calendarName ? (
              <span className="todo-origin">{calendarName(row.task.source.mergedCalendarId ?? row.task.calendarId)}</span>
            ) : null}
          </small>
        </button>
      </li>
    );
  }

  return (
    <section className="todo-list" aria-labelledby="todo-heading">
      <div className="todo-list-head">
        <div>
          <h2 id="todo-heading">Tasks</h2>
          <p>{openCount === 0 ? "Nothing left open" : `${openCount} open`}</p>
        </div>
        <button type="button" className="primary-btn" onClick={onCreate}>
          <PlusIcon />
          Add task
        </button>
      </div>
      {rules}
      {rows.length === 0 ? (
        <p className="todo-empty">Tasks you add, and events your rules find, show up here.</p>
      ) : (
        <div ref={listRef} className="todo-groups">
          {(["overdue", "today", "week", "later"] as const).map((id) => {
            const list = groups.get(id);
            if (!list) return null;
            return (
              <section key={id} className={`todo-group is-${id}`} aria-labelledby={`todo-group-${id}`}>
                <h3 id={`todo-group-${id}`} className="todo-group-title">
                  {GROUP_TITLES[id]}
                  <span className="todo-group-count">{list.length}</span>
                </h3>
                <ul>{list.map(renderRow)}</ul>
              </section>
            );
          })}
          {done.length > 0 ? (
            <section className="todo-group is-done-group">
              <button type="button" className="todo-group-title todo-group-toggle" aria-expanded={doneOpen} onClick={() => setDoneOpen((open) => !open)}>
                {GROUP_TITLES.done}
                <span className="todo-group-count">{done.length}</span>
                <ChevronIcon open={doneOpen} />
              </button>
              <Disclosure open={doneOpen}>
                <ul>{done.map(renderRow)}</ul>
              </Disclosure>
            </section>
          ) : null}
        </div>
      )}
      {olderCount > 0 ? (
        <button type="button" className="smart-tag-link todo-older" onClick={() => setShowOlder((current) => !current)}>
          {showOlder ? "Hide older calendar tasks" : `Show ${olderCount} older calendar task${olderCount === 1 ? "" : "s"}`}
        </button>
      ) : null}
    </section>
  );
}
