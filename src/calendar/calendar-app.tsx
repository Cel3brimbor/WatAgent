"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { readCalendarView, writeCalendarView } from "@/calendar/preferences";
import { CalendarDayView } from "@/calendar/views/day-view";
import { CalendarWeekView } from "@/calendar/views/week-view";
import { CalendarMonthView } from "@/calendar/views/month-view";
import { CalendarYearView } from "@/calendar/views/year-view";
import {
  CalendarItemEditor,
  defaultAllDayDraft,
  defaultTimedDraft,
  draftFromMeta,
  type CalendarDraft,
} from "@/calendar/calendar-item-editor";
import { GoogleEventCard } from "@/calendar/google-event-card";
import { SettingsPanel } from "@/calendar/settings-panel";
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
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    writeCalendarView(view);
  }, [view]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const google = params.get("google");
    if (!google) return;
    setNotice(google === "connected" ? "Google Calendar connected." : "Google Calendar could not be connected.");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const itemsForDay = useCallback(
    (date: Date) =>
      aggregateTimeline({
        focus: date,
        events: calendar.items,
        busyBlocks: overlayEvents.length > 0 ? [] : busyBlocks,
        overlayEvents,
      }),
    [calendar.items, busyBlocks, overlayEvents],
  );

  const dayItems = useMemo(() => itemsForDay(focus), [itemsForDay, focus]);

  const timelineDigest = useMemo(
    () =>
      dayItems
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
    [dayItems],
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
    const existing = calendar.items.find((row) => row.id === item.id);
    if (existing) setDraft(draftFromMeta(existing.id, existing.title, existing.calendar));
  }

  function saveDraft() {
    if (!draft) return;
    if (!draft.allDay && draft.endUTC <= draft.startUTC) {
      setNotice("End time must be after the start time.");
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
      className={`calendar-shell${chatResizing ? " is-resizing-chat" : ""}`}
    >
      <header className="calendar-toolbar">
        <div className="calendar-toolbar-left">
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
        </div>
        <div className="calendar-toolbar-right">
          <SettingsPanel
            accountEmail={user.email}
            onChanged={() => setGoogleVersion((value) => value + 1)}
            syncedAt={googleSyncedAt}
            onSyncNow={() => googlePullRef.current()}
            onNotice={setNotice}
          />
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
          <button
            type="button"
            className={`ghost-btn${chatOpen ? " is-active" : ""}`}
            onClick={() => setChatOpen((value) => !value)}
          >
            Chat
          </button>
          <button
            type="button"
            className="ghost-btn"
            title={user.email ?? undefined}
            onClick={onSignOut}
          >
            Sign out
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
          {view === "day" ? (
            <CalendarDayView
              focus={focus}
              items={dayItems}
              onOpen={onOpenItem}
              onCreateTimed={(hour, _minute, endHour) => setDraft(defaultTimedDraft(focus, hour, 0, endHour))}
              onCreateAllDay={() => setDraft(defaultAllDayDraft(focus))}
              onCompleteTask={calendar.completeTask}
            />
          ) : null}
          {view === "week" ? (
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
          {view === "month" ? (
            <CalendarMonthView
              focus={focus}
              weekStartsOn={weekStartsOn}
              itemsForDay={itemsForDay}
              onOpen={onOpenItem}
              onCreate={(date) => setDraft(defaultAllDayDraft(date))}
              onCompleteTask={calendar.completeTask}
            />
          ) : null}
          {view === "year" ? (
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

      {googlePeek ? (
        <GoogleEventCard item={googlePeek.item} anchor={googlePeek.anchor} onClose={() => setGooglePeek(null)} />
      ) : null}

      {draft ? (
        <div className="calendar-editor-overlay">
          <CalendarItemEditor
            draft={draft}
            onChange={setDraft}
            onSave={saveDraft}
            onCancel={() => setDraft(null)}
            onDelete={
              draft.id
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
  );
}
