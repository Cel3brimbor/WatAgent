"use client";

import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { KeywordTask } from "@/calendar/keyword-tasks";
import type { SmartTagHit } from "@/calendar/smart-tags";
import type { CalendarItemDoc } from "@/calendar/types";
import { addDays, startOfLocalDay } from "@/calendar/date-utils";
import { ChevronIcon } from "@/calendar/sidebar-icons";
import { Disclosure } from "@/shared/disclosure";
import { CheckIcon, PlusIcon } from "@/shared/icons";
import { afterPaint } from "@/shared/after-paint";
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
  /**color a calendar task when a task smart tag matches it*/
  tagForItem?: (item: CalendarItemDoc) => SmartTagHit | null;
  /**color a keyword row from the live tags, without waiting on the task list rebuild*/
  tagForKeyword?: (task: KeywordTask) => SmartTagHit | null;
  /**the keyword rules panel, shown below the list*/
  rules?: ReactNode;
};

//keyword tasks due longer ago than this stay out of the list until you ask for them, or a term's feed floods it
const RECENT_DAYS = 14;
const DAY_MS = 86_400_000;

type Row =
  | { kind: "own"; id: string; title: string; dueUTC: number; allDay: boolean; done: boolean; item: CalendarItemDoc }
  | { kind: "keyword"; id: string; title: string; dueUTC: number; allDay: boolean; done: boolean; task: KeywordTask };

type ScheduleGroup = "overdue" | "today" | "week" | "later";
type GroupId = ScheduleGroup | "done";
type FilterId = "all" | "today" | "upcoming" | "completed";

const GROUP_TITLES: Record<ScheduleGroup, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "Next 7 days",
  later: "Later",
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

function isPastDay(dueUTC: number, today: Date): boolean {
  return startOfLocalDay(new Date(dueUTC)).getTime() < today.getTime();
}

//only previous calendar days land in overdue; today's timed tasks stay under today even after their time
function scheduleGroup(row: { dueUTC: number; allDay: boolean }, _now: number, today: Date): ScheduleGroup {
  if (isPastDay(row.dueUTC, today)) return "overdue";
  if (row.dueUTC < addDays(today, 1).getTime()) return "today";
  if (row.dueUTC < addDays(today, 7).getTime()) return "week";
  return "later";
}

//finished work from a previous day leaves the list. today and anything ahead stay put, crossed out
export function groupOf(row: { dueUTC: number; allDay: boolean; done: boolean }, now: number, today: Date, holdPast = false): GroupId {
  //holdPast keeps a just-checked previous day on screen long enough to strike it through
  if (row.done && isPastDay(row.dueUTC, today) && !holdPast) return "done";
  return scheduleGroup(row, now, today);
}

function isDueLate(row: { dueUTC: number; allDay: boolean }, now: number, today: Date): boolean {
  if (row.allDay) return isPastDay(row.dueUTC, today);
  return row.dueUTC < now;
}

function sourceDone(id: string, items: CalendarItemDoc[], tasks: KeywordTask[]): boolean | undefined {
  if (id.startsWith("ktask:")) {
    return tasks.find((task) => task.key === id.slice("ktask:".length))?.done;
  }
  const item = items.find((entry) => entry.id === id);
  return item && item.calendar.kind === "task" ? Boolean(item.calendar.completed) : undefined;
}

