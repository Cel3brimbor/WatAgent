"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { CalendarItemMeta, CalendarView, TimelineItem } from "@/calendar/types";
import { useCalendar } from "@/calendar/store";
import {
  addDays,
  formatFocusLabel,
  formatTime,
  localDayBounds,
  localeWeekStartsOn,
  shiftFocus,
  startOfLocalDay,
  startOfWeek,
} from "@/calendar/date-utils";
import { aggregateTimeline, rangesOverlap, type BusyBlock, type OverlayEvent } from "@/calendar/timeline";
import {
  ALL_SOURCES,
  readCalendarColors,
  readCalendarView,
  readSourceFilter,
  writeCalendarColors,
  writeCalendarView,
  writeSourceFilter,
  type CalendarColors,
  type CalendarSourceFilter,
} from "@/calendar/preferences";
import { CalendarFilters } from "@/calendar/calendar-filters";
import { deleteGoogleEvent, updateGoogleEvent } from "@/calendar/google-calendar-client";
import { ConfirmDialog } from "@/shared/confirm-dialog";
import { CalendarDayView } from "@/calendar/views/day-view";
import { CalendarWeekView } from "@/calendar/views/week-view";
import { CalendarMonthView } from "@/calendar/views/month-view";
import { CalendarYearView } from "@/calendar/views/year-view";
import {
  CalendarItemEditor,
  defaultAllDayDraft,
  defaultTimedDraft,
  draftFromGoogle,
  draftFromMeta,
  type CalendarDraft,
  type GoogleDraftTarget,
} from "@/calendar/calendar-item-editor";
import { GoogleEventCard } from "@/calendar/google-event-card";
import { AiApprovalPanel } from "@/calendar/ai-approval-panel";
import { SettingsPanel } from "@/calendar/settings-panel";
import { SideNav, type AppSection } from "@/calendar/side-nav";
import { TodoList } from "@/calendar/todo-list";
import { CalendarChatPanel } from "@/agent/calendar-chat-panel";
import { readAgentStream } from "@/agent/stream";
import type { ChatMessage, LiveActivity, ToolEventRecord } from "@/agent/types";
import { apiFetch } from "@/shared/api-base";
import { uid } from "@/shared/ids";
import type { AuthUser } from "@/auth/types";

type Range = { rangeStartUTC: number; rangeEndUTC: number };

type SendPayload = {
  text: string;
  branch?: { kind: "edit"; messageId: string } | { kind: "regenerate"; messageId: string };
};

const GOOGLE_POLL_MS = 5 * 60 * 1000;

type FreshRange = { start: number; end: number; at: number };

function rangeIsFresh(covered: FreshRange[], range: Range, now: number): boolean {
  return covered.some(
    (entry) =>
      entry.start <= range.rangeStartUTC &&
      entry.end >= range.rangeEndUTC &&
      now - entry.at < GOOGLE_POLL_MS,
  );
}

function mergeTimed<T extends { startUTC: number; endUTC: number }>(
  previous: T[],
  incoming: T[],
  range: Range,
  idOf: (item: T) => string,
): T[] {
  const incomingIds = new Set(incoming.map(idOf));
  const merged = previous.filter(
    (item) =>
      !incomingIds.has(idOf(item)) &&
      !rangesOverlap(item.startUTC, item.endUTC, range.rangeStartUTC, range.rangeEndUTC),
  );
  const seen = new Set(merged.map(idOf));
  for (const item of incoming) {
    const id = idOf(item);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(item);
  }
  return merged;
}

function googleFetchRange(focus: Date, view: CalendarView, weekStartsOn: 0 | 1): Range {
  if (view === "month") {
    const start = startOfLocalDay(new Date(focus.getFullYear(), focus.getMonth() - 1, 1));
    const end = startOfLocalDay(new Date(focus.getFullYear(), focus.getMonth() + 2, 1));
    return { rangeStartUTC: start.getTime(), rangeEndUTC: end.getTime() };
  }
  return googleRange(focus, view, weekStartsOn);
}