export const TodoList = memo(function TodoList({ items, onOpen, onComplete, onCreate, keywordTasks = [], calendarName, onKeywordComplete, onKeywordOpen, tagForItem, tagForKeyword, rules }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const writeGen = useRef(new Map<string, number>());
  const sentGen = useRef(new Map<string, number>());
  const onCompleteRef = useRef(onComplete);
  const onKeywordCompleteRef = useRef(onKeywordComplete);
  const itemsRef = useRef(items);
  const tasksRef = useRef(keywordTasks);
  const itemsChanged = itemsRef.current !== items;
  const tasksChanged = tasksRef.current !== keywordTasks;
  itemsRef.current = items;
  tasksRef.current = keywordTasks;
  onCompleteRef.current = onComplete;
  onKeywordCompleteRef.current = onKeywordComplete;
  const [pending, setPending] = useState<Map<string, boolean>>(() => new Map());
  const [struck, setStruck] = useState<Set<string>>(() => new Set());
  const [showOlder, setShowOlder] = useState(false);
  const [overdueOpen, setOverdueOpen] = useState(true);
  const [filter, setFilter] = useState<FilterId>("all");
  const now = Date.now();
  const today = startOfLocalDay(new Date(now));
  const recentFrom = today.getTime() - RECENT_DAYS * DAY_MS;

  //once the write is out, the next snapshot for that list is the truth, including a rollback
  useEffect(() => {
    setPending((current) => {
      if (current.size === 0) return current;
      let next: Map<string, boolean> | null = null;
      for (const id of current.keys()) {
        const keyword = id.startsWith("ktask:");
        if (keyword ? !tasksChanged : !itemsChanged) continue;
        if (sentGen.current.get(id) !== writeGen.current.get(id)) continue;
        if (sourceDone(id, items, keywordTasks) === undefined) continue;
        sentGen.current.delete(id);
        next ??= new Map(current);
        next.delete(id);
      }
      return next ?? current;
    });
  }, [items, keywordTasks, itemsChanged, tasksChanged]);

  const olderCount = keywordTasks.filter((task) => !task.done && task.dueUTC < recentFrom).length;
  const rows: Row[] = [
    ...items
      .filter((item) => item.calendar.kind === "task")
      .map((item): Row => ({
        kind: "own",
        id: item.id,
        title: item.title,
        dueUTC: item.calendar.startUTC,
        allDay: item.calendar.allDay,
        done: pending.get(item.id) ?? Boolean(item.calendar.completed),
        item,
      })),
    ...keywordTasks
      .filter((task) => task.done || showOlder || task.dueUTC >= recentFrom)
      .map((task): Row => {
        const id = `ktask:${task.key}`;
        return { kind: "keyword", id, title: task.title, dueUTC: task.dueUTC, allDay: task.allDay, done: pending.get(id) ?? task.done, task };
      }),
  ].sort((a, b) => a.dueUTC - b.dueUTC);
  const groups = new Map<GroupId, Row[]>();
  for (const row of rows) {
    const id = groupOf(row, now, today, struck.has(row.id));
    groups.set(id, [...(groups.get(id) ?? []), row]);
  }
  const finished = rows.filter((row) => row.done);
  const hiddenOlder = showOlder ? 0 : olderCount;
  const openCount = rows.length - finished.length + hiddenOlder;
  const incomplete = (id: ScheduleGroup) => (groups.get(id) ?? []).reduce((count, row) => count + (row.done ? 0 : 1), 0);
  const filters = [
    { id: "all", label: "All", count: incomplete("overdue") + incomplete("today") + incomplete("week") + incomplete("later") + hiddenOlder },
    { id: "today", label: "Today", count: incomplete("overdue") + incomplete("today") + hiddenOlder },
    { id: "upcoming", label: "Upcoming", count: incomplete("week") + incomplete("later") },
    { id: "completed", label: "Completed", count: finished.length },
  ] as const;
  const showSchedule = filter !== "completed";
  const restGroups = (["today", "week", "later"] as const).filter((id) =>
    showSchedule && (filter === "all" || (filter === "today" ? id === "today" : id === "week" || id === "later")));
  const overdue = showSchedule && (filter === "all" || filter === "today") ? (groups.get("overdue") ?? []) : [];
  const showOverdue = overdue.length > 0 || ((filter === "all" || filter === "today") && olderCount > 0);
  const overdueBadge = overdue.length + (showOlder ? 0 : (filter === "all" || filter === "today" ? olderCount : 0));
  const listedCount = filter === "completed"
    ? finished.length
    : overdue.length + restGroups.reduce((count, id) => count + (groups.get(id)?.length ?? 0), 0);
  const shown = filter === "completed"
    ? finished
    : [...(showOverdue ? overdue : []), ...restGroups.flatMap((id) => groups.get(id) ?? [])];
  //only a row that leaves or joins the list should glide. a strikethrough stays put
  useFlip(listRef, shown.map((row) => row.id).join("|"));

  function toggleRow(row: Row) {
    const next = !row.done;
    const past = isPastDay(row.dueUTC, today);
    const gen = (writeGen.current.get(row.id) ?? 0) + 1;
    writeGen.current.set(row.id, gen);
    setPending((current) => {
      const map = new Map(current);
      map.set(row.id, next);
      return map;
    });
    if (next && past) {
      setStruck((current) => {
        const nextSet = new Set(current);
        nextSet.add(row.id);
        return nextSet;
      });
    }
    //paint the check first. the calendar rebuild follows, same as closing the editor before a new event lands
    afterPaint(() => {
      if (writeGen.current.get(row.id) !== gen) return;
      if (past) {
        setStruck((current) => {
          if (!current.has(row.id)) return current;
          const nextSet = new Set(current);
          nextSet.delete(row.id);
          return nextSet;
        });
      }
      sentGen.current.set(row.id, gen);
      if (row.kind === "own") onCompleteRef.current(row.id, next);
      else onKeywordCompleteRef.current?.(row.task.key, next);
    });
  }

  function renderRow(row: Row) {
    const draft = row.kind === "own" && row.item.editorDraft;
    const tag = row.kind === "keyword" ? (tagForKeyword ? tagForKeyword(row.task) : row.task.tag) : tagForItem?.(row.item);
    const cover = tag?.cover === "half" || tag?.cover === "quarter" ? tag.cover : "full";
    const className = [row.done ? "is-done" : "", draft ? "is-editor-draft" : "", tag ? `is-tagged is-tag-${cover}` : ""].filter(Boolean).join(" ");
    const late = isDueLate(row, now, today);
    return (
      <li
        key={row.id}
        data-flip-id={row.id}
        className={className || undefined}
        style={tag ? { "--tag-color": tag.color } as CSSProperties : undefined}
      >
        <button
          type="button"
          className={`todo-check${row.done ? " is-checked" : ""}`}
          role="checkbox"
          aria-checked={row.done}
          aria-label={row.done ? `Mark ${row.title} open` : `Complete ${row.title}`}
          onClick={() => toggleRow(row)}
        >
          <span className="todo-check-circle"><CheckIcon /></span>
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
          <span className="todo-title">{row.title}</span>
          <small>
            <time className={late ? "is-overdue" : undefined} dateTime={new Date(row.dueUTC).toISOString()}>{whenLabel(row.dueUTC, row.allDay, today)}</time>
            {row.kind === "keyword" && calendarName ? (
              <span className="todo-origin">{calendarName(row.task.source.mergedCalendarId ?? row.task.calendarId)}</span>
            ) : null}
            {tag ? <span className="todo-origin">{tag.name}</span> : null}
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
          <p className="todo-date">{today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
          <p>{openCount === 0 ? "You’re all caught up" : `${openCount} task${openCount === 1 ? "" : "s"} to do`}</p>
        </div>
        <button type="button" className="primary-btn" onClick={onCreate}>
          <PlusIcon />
          Add task
        </button>
      </div>
      <div className="todo-filters" role="group" aria-label="Filter tasks">
        {filters.map((entry) => (
          <button key={entry.id} type="button" aria-pressed={filter === entry.id} onClick={() => setFilter(entry.id)}>
            {entry.label}<span>{entry.count}</span>
          </button>
        ))}
      </div>
      {listedCount === 0 && !showOverdue ? (
        <div className="todo-empty" role="status">
          <CheckIcon />
          <h3>{filter === "completed" ? "No completed tasks yet" : filter === "today" ? "All clear for today" : filter === "upcoming" ? "A little room ahead" : "You’re all caught up"}</h3>
          <p>{filter === "completed" ? "Tasks you finish will appear here. Uncheck one to reopen it." : filter === "upcoming" ? "Future tasks will appear here." : "Add a task when something comes to mind."}</p>
        </div>
      ) : null}
      {listedCount > 0 || showOverdue ? (
        <div ref={listRef} className="todo-groups">
          {showOverdue ? (
            <section className="todo-group is-overdue" aria-labelledby="todo-group-overdue">
              <button
                type="button"
                id="todo-group-overdue"
                className="todo-group-title todo-group-toggle"
                aria-expanded={overdueOpen}
                aria-controls="todo-overdue-panel"
                onClick={() => setOverdueOpen((open) => !open)}
              >
                {GROUP_TITLES.overdue}
                <span className="todo-group-count">{overdueBadge}</span>
                <ChevronIcon open={overdueOpen} />
              </button>
              <Disclosure id="todo-overdue-panel" open={overdueOpen}>
                {overdue.length > 0 ? <ul>{overdue.map(renderRow)}</ul> : null}
                {olderCount > 0 ? (
                  <button type="button" className="smart-tag-link todo-older" onClick={() => setShowOlder((current) => !current)}>
                    {showOlder ? "Hide older calendar tasks" : `Show ${olderCount} older calendar task${olderCount === 1 ? "" : "s"}`}
                  </button>
                ) : null}
              </Disclosure>
            </section>
          ) : null}
          {restGroups.map((id) => {
            const list = groups.get(id);
            if (!list?.length) return null;
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
          {filter === "completed" && finished.length > 0 ? (
            <section className="todo-group is-done-group" aria-labelledby="todo-completed-heading">
              <h3 id="todo-completed-heading" className="todo-group-title">Completed<span className="todo-group-count">{finished.length}</span></h3>
              <ul>{finished.map(renderRow)}</ul>
            </section>
          ) : null}
        </div>
      ) : null}
      {rules ? <div className="todo-automation">{rules}</div> : null}
    </section>
  );
});