function googleRange(focus: Date, view: CalendarView, weekStartsOn: 0 | 1): Range {
  if (view === "day") {
    const bounds = localDayBounds(focus);
    return { rangeStartUTC: bounds.startDateUTC, rangeEndUTC: bounds.endDateUTC };
  }
  if (view === "week") {
    const start = startOfWeek(focus, weekStartsOn);
    return { rangeStartUTC: start.getTime(), rangeEndUTC: addDays(start, 7).getTime() };
  }
  if (view === "month") {
    const start = startOfLocalDay(new Date(focus.getFullYear(), focus.getMonth(), 1));
    const end = startOfLocalDay(new Date(focus.getFullYear(), focus.getMonth() + 1, 1));
    return { rangeStartUTC: start.getTime(), rangeEndUTC: end.getTime() };
  }
  const start = startOfLocalDay(new Date(focus.getFullYear(), focus.getMonth(), 1));
  const end = startOfLocalDay(new Date(focus.getFullYear(), focus.getMonth() + 3, 1));
  return { rangeStartUTC: start.getTime(), rangeEndUTC: end.getTime() };
}

function timeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function CalendarApp({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const calendar = useCalendar();
  const { syncFromGoogle, createChat, pruneEmptyChats, setAfterWrite } = calendar;
  const [view, setView] = useState<CalendarView>(() => readCalendarView());
  const [section, setSection] = useState<AppSection>("calendar");
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [focus, setFocus] = useState(() => startOfLocalDay(new Date()));
  const [busyBlocks, setBusyBlocks] = useState<BusyBlock[]>([]);
  const [overlayEvents, setOverlayEvents] = useState<OverlayEvent[]>([]);
  const [googleVersion, setGoogleVersion] = useState(0);
  const [googleSyncedAt, setGoogleSyncedAt] = useState<number | null>(null);
  const weekStartsOn = useMemo(() => localeWeekStartsOn(), []);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatResizing, setChatResizing] = useState(false);
  const [draft, setDraft] = useState<CalendarDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [streamingAssistantId, setStreamingAssistantId] = useState<string | null>(null);
  const [liveActivity, setLiveActivity] = useState<LiveActivity | null>(null);
  const [googlePeek, setGooglePeek] = useState<{ item: TimelineItem; anchor: DOMRect } | null>(null);
  const [googleDelete, setGoogleDelete] = useState<(GoogleDraftTarget & { title: string }) | null>(null);
  const [sources, setSources] = useState<CalendarSourceFilter>(() => readSourceFilter());
  const [colors, setColors] = useState<CalendarColors>(() => readCalendarColors());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    writeCalendarColors(colors);
  }, [colors]);

  const colorVars = useMemo(
    () =>
      ({
        "--event-color": colors.event,
        "--task-color": colors.task,
        "--gcal-color": colors.google,
      }) as CSSProperties,
    [colors],
  );

  const shownOverlayEvents = useMemo(
    () =>
      colors.useGoogleColors
        ? overlayEvents
        : overlayEvents.map((event) => ({ ...event, calendarColor: undefined })),
    [overlayEvents, colors.useGoogleColors],
  );

  useEffect(() => {
    writeCalendarView(view);
  }, [view]);

  useEffect(() => {
    writeSourceFilter(sources);
  }, [sources]);

  useEffect(() => {
    try {
      setNavCollapsed(window.localStorage.getItem("watagent.nav.collapsed") === "1");
    } catch {
      return;
    }
  }, []);

  function toggleNav() {
    setNavCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("watagent.nav.collapsed", next ? "1" : "0");
      } catch {
        return next;
      }
      return next;
    });
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const google = params.get("google");
    if (!google) return;
    setNotice(google === "connected" ? "Google Calendar connected." : "Google Calendar could not be connected.");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const timelineFor = useCallback(
    (date: Date, filter: CalendarSourceFilter) =>
      aggregateTimeline({
        focus: date,
        events: filter.app ? calendar.displayItems : [],
        busyBlocks: !filter.google || shownOverlayEvents.length > 0 ? [] : busyBlocks,
        overlayEvents: filter.google ? shownOverlayEvents : [],
      }),
    [calendar.displayItems, busyBlocks, shownOverlayEvents],
  );

  const itemsForDay = useCallback((date: Date) => timelineFor(date, sources), [timelineFor, sources]);

  const dayItems = useMemo(() => itemsForDay(focus), [itemsForDay, focus]);

  const timelineDigest = useMemo(
    () =>
      timelineFor(focus, ALL_SOURCES)
        .slice(0, 80)
        .map((item) => {
          const when = item.allDay ? "all-day" : `${formatTime(item.startUTC)}–${formatTime(item.endUTC)}`;
          if (item.kind === "gcal_event" || item.kind === "gcal_busy") {
            const where = item.google?.location ? ` @ ${item.google.location}` : "";
            const calendarName = item.google?.calendarName ? ` [${item.google.calendarName}]` : "";
            return `- ${item.kind} "${item.title}" ${when}${where}${calendarName} (read-only Google calendar)`;
          }
          const done = item.kind === "task" ? ` completed=${item.completed ? "true" : "false"}` : "";
          return `- ${item.kind} id=${item.id} "${item.title}" ${when}${done}`;
        })
        .join("\n")
        .slice(0, 12_000),
    [timelineFor, focus],
  );

  const googlePullRef = useRef<() => Promise<number | null>>(async () => null);
  const coveredRef = useRef<FreshRange[]>([]);
  const pullGenRef = useRef(new Map<string, number>());
  const seenGoogleVersionRef = useRef(googleVersion);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (seenGoogleVersionRef.current !== googleVersion) {
      seenGoogleVersionRef.current = googleVersion;
      coveredRef.current = [];
    }
    const range = googleFetchRange(focus, view, weekStartsOn);
    const key = `${range.rangeStartUTC}:${range.rangeEndUTC}`;
    async function pull(): Promise<number | null> {
      const gen = (pullGenRef.current.get(key) ?? 0) + 1;
      pullGenRef.current.set(key, gen);
      const pulled = await syncFromGoogle(range);
      if (!mountedRef.current || pullGenRef.current.get(key) !== gen) return null;
      setBusyBlocks((prev) =>
        mergeTimed(prev, pulled.busyBlocks, range, (block) => `${block.startUTC}:${block.endUTC}`),
      );
      setOverlayEvents((prev) => mergeTimed(prev, pulled.overlayEvents, range, (event) => event.id));
      const now = Date.now();
      coveredRef.current = [
        ...coveredRef.current.filter((entry) => now - entry.at < GOOGLE_POLL_MS),
        { start: range.rangeStartUTC, end: range.rangeEndUTC, at: now },
      ];
      setGoogleSyncedAt(pulled.lastSyncedAt);
      return pulled.lastSyncedAt;
    }
    googlePullRef.current = pull;
    if (!rangeIsFresh(coveredRef.current, range, Date.now())) {
      void pull().catch(() => undefined);
    }
    const timer = window.setInterval(() => {
      void pull().catch(() => undefined);
    }, GOOGLE_POLL_MS);
    const onFocus = () => {
      void pull().catch(() => undefined);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [focus, view, weekStartsOn, syncFromGoogle, googleVersion]);

  useEffect(() => {
    let timer = 0;
    setAfterWrite(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void googlePullRef.current().catch(() => undefined);
      }, 300);
    });
    return () => {
      window.clearTimeout(timer);
      setAfterWrite(null);
    };
  }, [setAfterWrite]);

  useEffect(() => {
    if (chatOpen && calendar.chats.length === 0) createChat();
  }, [chatOpen, calendar.chats.length, createChat]);

  useEffect(() => {
    if (!chatOpen) pruneEmptyChats();
  }, [chatOpen, pruneEmptyChats]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "t") setFocus(startOfLocalDay(new Date()));
      if (key === "d") setView("day");
      if (key === "w") setView("week");
      if (key === "m") setView("month");
      if (key === "y") setView("year");
      if (event.key === "ArrowLeft") setFocus((current) => shiftFocus(current, view, -1));
      if (event.key === "ArrowRight") setFocus((current) => shiftFocus(current, view, 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function currentMessages(): ChatMessage[] {
    return calendar.activeChatRef()?.messages ?? [];
  }

  function onOpenItem(item: TimelineItem, anchor?: DOMRect) {
    if (item.kind === "gcal_event") {
      setGooglePeek({
        item,
        anchor: anchor ?? new DOMRect(window.innerWidth / 2 - 180, 96, 0, 0),
      });
      return;
    }
    if (item.kind === "gcal_busy") return;
    if (item.pendingApproval) {
      setNotice("Approve or reject this Agent change in the review panel below.");
      return;
    }
    const existing = calendar.items.find((row) => row.id === item.id);
    if (existing) setDraft(draftFromMeta(existing.id, existing.title, existing.calendar));
  }

  function patchOverlay(
    target: { calendarId: string; eventId: string },
    patch: (event: OverlayEvent) => OverlayEvent | null,
  ) {
    setOverlayEvents((prev) =>
      prev.flatMap((event) => {
        if (event.calendarId !== target.calendarId || event.eventId !== target.eventId) return [event];
        const next = patch(event);
        return next ? [next] : [];
      }),
    );
  }

  async function saveGoogleDraft(pending: CalendarDraft, target: GoogleDraftTarget) {
    const title = pending.title.trim() || "Event";
    const timing = { startUTC: pending.startUTC, endUTC: pending.endUTC, allDay: pending.allDay };
    patchOverlay(target, (event) => ({ ...event, title, ...timing }));
    try {
      await updateGoogleEvent({ calendarId: target.calendarId, eventId: target.eventId, title, ...timing });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "The Google event could not be updated.");
    } finally {
      setGoogleVersion((value) => value + 1);
    }
  }

  async function confirmGoogleDelete() {
    const target = googleDelete;
    if (!target) return;
    setGoogleDelete(null);
    setDraft(null);
    patchOverlay(target, () => null);
    try {
      await deleteGoogleEvent({ calendarId: target.calendarId, eventId: target.eventId });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "The Google event could not be deleted.");
    } finally {
      setGoogleVersion((value) => value + 1);
    }
  }

  function googleTargetOf(item: TimelineItem): GoogleDraftTarget | null {
    const google = item.google;
    if (!google?.calendarId || !google.eventId) return null;
    return {
      calendarId: google.calendarId,
      eventId: google.eventId,
      calendarName: google.calendarName,
      deletable: Boolean(google.deletable),
    };
  }

  function saveDraft() {
    if (!draft) return;
    if (!draft.allDay && draft.endUTC <= draft.startUTC) {
      setNotice("End time must be after the start time.");
      return;
    }
    if (draft.google) {
      const pending = draft;
      setDraft(null);
      void saveGoogleDraft(pending, draft.google);
      return;
    }
    const calendarMeta: CalendarItemMeta = {
      kind: draft.kind,
      startUTC: draft.startUTC,
      endUTC: draft.endUTC,
      allDay: draft.allDay,
      completed: draft.kind === "task" ? Boolean(draft.completed) : undefined,
    };
    const pending = draft;
    setDraft(null);
    calendar.upsert({
      id: pending.id,
      title: pending.title.trim() || (pending.kind === "task" ? "Task" : "Event"),
      calendar: calendarMeta,
    });
  }

  async function handleSend(payload: SendPayload) {
    if (busy) return;
    const existing = currentMessages();
    let text = payload.text.trim();
    let history = existing;
    let reuseUser = false;
    if (payload.branch?.kind === "edit") {
      const index = existing.findIndex((message) => message.id === payload.branch?.messageId);
      const target = existing[index];
      if (!target || target.role !== "user" || !text) return;
      history = existing.slice(0, index);
    } else if (payload.branch?.kind === "regenerate") {
      const index = existing.findIndex((message) => message.id === payload.branch?.messageId);
      const target = existing[index];
      if (!target || target.role !== "assistant") return;
      const prior = existing.slice(0, index);
      text = [...prior].reverse().find((message) => message.role === "user")?.content.trim() ?? "";
      if (!text) return;
      history = prior;
      reuseUser = true;
    } else if (!text) {
      return;
    }

    const userMessage: ChatMessage = { id: uid("msg"), role: "user", content: text.slice(0, 20_000), createdAt: Date.now() };
    const assistantId = uid("msg");
    const visible = reuseUser ? history : [...history, userMessage];
    calendar.setChatMessages([
      ...visible,
      { id: assistantId, role: "assistant", content: "", createdAt: Date.now() },
    ]);
    setStreamingAssistantId(assistantId);
    setLiveActivity({ assistantId, status: "Preparing" });
    setBusy(true);
    setError(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const bounds = localDayBounds(focus);

    let assistantText = "";
    const toolEvents: ToolEventRecord[] = [];
    const writeAssistant = () => {
      calendar.setChatMessages(
        currentMessages().map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: assistantText,
                toolEvents: toolEvents.length > 0 ? toolEvents.map((event) => ({ ...event })) : undefined,
              }
            : message,
        ),
      );
    };

    try {
      const res = await apiFetch("/api/calendar/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          startDateUTC: bounds.startDateUTC,
          endDateUTC: bounds.endDateUTC,
          timeZone: timeZone(),
          timelineDigest,
          messages: visible
            .filter((message) => message.content.trim())
            .slice(-80)
            .map((message) => ({ role: message.role, content: message.content })),
        }),
      });
      if (!res.ok) {
        const errPayload = (await res.json().catch(() => null)) as { error?: unknown } | null;
        throw new Error(
          typeof errPayload?.error === "string" ? errPayload.error : "An unexpected error occurred",
        );
      }
      let rafId = 0;
      const schedule = () => {
        if (!rafId) {
          rafId = requestAnimationFrame(() => {
            rafId = 0;
            writeAssistant();
          });
        }
      };
      await readAgentStream(
        res,
        (event) => {
          if (event.type === "content") {
            assistantText += event.content;
            setLiveActivity((current) =>
              current?.assistantId === assistantId ? { ...current, status: "Writing a response" } : current,
            );
            schedule();
            return;
          }
          if (event.type === "status") {
            setLiveActivity((current) =>
              current?.assistantId === assistantId ? { ...current, status: event.label } : current,
            );
            return;
          }
          if (event.state === "calling") {
            toolEvents.push({ id: uid("tool"), tool: event.name, state: "calling" });
          } else {
            const pending = [...toolEvents]
              .reverse()
              .find((entry) => entry.tool === event.name && entry.state === "calling");
            if (pending) {
              pending.state = event.state;
              pending.resultSummary = event.resultSummary;
            }
            if (event.state === "succeeded" && event.calendarChange) {
              calendar.applyRemoteCalendarChange(event.calendarChange);
            }
          }
          schedule();
        },
        controller.signal,
      );
      if (rafId) cancelAnimationFrame(rafId);
      if (!controller.signal.aborted) writeAssistant();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setBusy(false);
      setStreamingAssistantId(null);
      setLiveActivity(null);
      calendar.persistActiveChat();
    }
  }

  if (!calendar.hydrated) {
    return (
      <main className="calendar-shell">
        <p className="calendar-empty">Loading calendar…</p>
      </main>
    );
  }

  return (
    <div
      className={`app-frame${navCollapsed ? " is-nav-collapsed" : ""}${chatResizing ? " is-resizing-chat" : ""}`}
      style={colorVars}
    >
      <SideNav section={section} collapsed={navCollapsed} onSection={setSection} onToggle={toggleNav} />
      <div className="calendar-shell">
      <header className="calendar-toolbar">
        <div className="calendar-toolbar-left">
          {section === "calendar" ? (
            <>
              <button type="button" className="ghost-btn" onClick={() => setFocus(startOfLocalDay(new Date()))}>
                Today
              </button>
              <button
                type="button"
                className="ghost-btn"
                aria-label="Previous"
                onClick={() => setFocus((current) => shiftFocus(current, view, -1))}
              >
                ‹
              </button>
              <button
                type="button"
                className="ghost-btn"
                aria-label="Next"
                onClick={() => setFocus((current) => shiftFocus(current, view, 1))}
              >
                ›
              </button>
              <h2>{formatFocusLabel(focus, view, weekStartsOn)}</h2>
            </>
          ) : (
            <h2>{section === "tasks" ? "To-do list" : "Settings"}</h2>
          )}
        </div>
        <div className="calendar-toolbar-right">
          {section === "calendar" ? <CalendarFilters value={sources} onChange={setSources} /> : null}
          {section === "calendar" ? (
          <select
            className="calendar-view-select"
            value={view}
            onChange={(event) => setView(event.target.value as CalendarView)}
            aria-label="Calendar view"
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="year">Year</option>
          </select>
          ) : null}
          {section === "tasks" ? (
            <button
              type="button"
              className="primary-btn"
              onClick={() => setDraft({ ...defaultAllDayDraft(startOfLocalDay(new Date())), kind: "task" })}
            >
              Add task
            </button>
          ) : null}
          <button
            type="button"
            className={`ghost-btn calendar-agent-btn${chatOpen ? " is-active" : ""}`}
            aria-label="Agent"
            aria-pressed={chatOpen}
            onClick={() => setChatOpen((value) => !value)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3a7 7 0 0 0-4 12.7V19a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-3.3A7 7 0 0 0 12 3z" />
              <path d="M9.5 21h5" />
              <circle cx="10" cy="11" r="0.85" fill="currentColor" stroke="none" />
              <circle cx="14" cy="11" r="0.85" fill="currentColor" stroke="none" />
            </svg>
            Agent
          </button>
        </div>
      </header>

      {notice || calendar.loadError ? (
        <div className="calendar-notice" role="status">
          <span>{notice ?? calendar.loadError}</span>
          <button
            type="button"
            className="ghost-btn"
            aria-label="Dismiss"
            onClick={() => {
              setNotice(null);
              if (calendar.loadError) void calendar.refresh();
            }}
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="calendar-body">
        <div className="calendar-stage">
          {section === "tasks" ? (
            <TodoList
              items={calendar.displayItems}
              onOpen={(item) => {
                if (item.pendingApproval) {
                  setNotice("Approve or reject this Agent change in the review panel below.");
                  return;
                }
                setDraft(draftFromMeta(item.id, item.title, item.calendar));
              }}
              onComplete={calendar.completeTask}
              onCreate={() => setDraft({ ...defaultAllDayDraft(startOfLocalDay(new Date())), kind: "task" })}
            />
          ) : null}
          {section === "settings" ? (
            <SettingsPanel
              accountEmail={user.email}
              colors={colors}
              onColorsChange={setColors}
              requireAiApproval={calendar.requireAiApproval}
              onRequireAiApprovalChange={(value) =>
                void calendar.setRequireAiApproval(value).catch(() => setNotice("Unable to save Agent settings."))
              }
              syncedAt={googleSyncedAt}
              onChanged={() => setGoogleVersion((value) => value + 1)}
              onSyncNow={() => googlePullRef.current()}
              onNotice={setNotice}
              onSignOut={onSignOut}
            />
          ) : null}
          {section === "calendar" && view === "day" ? (
            <CalendarDayView
              focus={focus}
              items={dayItems}
              onOpen={onOpenItem}
              onCreateTimed={(hour, _minute, endHour) => setDraft(defaultTimedDraft(focus, hour, 0, endHour))}
              onCreateAllDay={() => setDraft(defaultAllDayDraft(focus))}
              onCompleteTask={calendar.completeTask}
            />
          ) : null}
          {section === "calendar" && view === "week" ? (
            <CalendarWeekView
              focus={focus}
              weekStartsOn={weekStartsOn}
              itemsForDay={itemsForDay}
              onOpen={onOpenItem}
              onCreateTimed={(date, hour, endHour) => setDraft(defaultTimedDraft(date, hour, 0, endHour))}
              onCreateAllDay={(date) => setDraft(defaultAllDayDraft(date))}
              onSelectDay={(date) => {
                setFocus(startOfLocalDay(date));
                setView("day");
              }}
              onCompleteTask={calendar.completeTask}
            />
          ) : null}
          {section === "calendar" && view === "month" ? (
            <CalendarMonthView
              focus={focus}
              weekStartsOn={weekStartsOn}
              itemsForDay={itemsForDay}
              onOpen={onOpenItem}
              onCreate={(date) => setDraft(defaultAllDayDraft(date))}
              onCompleteTask={calendar.completeTask}
            />
          ) : null}
          {section === "calendar" && view === "year" ? (
            <CalendarYearView
              focus={focus}
              weekStartsOn={weekStartsOn}
              itemsForDay={itemsForDay}
              onSelectDay={(date) => {
                setFocus(startOfLocalDay(date));
                setView("day");
              }}
            />
          ) : null}
        </div>

        <CalendarChatPanel
          open={chatOpen}
          chats={calendar.chats}
          activeChat={calendar.activeChat}
          messages={calendar.activeChat?.messages ?? []}
          busy={busy}
          error={error}
          streamingAssistantId={streamingAssistantId}
          liveActivity={liveActivity}
          onSend={(payload) => void handleSend(payload)}
          onStop={() => abortRef.current?.abort()}
          onError={setError}
          onNewChat={calendar.createChat}
          onDeleteChat={calendar.deleteChat}
          onRenameChat={calendar.renameChat}
          onCloseChat={calendar.closeChat}
          onReopenChat={calendar.reopenChat}
          onSelectChat={calendar.selectChat}
          onReorderChats={calendar.reorderChats}
          onResizingChange={setChatResizing}
          onClose={() => setChatOpen(false)}
        />
      </div>

      <AiApprovalPanel
        items={calendar.pendingChanges}
        busy={calendar.approvalBusy}
        onApprove={(id) =>
          void calendar.approvePendingChanges({ ids: [id] }).catch(() => setNotice("Unable to approve the change."))
        }
        onReject={(id) =>
          void calendar.rejectPendingChanges({ ids: [id] }).catch(() => setNotice("Unable to reject the change."))
        }
        onApproveAll={() =>
          void calendar.approvePendingChanges({ all: true }).catch(() => setNotice("Unable to approve changes."))
        }
        onRejectAll={() =>
          void calendar.rejectPendingChanges({ all: true }).catch(() => setNotice("Unable to reject changes."))
        }
      />

      {googlePeek ? (
        <GoogleEventCard
          item={googlePeek.item}
          anchor={googlePeek.anchor}
          onClose={() => setGooglePeek(null)}
          onEdit={
            googlePeek.item.google?.editable
              ? () => {
                  const next = draftFromGoogle(googlePeek.item);
                  setGooglePeek(null);
                  if (next) setDraft(next);
                }
              : undefined
          }
          onDelete={
            googlePeek.item.google?.deletable
              ? () => {
                  const target = googleTargetOf(googlePeek.item);
                  setGooglePeek(null);
                  if (target) setGoogleDelete({ ...target, title: googlePeek.item.title });
                }
              : undefined
          }
        />
      ) : null}

      {googleDelete ? (
        <ConfirmDialog
          title={`Delete “${googleDelete.title}”?`}
          message={`This deletes it from ${googleDelete.calendarName || "your calendar"} in Google Calendar. If it repeats, only this occurrence is removed.`}
          onCancel={() => setGoogleDelete(null)}
          onConfirm={() => void confirmGoogleDelete()}
        />
      ) : null}

      {draft ? (
        <div className="calendar-editor-overlay">
          <CalendarItemEditor
            draft={draft}
            onChange={setDraft}
            onSave={saveDraft}
            onCancel={() => setDraft(null)}
            onDelete={
              draft.google
                ? draft.google.deletable
                  ? () => setGoogleDelete({ ...(draft.google as GoogleDraftTarget), title: draft.title || "Event" })
                  : undefined
                : draft.id
                  ? () => {
                      calendar.remove(draft.id as string);
                      setDraft(null);
                    }
                  : undefined
            }
          />
        </div>
      ) : null}
    </div>
    </div>
  );
}
