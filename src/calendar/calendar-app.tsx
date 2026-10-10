"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { CalendarItemDoc, CalendarItemMeta, CalendarView, ImportedCalendar, ImportedCalendarSource, MergedCalendar, TimelineItem } from "@/calendar/types";
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
  startOfWorkWeek,
} from "@/calendar/date-utils";
import { removeImportedCalendar } from "@/calendar/client";
import { calendarItemVisible, externalCalendarId, externalCalendarsOf } from "@/calendar/external-calendars";
import { bottomDeadlines, mergeTimeline, pinBottomDeadlines, pinListedDues } from "@/calendar/calendar-merge";
import { feedOfCalendarId, mergedByMember, newFeedId } from "@/calendar/imported-calendars";
import { formatFeedSyncSummary, syncImportedFeed } from "@/calendar/calendar-sync";
import { type SideExternalCalendar } from "@/calendar/calendar-side-panel";
import { aggregateTimeline, overlayTimelineItemOf, rangesOverlap, timelineItemOf, type BusyBlock, type OverlayEvent } from "@/calendar/timeline";
import {
  ALL_SOURCES,
  readCalendarColors,
  readCalendarView,
  readImportedCalendars,
  readCampusCalendars,
  readMergedCalendars,
  isAgentCalendarHidden,
  readAgentHiddenIds,
  readNewCalendarsShown,
  withNewCalendar,
  readColorOverrides,
  CALENDAR_PALETTE,
  readSidePanelSections,
  readSourceFilter,
  isCalendarReadOnly,
  isSidebarHidden,
  calendarGroupsOf,
  calendarSwatchColor,
  type CalendarColors,
  type CalendarSourceFilter,
  type SidePanelSectionsOpen,
} from "@/calendar/preferences";
import { isExcludedGoogleCalendarName } from "@/calendar/calendar-lists";
import {
  compileSmartTags,
  readSmartTags,
  readTaskSmartTags,
  type SmartTag,
  type SmartTagMatcher,
  type SmartTagTarget,
} from "@/calendar/smart-tags";
import { calendarIdForDraft, calendarIdForMeta, timelineItemCalendarId } from "@/calendar/calendar-ownership";
import { CalendarSidePanel } from "@/calendar/calendar-side-panel";
import { QuickDisplays } from "@/calendar/quick-displays";
import {
  MAIN_CALENDAR_SPACE_ID,
  itemInCalendarSpace,
  itemOnMainCalendar,
  mapCalendarSpace,
  overlayInCalendarSpace,
  readCalendarSpaces,
  spaceOnlyFeedIds,
  type CalendarSpace,
  type SpaceCalendarChoice,
} from "@/calendar/calendar-spaces";
import { deleteGoogleEvent, getGoogleCalendarStatus, updateGoogleEvent, type GoogleCalendarRef } from "@/calendar/google-calendar-client";
import { ConfirmDialog } from "@/shared/confirm-dialog";
import { CalendarDayView } from "@/calendar/views/day-view";
import { CalendarWeekView } from "@/calendar/views/week-view";
import { CalendarMonthView } from "@/calendar/views/month-view";
import { CalendarYearView } from "@/calendar/views/year-view";
import { MobileCalendarToolbar } from "@/calendar/mobile-calendar-toolbar";
import {
  CalendarItemEditor,
  defaultAllDayDraft,
  defaultTimedDraft,
  draftFromGoogle,
  draftFromMeta,
  type CalendarDraft,
  type GoogleDraftTarget,
} from "@/calendar/calendar-item-editor";
import { mergeEditorDraft } from "@/calendar/editor-draft";
import { GoogleEventCard } from "@/calendar/google-event-card";
import { rememberPlace } from "@/calendar/place-memory";
import { SettingsPanel } from "@/calendar/settings-panel";
import { useCalendarPreferencesSync, type CalendarPreferencesState } from "@/calendar/use-calendar-preferences-sync";
import {
  BUILTIN_CALENDARS,
  isBuiltinLocalCalendarId,
  PRIMARY_EVENT_CALENDAR_NAME,
  calendarIdField,
  defaultEventCalendarId,
  localCalendarIdOf,
  newLocalCalendar,
  readLocalCalendars,
  shownLocalCalendars,
  type LocalCalendar,
} from "@/calendar/local-calendars";
import { useAppearanceSync } from "@/calendar/use-appearance-sync";
import { SideNav, type AppSection } from "@/calendar/side-nav";
import { CalendarMapSection } from "@/calendar/calendar-map-section";
import { onRulesRan, ruleRunSummary, runRulesAfterSync } from "@/agent/rules/rules-client";
import { useAgentRules } from "@/agent/rules/use-agent-rules";
import { TodoList } from "@/calendar/todo-list";
import { CampusEventsSection } from "@/campus/campus-events-section";
import {
  campusCalendarsOf,
  campusCalendarItems,
  splitCampusCalendars,
  campusCategoryLabel,
  campusEventMeta,
  campusFeedCategories,
  campusFeedUrl,
  campusScrapeIsNewer,
  isDefaultCampusCalendarName,
  type CampusEvent,
} from "@/campus/campus-events";
import {
  campusColorKey,
  campusSubscriptionsMatch,
  colorOverridesWithCampusSubscriptions,
  withCampusFeedColor,
  type CampusSubscriptionPref,
} from "@/campus/campus-subscription-prefs";
import { cachedCampusEvents, fetchCampusScrapeAt, syncCampusCalendars, type CampusSyncCalendar } from "@/campus/campus-client";
import { deadlineTasksOf, dedupeSchoolAssignmentTasks, keywordTasksOf, readKeywordTasks, smartTagTasksOf, withKeywordTaskDone, withTaskTags, type KeywordTasks, type KeywordTaskSource } from "@/calendar/keyword-tasks";
import { KeywordTaskRules, type KeywordTaskCalendarOption } from "@/calendar/keyword-task-rules";
import { AccessError, plainReason } from "@/auth/access";
import { CalendarChatPanel } from "@/agent/calendar-chat-panel";
import type { PendingAiChange } from "@/calendar/approval-client";
import { attachedIdsOf, textForModel, type MentionCalendar } from "@/agent/calendar-mention";
import type { AgentEffort } from "@/agent/agent-effort";
import { requestChatTitle } from "@/agent/chat-title";
import { readAgentStream } from "@/agent/stream";
import { cloneActivity } from "@/agent/agent-activity";
import type { ActivityPart, ChatMessage, ThoughtSegment, ToolEventRecord } from "@/agent/types";
import { ApiError, apiFetch, apiJson, errorFromResponse } from "@/shared/api-base";
import { uid } from "@/shared/ids";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "@/shared/icons";
import { SegmentedControl, type SegmentOption } from "@/shared/segmented-control";
import { usePresence } from "@/shared/use-presence";
import type { AuthUser } from "@/auth/types";

type ImportedLabels = { imported: ImportedCalendar[]; merged: MergedCalendar[] };

//a merged calendar's event says which member it came from
function importedCalendarLabel(item: Pick<TimelineItem, "importSource" | "mergedCalendarId">, labels: ImportedLabels): string | undefined {
  if (!item.importSource) return undefined;
  const own = labels.imported.find((calendar) => calendar.id === item.importSource)?.name ?? "Imported calendar";
  const merged = item.mergedCalendarId ? labels.merged.find((calendar) => calendar.id === item.mergedCalendarId) : undefined;
  return merged ? `${merged.name} (from ${own})` : own;
}

function eventCalendarLabel(
  item: Pick<TimelineItem, "kind" | "startUTC" | "endUTC" | "allDay" | "importSource" | "mergedCalendarId" | "calendarId">,
  calendars: LocalCalendar[],
  labels: ImportedLabels,
): string | undefined {
  const imported = importedCalendarLabel(item, labels);
  if (imported) return imported;
  if (item.kind !== "event" && item.kind !== "task") return undefined;
  const id = localCalendarIdOf({
    kind: item.kind,
    startUTC: item.startUTC,
    endUTC: item.endUTC,
    allDay: item.allDay,
    importSource: item.importSource,
    calendarId: item.calendarId,
  });
  if (!id) return undefined;
  return calendars.find((calendar) => calendar.id === id)?.name
    ?? (id === "events" ? PRIMARY_EVENT_CALENDAR_NAME : undefined);
}

const VIEW_OPTIONS: SegmentOption<CalendarView>[] = [
  { value: "day", label: "Day", hint: "Day (D)" },
  { value: "workweek", label: "5 Day", hint: "5 days, Monday to Friday (5)" },
  { value: "week", label: "Week", hint: "Week (W)" },
  { value: "month", label: "Month", hint: "Month (M)" },
  { value: "year", label: "Year", hint: "Year (Y)" },
];

const VIEW_DEPTH: Record<CalendarView, number> = { year: 0, month: 1, week: 2, workweek: 2, day: 3 };
const SECTION_TITLES: Record<Exclude<AppSection, "calendar">, string> = { tasks: "Tasks", events: "Events", displays: "Quick Displays", map: "Configuration", settings: "Settings" };

//which way the stage should move: sideways through time, or zooming between granularities
type NavDirection = "next" | "prev" | "in" | "out" | "none";

type Range = { rangeStartUTC: number; rangeEndUTC: number };

type SendPayload = {
  text: string;
  effort: AgentEffort;
  calendarIds?: string[];
  branch?: { kind: "edit"; messageId: string } | { kind: "regenerate"; messageId: string };
};

const GOOGLE_POLL_MS = 5 * 60 * 1000;
const GOOGLE_SYNC_MAX_RANGE_MS = 120 * 24 * 60 * 60 * 1000;

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

function rangeUnion(a: Range, b: Range): Range {
  return {
    rangeStartUTC: Math.min(a.rangeStartUTC, b.rangeStartUTC),
    rangeEndUTC: Math.max(a.rangeEndUTC, b.rangeEndUTC),
  };
}

function googleSyncChunks(desired: Range): Range[] {
  const span = desired.rangeEndUTC - desired.rangeStartUTC;
  if (span <= GOOGLE_SYNC_MAX_RANGE_MS) return [desired];
  const chunks: Range[] = [];
  let start = desired.rangeStartUTC;
  while (start < desired.rangeEndUTC) {
    const end = Math.min(start + GOOGLE_SYNC_MAX_RANGE_MS, desired.rangeEndUTC);
    chunks.push({ rangeStartUTC: start, rangeEndUTC: end });
    if (end <= start) break;
    start = end;
  }
  return chunks;
}

function googleSyncDesiredFresh(covered: FreshRange[], desired: Range, now: number): boolean {
  return googleSyncChunks(desired).every((chunk) => rangeIsFresh(covered, chunk, now));
}

//wider than the visible month so prev/next month navigation stays in cache
function googleMonthLoadRange(focus: Date): Range {
  const start = startOfLocalDay(new Date(focus.getFullYear(), focus.getMonth() - 2, 1));
  const end = startOfLocalDay(new Date(focus.getFullYear(), focus.getMonth() + 3, 1));
  return { rangeStartUTC: start.getTime(), rangeEndUTC: end.getTime() };
}

//two weeks before and after the focused week (five weeks total)
function googleWeekLoadRange(focus: Date, weekStartsOn: 0 | 1): Range {
  const weekStart = startOfWeek(focus, weekStartsOn);
  return {
    rangeStartUTC: addDays(weekStart, -14).getTime(),
    rangeEndUTC: addDays(weekStart, 28).getTime(),
  };
}

function googleFetchRange(focus: Date, view: CalendarView, weekStartsOn: 0 | 1): Range {
  if (view === "month") return googleMonthLoadRange(focus);
  if (view === "week" || view === "workweek") {
    return rangeUnion(googleWeekLoadRange(view === "workweek" ? startOfWorkWeek(focus) : focus, weekStartsOn), googleMonthLoadRange(focus));
  }
  if (view === "day") return googleWeekLoadRange(focus, weekStartsOn);
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
  if (view === "workweek") {
    const start = startOfWorkWeek(focus);
    return { rangeStartUTC: start.getTime(), rangeEndUTC: addDays(start, 5).getTime() };
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

function smartTagTargetOf(item: TimelineItem): SmartTagTarget | null {
  if (item.kind === "gcal_busy") return null;
  if (item.kind === "gcal_event") {
    if (!item.google?.calendarId) return null;
    return {
      calendarId: item.google.calendarId,
      title: item.title,
      location: item.google.location,
      description: item.google.description,
    };
  }
    return {
      calendarId: item.importSource
        ? externalCalendarId(item.importSource)
        : (item.calendarId ?? "events"),
      title: item.title,
      location: item.location,
      description: item.description,
    };
}

function applySmartTags(items: TimelineItem[], matcher: SmartTagMatcher): TimelineItem[] {
  return items.map((item) => {
    const target = smartTagTargetOf(item);
    const hit = target ? matcher(target) : null;
    return hit ? { ...item, smartTag: hit } : item;
  });
}

function timeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

//the server scrape we last applied. a wall-clock stamp must not be compared with scrapedAt.
const CAMPUS_SCRAPE_KEY = "watagent.campus.appliedScrapedAt";

function readAppliedCampusScrape(): number | null {
  try {
    const at = Number(window.localStorage.getItem(CAMPUS_SCRAPE_KEY));
    return Number.isFinite(at) && at > 0 ? at : null;
  } catch {
    return null;
  }
}

function writeAppliedCampusScrape(at: number): void {
  try {
    window.localStorage.setItem(CAMPUS_SCRAPE_KEY, String(at));
  } catch {
    return;
  }
}

function importAlreadyRunning(err: unknown): boolean {
  return err instanceof Error && err.message.includes("already running");
}

//start of the period the stage is showing, so moving within the same week/month isn't a "navigation"
function periodStart(focus: Date, view: CalendarView, weekStartsOn: 0 | 1): number {
  if (view === "day") return startOfLocalDay(focus).getTime();
  if (view === "week") return startOfWeek(focus, weekStartsOn).getTime();
  if (view === "workweek") return startOfWorkWeek(focus).getTime();
  if (view === "month") return new Date(focus.getFullYear(), focus.getMonth(), 1).getTime();
  return new Date(focus.getFullYear(), 0, 1).getTime();
}

export function CalendarApp({
  user,
  onSignOut,
  advancedView,
  onAdvancedViewChange,
}: {
  user: AuthUser;
  onSignOut: () => void;
  advancedView: boolean;
  onAdvancedViewChange: (value: boolean) => void;
}) {
  const calendar = useCalendar();
  const { syncFromGoogle, createChat, pruneEmptyChats, setAfterWrite } = calendar;
  const [view, setView] = useState<CalendarView>(() => readCalendarView());
  const [calendarSpaces, setCalendarSpaces] = useState<CalendarSpace[]>(() => readCalendarSpaces().spaces);
  const [activeCalendarSpaceId, setActiveCalendarSpaceId] = useState(() => readCalendarSpaces().activeId);
  const [openDisplayId, setOpenDisplayId] = useState<string | null>(null);
  const [importedCalendars, setImportedCalendars] = useState<ImportedCalendar[]>(() => splitCampusCalendars(readImportedCalendars(), readCampusCalendars()).imported);
  const [campusCalendarFeeds, setCampusCalendarFeeds] = useState<ImportedCalendar[]>(() => splitCampusCalendars(readImportedCalendars(), readCampusCalendars()).campus);
  const [mergedCalendars, setMergedCalendars] = useState<MergedCalendar[]>(() => readMergedCalendars([...readImportedCalendars(), ...readCampusCalendars()]));
  const [agentHiddenCalendarIds, setAgentHiddenCalendarIds] = useState<string[]>(() => readAgentHiddenIds());
  const [newCalendarsShown, setNewCalendarsShown] = useState(() => readNewCalendarsShown());
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const googleRelinkRef = useRef(false);
  const [section, setSection] = useState<AppSection>("calendar");
  const [navCollapsed, setNavCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("watagent.nav.collapsed") === "1";
    } catch {
      return false;
    }
  });
  const [focus, setFocus] = useState(() => startOfLocalDay(new Date()));
  const [busyBlocks, setBusyBlocks] = useState<BusyBlock[]>([]);
  const [overlayEvents, setOverlayEvents] = useState<OverlayEvent[]>([]);
  const [googleVersion, setGoogleVersion] = useState(0);
  const [googleSyncedAt, setGoogleSyncedAt] = useState<number | null>(null);
  const weekStartsOn = useMemo(() => localeWeekStartsOn(), []);
  const [chatOpen, setChatOpen] = useState(false);
  const [attachRequest, setAttachRequest] = useState<{ id: string; nonce: number } | null>(null);
  const agentRules = useAgentRules();
  const ruleNames = useMemo(
    () => Object.fromEntries(agentRules.rules.map((rule) => [rule.id, rule.name])),
    [agentRules.rules],
  );
  const [chatResizing, setChatResizing] = useState(false);
  const [draft, setDraft] = useState<CalendarDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restriction, setRestriction] = useState<{ message: string; reason: string | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { refresh: refreshCalendar, refreshPending } = calendar;
  const reloadRules = agentRules.reload;

  //rules that ran after a feed sync: say what they did and show their new items
  useEffect(
    () =>
      onRulesRan(({ lines }) => {
        const message = lines.map(ruleRunSummary).filter(Boolean).join(" · ");
        if (message) setNotice(message);
        void Promise.all([refreshCalendar(), refreshPending(), reloadRules()]);
      }),
    [refreshCalendar, refreshPending, reloadRules],
  );

  //a restriction should be on screen before the first message, and lift as soon as it is removed
  useEffect(() => {
    let cancelled = false;
    async function loadAccess() {
      try {
        const payload = await apiJson<{ aiRestricted?: unknown; message?: unknown; reason?: unknown }>("/api/account/access");
        if (cancelled) return;
        if (payload?.aiRestricted !== true) {
          setRestriction((current) => (current ? null : current));
          return;
        }
        const message =
          typeof payload.message === "string" && payload.message.trim()
            ? payload.message.trim()
            : "Your account is restricted from AI features. If you believe this was a mistake, please appeal.";
        const reason = plainReason(typeof payload.reason === "string" ? payload.reason : null) || null;
        setRestriction((current) =>
          current && current.message === message && current.reason === reason ? current : { message, reason },
        );
      } catch (err) {
        if (err instanceof AccessError && err.code === "ai_restricted") {
          if (!cancelled) setRestriction({ message: err.message, reason: err.reason });
        }
      }
    }
    void loadAccess();
    function onVisible() {
      if (document.visibilityState === "visible") void loadAccess();
    }
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadAccess();
    }, 4000);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [chatOpen]);
  const [streamingAssistantId, setStreamingAssistantId] = useState<string | null>(null);
  const [settlingAssistantId, setSettlingAssistantId] = useState<string | null>(null);
  const [holdLabel, setHoldLabel] = useState<string | null>(null);
  const settleTimerRef = useRef(0);
  const [googlePeek, setGooglePeek] = useState<{ item: TimelineItem; anchor: DOMRect } | null>(null);
  const [googleDelete, setGoogleDelete] = useState<(GoogleDraftTarget & { title: string }) | null>(null);
  const [itemDelete, setItemDelete] = useState<{ id: string; title: string; kind: "event" | "task"; calendarName?: string } | null>(null);
  const [sources, setSources] = useState<CalendarSourceFilter>(() => readSourceFilter());
  const [colors, setColors] = useState<CalendarColors>(() => readCalendarColors());
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>(() => readColorOverrides());
  const [localCalendars, setLocalCalendars] = useState<LocalCalendar[]>(() => readLocalCalendars());
  const [smartTags, setSmartTags] = useState<SmartTag[]>(() => readSmartTags());
  const [taskSmartTags, setTaskSmartTags] = useState<SmartTag[]>(() => readTaskSmartTags());
  const [keywordTasks, setKeywordTasks] = useState<KeywordTasks>(() => readKeywordTasks());
  const [sidePanelSections, setSidePanelSections] = useState<SidePanelSectionsOpen>(() => readSidePanelSections());
  const groups = calendarGroupsOf(sources.groups);
  const smartTagMatcher = useMemo(
    () => compileSmartTags(groups.smartTags ? smartTags : smartTags.map((tag) => ({ ...tag, enabled: false }))),
    [smartTags, groups.smartTags],
  );
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendarRef[]>([]);
  const sidebarCalendars = useMemo(() => {
    if (googleCalendars.length > 0) return googleCalendars;
    const byId = new Map<string, GoogleCalendarRef>();
    for (const event of overlayEvents) {
      if (!event.calendarId || byId.has(event.calendarId)) continue;
      const name = event.calendarName || "Calendar";
      if (isExcludedGoogleCalendarName(name)) continue;
      byId.set(event.calendarId, {
        id: event.calendarId,
        name,
        color: event.calendarColor,
        group: "other",
      });
    }
    return [...byId.values()].filter((calendar) => !isExcludedGoogleCalendarName(calendar.name));
  }, [googleCalendars, overlayEvents]);
  const abortRef = useRef<AbortController | null>(null);
  const peek = usePresence(googlePeek);
  const shownPeek = peek.value;
  const deletePrompt = usePresence(googleDelete);
  const itemDeletePrompt = usePresence(itemDelete);
  const editor = usePresence(draft);
  const shownDraft = editor.value;
  const banner = usePresence(notice ?? calendar.loadError);
  //stable so overlay effects don't re-subscribe every render
  const closePeek = useCallback(() => setGooglePeek(null), []);
  const closeEditor = useCallback(() => setDraft(null), []);

  const isTimelineItemReadOnly = useCallback(
    (item: TimelineItem) => {
      const id = timelineItemCalendarId(item);
      return id ? isCalendarReadOnly(sources, id) : false;
    },
    [sources],
  );

  const draftReadOnly = shownDraft
    ? isCalendarReadOnly(sources, calendarIdForDraft(shownDraft, calendar.items, localCalendars))
    : false;

  useEffect(() => {
    if (draft) setGooglePeek(null);
  }, [draft]);

  const itemsForUi = useMemo(
    () => mergeEditorDraft(calendar.displayItems, draft),
    [calendar.displayItems, draft],
  );
  const shownCalendars = useMemo(() => shownLocalCalendars(localCalendars, calendar.items), [localCalendars, calendar.items]);
  const localCalendarCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of calendar.items) {
      const id = localCalendarIdOf(item.calendar);
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }, [calendar.items]);

  //a quick display filters the stage. the main calendar stays on its own view
  const viewingDisplay = useMemo(() => {
    if (section !== "displays" || !openDisplayId) return null;
    return calendarSpaces.find((space) => space.id === openDisplayId) ?? null;
  }, [section, openDisplayId, calendarSpaces]);
  const shownView = viewingDisplay?.view ?? view;
  const changeView = useCallback((next: CalendarView) => {
    if (viewingDisplay) {
      setCalendarSpaces((current) => mapCalendarSpace(current, viewingDisplay.id, (space) => ({ ...space, view: next })));
      return;
    }
    setView(next);
  }, [viewingDisplay]);

  const period = periodStart(focus, shownView, weekStartsOn);
  const displayKey = viewingDisplay?.id ?? "main";
  const lastPeriodRef = useRef({ period, view: shownView, section, spaceId: displayKey });
  const navDirection = useMemo<NavDirection>(() => {
    const last = lastPeriodRef.current;
    const onStage = section === "calendar" || viewingDisplay != null;
    if (!onStage || section !== last.section) return "none";
    if (displayKey !== last.spaceId) return "none";
    if (shownView !== last.view) return VIEW_DEPTH[shownView] > VIEW_DEPTH[last.view] ? "in" : "out";
    if (period === last.period) return "none";
    return period > last.period ? "next" : "prev";
  }, [period, shownView, section, displayKey, viewingDisplay]);
  useEffect(() => {
    lastPeriodRef.current = { period, view: shownView, section, spaceId: displayKey };
  }, [period, shownView, section, displayKey]);
  const stageKey = viewingDisplay
    ? `${viewingDisplay.id}:${shownView}:${period}`
    : section === "calendar"
      ? `main:${shownView}:${period}`
      : section;
  useEffect(() => {
    if (viewingDisplay) setDraft(null);
  }, [viewingDisplay]);

  useAppearanceSync(calendar.hydrated);

  const campusRestoreRef = useRef<CampusSubscriptionPref[] | null>(null);
  const campusRestoreDoneRef = useRef(false);
  const campusRestoreBusyRef = useRef(false);
  const flushCalendarPreferencesRef = useRef<((overrides?: Partial<CalendarPreferencesState>) => void) | null>(null);

  const preferencesLoaded = useCalendarPreferencesSync(
    calendar.hydrated,
    { view, importedCalendars, campusCalendars: campusCalendarFeeds, mergedCalendars, agentHiddenCalendarIds, newCalendarsShown, localCalendars, sources, colors, colorOverrides, smartTags, taskSmartTags, keywordTasks, navCollapsed, sidePanelSections, calendarSpaces, activeCalendarSpaceId },
    {
      setView,
      setImportedCalendars,
      setCampusCalendars: setCampusCalendarFeeds,
      setMergedCalendars,
      setAgentHiddenCalendarIds,
      setNewCalendarsShown,
      setLocalCalendars,
      setSources,
      setColors,
      setColorOverrides,
      setSmartTags,
      setTaskSmartTags,
      setKeywordTasks,
      setNavCollapsed,
      setSidePanelSections,
      setCalendarSpaces,
      setActiveCalendarSpaceId,
      onCampusSubscriptionsRestore: (subs) => {
        campusRestoreRef.current = subs;
        campusRestoreDoneRef.current = false;
      },
    },
    flushCalendarPreferencesRef,
  );

  const importedLabels = useMemo<ImportedLabels>(
    () => ({ imported: [...importedCalendars, ...campusCalendarFeeds], merged: mergedCalendars }),
    [importedCalendars, campusCalendarFeeds, mergedCalendars],
  );
  const feedsForMerge = useMemo(() => [...importedCalendars, ...campusCalendarFeeds], [importedCalendars, campusCalendarFeeds]);
  const spaceOnlyFeeds = useMemo(
    () => spaceOnlyFeedIds(calendarSpaces, feedsForMerge.map((feed) => feed.id)),
    [calendarSpaces, feedsForMerge],
  );

  //merged calendars stand in for their members. uwaterloo feeds never share the external list, so a gap in that list can't rename one "Imported calendar"
  const campusSourceIds = useMemo(() => new Set(campusCalendarFeeds.map((calendar) => calendar.id)), [campusCalendarFeeds]);
  const { sideExternalCalendars, sideCampusCalendars } = useMemo(() => {
    const byMember = mergedByMember(mergedCalendars);
    const feedOf = (id: string) => feedsForMerge.find((calendar) => externalCalendarId(calendar.id) === id);
    const external: SideExternalCalendar[] = [];
    const campus: SideExternalCalendar[] = [];
    for (const calendar of mergedCalendars) {
      const row: SideExternalCalendar = {
        id: calendar.id,
        name: calendar.name,
        feeds: calendar.members.map(feedOf).filter((feed): feed is ImportedCalendar => feed != null),
        merged: true,
      };
      const onlyCampus = calendar.members.length > 0 && calendar.members.every((member) => {
        const source = feedOfCalendarId(member);
        return source != null && campusSourceIds.has(source);
      });
      (onlyCampus ? campus : external).push(row);
    }
    const spaceFeeds = spaceOnlyFeedIds(calendarSpaces, feedsForMerge.map((feed) => feed.id));
    for (const row of externalCalendarsOf(itemsForUi, importedCalendars, new Set([...campusSourceIds, ...spaceFeeds]))) {
      if (byMember.has(row.id)) continue;
      const feed = feedOf(row.id);
      external.push({ id: row.id, name: row.name, source: row.source, feeds: feed ? [feed] : [] });
    }
    for (const calendar of campusCalendarFeeds) {
      const id = externalCalendarId(calendar.id);
      if (byMember.has(id)) continue;
      campus.push({ id, name: calendar.name, source: calendar.id, feeds: [calendar] });
    }
    return { sideExternalCalendars: external, sideCampusCalendars: campus };
  }, [itemsForUi, importedCalendars, campusCalendarFeeds, campusSourceIds, mergedCalendars, feedsForMerge, calendarSpaces]);

  const mentionCalendars = useMemo(() => {
    const rows: MentionCalendar[] = shownCalendars
      .filter((calendar) => !isAgentCalendarHidden(agentHiddenCalendarIds, calendar.id))
      .map((calendar) => ({
        id: calendar.id,
        name: calendar.name,
        kind: calendar.kind,
        color: calendarSwatchColor(calendar.id, colors, colorOverrides),
        readOnly: isCalendarReadOnly(sources, calendar.id),
      }));
    for (const calendar of [...sideExternalCalendars, ...sideCampusCalendars]) {
      if (isAgentCalendarHidden(agentHiddenCalendarIds, calendar.id)) continue;
      rows.push({
        id: calendar.id,
        name: calendar.name,
        kind: "event" as const,
        color: calendarSwatchColor(calendar.id, colors, colorOverrides),
        readOnly: true,
        ...(calendar.merged ? { memberIds: calendar.feeds.map((feed) => externalCalendarId(feed.id)) } : {}),
      });
    }
    if ((googleConnected || overlayEvents.length > 0) && !isAgentCalendarHidden(agentHiddenCalendarIds, "google")) {
      rows.push({
        id: "google",
        name: "Google Calendar",
        kind: "event",
        color: colors.google,
        readOnly: true,
      });
    }
    return rows;
  }, [
    shownCalendars,
    sideExternalCalendars,
    sideCampusCalendars,
    colors,
    colorOverrides,
    sources,
    agentHiddenCalendarIds,
    googleConnected,
    overlayEvents.length,
  ]);

  const chatItems = useMemo(() => {
    const google = overlayEvents.map((event) => ({
      id: `gcal:${event.id}`,
      title: event.title,
      createdAt: event.startUTC,
      updatedAt: event.startUTC,
      calendar: {
        kind: "event" as const,
        startUTC: event.startUTC,
        endUTC: event.endUTC,
        allDay: event.allDay,
        location: event.location,
        description: event.description,
        calendarId: "google",
      },
    }));
    return [...calendar.displayItems, ...google];
  }, [calendar.displayItems, overlayEvents]);

  const renameExternal = useCallback((id: string, name: string) => {
    setMergedCalendars((current) => current.map((calendar) => (calendar.id === id ? { ...calendar, name } : calendar)));
    setImportedCalendars((current) => current.map((calendar) => (externalCalendarId(calendar.id) === id ? { ...calendar, name } : calendar)));
    setCampusCalendarFeeds((current) => current.map((calendar) => (externalCalendarId(calendar.id) === id ? { ...calendar, name } : calendar)));
  }, []);


  //UWaterloo events copy onto any WatAgent event calendar you can write to
  const campusTargets = useMemo(
    () =>
      shownCalendars
        .filter((entry) => entry.kind === "event" && !isCalendarReadOnly(sources, entry.id))
        .map((entry) => ({ id: entry.id, name: entry.name })),
    [shownCalendars, sources],
  );

  const addCampusEvent = useCallback(
    (event: CampusEvent, calendarId: string) => {
      calendar.upsert({ title: event.title, calendar: campusEventMeta(event, calendarId) });
      const name = campusTargets.find((entry) => entry.id === calendarId)?.name ?? "your calendar";
      setNotice(`Added “${event.title}” to ${name}.`);
    },
    [calendar, campusTargets],
  );

  const addImported = useCallback(async (added: ImportedCalendar) => {
    const campusLink = campusFeedCategories(added.url) != null;
    const existing = campusLink ? campusCalendarFeeds : importedCalendars;
    const isNew = !existing.some((entry) => entry.id === added.id);
    const place = (current: ImportedCalendar[]) => (current.some((entry) => entry.id === added.id) ? current : [...current, added]);
    if (campusLink) setCampusCalendarFeeds(place);
    else setImportedCalendars(place);
    if (isNew) setSources((current) => withNewCalendar(current, externalCalendarId(added.id), newCalendarsShown));
    await calendar.refresh();
  }, [calendar, importedCalendars, campusCalendarFeeds, newCalendarsShown]);

  //each enabled category is its own calendar. a link that still lists several is split the next time this runs
  const campusCalendars = useMemo(() => campusCalendarsOf(campusCalendarFeeds), [campusCalendarFeeds]);
  const campusCategoryByFeedId = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of campusCalendars) {
      if (entry.categories.length === 1) map.set(entry.calendar.id, entry.categories[0]);
    }
    return map;
  }, [campusCalendars]);
  const campusSources = useMemo(() => new Set(campusCalendars.map((entry) => entry.calendar.id)), [campusCalendars]);
  const campusRef = useRef(campusCalendarFeeds);
  const campusBusy = useRef(false);
  if (!campusBusy.current) campusRef.current = campusCalendarFeeds;
  const campusChain = useRef(Promise.resolve());
  const campusJobs = useRef(0);

  const enqueueCampus = useCallback((work: () => Promise<void>) => {
    campusJobs.current += 1;
    campusBusy.current = true;
    const job = campusChain.current.catch(() => undefined).then(async () => {
      try {
        await work();
      } finally {
        campusJobs.current = Math.max(0, campusJobs.current - 1);
        campusBusy.current = campusJobs.current > 0;
      }
    });
    campusChain.current = job.then(() => undefined, () => undefined);
  }, []);

  //the row and its events leave the screen together. the server archive follows, so a refresh can't bring them back early.
  const disconnectFeed = useCallback((source: ImportedCalendarSource) => {
    const id = externalCalendarId(source);
    let campus: ImportedCalendar | undefined;
    let external: ImportedCalendar | undefined;
    let merged: MergedCalendar[] = [];
    setCampusCalendarFeeds((current) => {
      campus = current.find((entry) => entry.id === source);
      const next = current.filter((entry) => entry.id !== source);
      campusRef.current = next;
      return next;
    });
    setImportedCalendars((current) => {
      external = current.find((entry) => entry.id === source);
      return current.filter((entry) => entry.id !== source);
    });
    setMergedCalendars((current) => {
      merged = current;
      return current
        .map((entry) => ({ ...entry, members: entry.members.filter((member) => member !== id) }))
        .filter((entry) => entry.members.length >= 2);
    });
    calendar.hideImport(source);
    return { campus, external, merged };
  }, [calendar]);

  const restoreFeed = useCallback((source: ImportedCalendarSource, snapshot: { campus?: ImportedCalendar; external?: ImportedCalendar; merged: MergedCalendar[] }) => {
    calendar.releaseImport(source);
    if (snapshot.campus) {
      campusRef.current = [...campusRef.current.filter((entry) => entry.id !== source), snapshot.campus];
      setCampusCalendarFeeds(campusRef.current);
    }
    if (snapshot.external) setImportedCalendars((current) => (current.some((entry) => entry.id === source) ? current : [...current, snapshot.external!]));
    setMergedCalendars(snapshot.merged);
  }, [calendar]);

  const removeImported = useCallback((source: ImportedCalendarSource) => {
    const snapshot = disconnectFeed(source);
    enqueueCampus(async () => {
      try {
        await removeImportedCalendar(source);
        calendar.releaseImport(source);
        await calendar.refresh();
      } catch (err) {
        restoreFeed(source, snapshot);
        await calendar.refresh();
        setNotice(err instanceof Error && err.message ? err.message : "Unable to remove this calendar. Please try again.");
      }
    });
    return Promise.resolve();
  }, [calendar, disconnectFeed, enqueueCampus, restoreFeed]);

  const openQuickDisplay = useCallback((id: string) => {
    setOpenDisplayId(calendarSpaces.some((space) => space.id === id) ? id : null);
    setSection("displays");
  }, [calendarSpaces]);

  const createQuickDisplay = useCallback((space: CalendarSpace) => {
    setCalendarSpaces((current) => current.some((entry) => entry.id === space.id) ? current : [...current, space].slice(0, 12));
    setOpenDisplayId(null);
    setSection("displays");
  }, []);

  const updateQuickDisplay = useCallback((id: string, edit: (space: CalendarSpace) => CalendarSpace) => {
    //colors and smart tags land on this shortcut only
    setCalendarSpaces((current) => mapCalendarSpace(current, id, edit));
  }, []);

  const deleteCalendarSpace = useCallback(async (spaceId: string) => {
    const space = calendarSpaces.find((entry) => entry.id === spaceId);
    if (!space) return;
    for (const feed of space.importedCalendars) calendar.hideImport(feed.id);
    try {
      for (const feed of space.importedCalendars) {
        await removeImportedCalendar(feed.id);
        calendar.releaseImport(feed.id);
      }
      setCalendarSpaces((current) => current.filter((entry) => entry.id !== spaceId));
      setOpenDisplayId((current) => (current === spaceId ? null : current));
      setActiveCalendarSpaceId(MAIN_CALENDAR_SPACE_ID);
      await calendar.refresh();
    } catch (err) {
      for (const feed of space.importedCalendars) calendar.releaseImport(feed.id);
      await calendar.refresh();
      setNotice(err instanceof Error && err.message ? err.message : "Unable to delete this Quick Display. Your calendar was not changed.");
      throw err;
    }
  }, [calendar, calendarSpaces]);

  const subscribeCampus = useCallback(
    (next: Array<{ id: string; label: string }>, options?: { quiet?: boolean }) => {
      const wanted = new Map(next.map((entry) => [entry.id, entry.label]));
      const current = campusCalendarsOf(campusRef.current);
      const singles = new Map<string, (typeof current)[number]>();
      const drop: typeof current = [];
      for (const entry of current) {
        if (entry.categories.length === 1 && !singles.has(entry.categories[0])) singles.set(entry.categories[0], entry);
        else if (entry.categories.length !== 1 || singles.has(entry.categories[0])) drop.push(entry);
      }
      const added: Array<{ id: ImportedCalendarSource; url: string; name: string }> = [];
      const removed: Array<{ id: ImportedCalendarSource; name: string; snapshot: ReturnType<typeof disconnectFeed> }> = [];
      const remember = (entry: ImportedCalendar) => {
        campusRef.current = [...campusRef.current.filter((calendar) => calendar.id !== entry.id), entry];
        setCampusCalendarFeeds(campusRef.current);
      };
      for (const [id, label] of wanted) {
        const found = singles.get(id);
        if (found) {
          if (found.calendar.name !== label && isDefaultCampusCalendarName(found.calendar.name)) remember({ ...found.calendar, name: label });
          continue;
        }
        const url = campusFeedUrl([id]);
        const feedId = newFeedId();
        const feedKey = externalCalendarId(feedId);
        remember({ id: feedId, name: label, url });
        setColorOverrides((overrides) => withCampusFeedColor(overrides, id, feedKey));
        setSources((sourcesNow) => withNewCalendar(sourcesNow, feedKey, newCalendarsShown));
        //events already on the Events page, so the calendar fills without waiting for the save
        calendar.stageImport(feedId, campusCalendarItems(cachedCampusEvents(), feedId, id));
        added.push({ id: feedId, url, name: label });
      }
      for (const [id, entry] of singles) {
        if (wanted.has(id)) continue;
        removed.push({ id: entry.calendar.id, name: entry.calendar.name, snapshot: disconnectFeed(entry.calendar.id) });
      }
      for (const entry of drop) {
        if (entry.categories.length === 0) continue;
        removed.push({ id: entry.calendar.id, name: entry.calendar.name, snapshot: disconnectFeed(entry.calendar.id) });
      }
      flushCalendarPreferencesRef.current?.({ campusCalendars: campusRef.current });
      if (!options?.quiet) {
        if (wanted.size === 0 && removed.length > 0) setNotice("Unsubscribed. UWaterloo Events are off your calendars.");
        else if (added.length === 1 && removed.length === 0) setNotice(`Subscribed. ${added[0].name} is its own calendar under UWaterloo Events.`);
        else if (removed.length === 1 && added.length === 0) setNotice(`${removed[0].name} is off your calendars.`);
        else if (added.length > 0 || removed.length > 0) setNotice("Updated your UWaterloo Events calendars.");
      }
      if (added.length === 0 && removed.length === 0) return Promise.resolve();
      enqueueCampus(async () => {
        const saved = new Set<ImportedCalendarSource>();
        const archived = new Set<ImportedCalendarSource>();
        try {
          for (const feed of added) {
            if (!campusRef.current.some((entry) => entry.id === feed.id)) {
              calendar.releaseImport(feed.id);
              continue;
            }
            for (let attempt = 0; attempt < 20; attempt++) {
              try {
                await syncImportedFeed({ id: feed.id, url: feed.url });
                break;
              } catch (err) {
                if (!importAlreadyRunning(err) || attempt === 19) throw err;
                await new Promise((resolve) => setTimeout(resolve, 400));
              }
            }
            saved.add(feed.id);
            if (!campusRef.current.some((entry) => entry.id === feed.id)) {
              await removeImportedCalendar(feed.id);
              archived.add(feed.id);
            }
            calendar.releaseImport(feed.id);
          }
          for (const feed of removed) {
            await removeImportedCalendar(feed.id);
            archived.add(feed.id);
            calendar.releaseImport(feed.id);
          }
          await calendar.refresh();
        } catch (err) {
          for (const feed of added) {
            calendar.releaseImport(feed.id);
            if (saved.has(feed.id) || !campusRef.current.some((entry) => entry.id === feed.id)) continue;
            calendar.hideImport(feed.id);
            campusRef.current = campusRef.current.filter((entry) => entry.id !== feed.id);
          }
          setCampusCalendarFeeds(campusRef.current);
          for (const feed of removed) {
            if (archived.has(feed.id)) continue;
            restoreFeed(feed.id, feed.snapshot);
          }
          await calendar.refresh();
          setNotice(err instanceof Error ? err.message : "Unable to update your UWaterloo event subscriptions.");
        } finally {
          flushCalendarPreferencesRef.current?.({ campusCalendars: campusRef.current });
        }
      });
      return Promise.resolve();
    },
    [calendar, disconnectFeed, enqueueCampus, newCalendarsShown, restoreFeed],
  );

  const campusSplitAttempts = useRef(0);
  const { refresh: refreshItems, hydrated } = calendar;

  useEffect(() => {
    if (!hydrated || !preferencesLoaded || campusRestoreDoneRef.current || campusRestoreBusyRef.current) return;
    const restore = campusRestoreRef.current;
    if (!restore) return;
    const finish = () => {
      setColorOverrides((current) => colorOverridesWithCampusSubscriptions(current, restore));
      campusRestoreDoneRef.current = true;
      campusRestoreRef.current = null;
      campusRestoreBusyRef.current = false;
    };
    if (!campusSubscriptionsMatch(campusCalendarFeeds, restore)) {
      campusRestoreBusyRef.current = true;
      void subscribeCampus(
        restore.map((sub) => ({ id: sub.categoryId, label: campusCategoryLabel(sub.categoryId) })),
        { quiet: true },
      ).then(finish, () => {
        campusRestoreBusyRef.current = false;
      });
      return;
    }
    finish();
  }, [hydrated, preferencesLoaded, campusCalendarFeeds, subscribeCampus]);

  useEffect(() => {
    if (!hydrated || !preferencesLoaded || campusSplitAttempts.current >= 2) return;
    const needsSplit = campusCalendarFeeds.some((calendar) => (campusFeedCategories(calendar.url)?.length ?? 0) > 1);
    const needsRename = campusCalendarFeeds.some((calendar) => {
      const categories = campusFeedCategories(calendar.url);
      return categories?.length === 1 && isDefaultCampusCalendarName(calendar.name) && calendar.name !== campusCategoryLabel(categories[0]);
    });
    if (!needsSplit && !needsRename) return;
    campusSplitAttempts.current += 1;
    const wanted = new Map<string, string>();
    for (const calendar of campusCalendarFeeds) {
      for (const id of campusFeedCategories(calendar.url) ?? []) wanted.set(id, campusCategoryLabel(id));
    }
    if (needsSplit) setNotice("UWaterloo Events now has one calendar per category.");
    void subscribeCampus([...wanted].map(([id, label]) => ({ id, label })), { quiet: true });
  }, [hydrated, preferencesLoaded, campusCalendarFeeds, subscribeCampus]);

  //scrapedAt is the notification. open and coming back compare it; a match leaves the calendars alone.
  const [campusSyncNonce, setCampusSyncNonce] = useState(0);
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") setCampusSyncNonce((nonce) => nonce + 1);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  const campusSyncKey = campusCalendars.map((entry) => `${entry.calendar.id}\0${entry.calendar.url}`).join("\n");
  useEffect(() => {
    if (!hydrated || !preferencesLoaded || campusCalendars.length === 0) return;
    //a combined feed is about to be split, and that split syncs the new calendars
    if (campusCalendars.some((entry) => entry.categories.length !== 1)) return;
    const feeds = campusCalendars.map((entry) => entry.calendar);
    const categoriesOf = new Map(campusCalendars.map((entry) => [entry.calendar.id, entry.categories]));
    const controller = new AbortController();
    let cancelled = false;
    const catchUp = async () => {
      if (campusBusy.current) {
        await campusChain.current.catch(() => undefined);
        if (cancelled || campusBusy.current) return;
      }
      const server = await fetchCampusScrapeAt();
      if (cancelled || campusBusy.current || !campusScrapeIsNewer(server, readAppliedCampusScrape())) return;
      const changed: CampusSyncCalendar[] = [];
      const result = await syncCampusCalendars(
        feeds.flatMap((calendar) => {
          const categories = categoriesOf.get(calendar.id) ?? [];
          return categories.length === 1 ? [{ feedId: calendar.id, categories }] : [];
        }),
        timeZone(),
        async (calendar) => {
          if (calendar.added === 0 && calendar.updated === 0 && calendar.removed === 0) return;
          changed.push(calendar);
          runRulesAfterSync(calendar.feedId as ImportedCalendarSource);
          await refreshItems();
        },
        controller.signal,
      );
      writeAppliedCampusScrape(result.updatedAt);
      if (cancelled || changed.length === 0) return;
      const notes = changed.map((calendar) => {
        const name = feeds.find((feed) => feed.id === calendar.feedId)?.name ?? "UWaterloo Events";
        return formatFeedSyncSummary(name, calendar);
      });
      setNotice(notes.length === 1 ? notes[0] : `UWaterloo Events updated (${notes.length} calendars).`);
    };
    void (async () => {
      for (let attempt = 0; attempt < 2 && !cancelled; attempt++) {
        try {
          await catchUp();
          return;
        } catch (err) {
          //the calendar the user just turned on may be using the only import slot
          if (cancelled || controller.signal.aborted || !importAlreadyRunning(err) || attempt === 1) return;
          await new Promise((resolve) => setTimeout(resolve, 1000));
          if (cancelled) return;
          await campusChain.current.catch(() => undefined);
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [hydrated, preferencesLoaded, campusSyncKey, campusSyncNonce, campusCalendars, refreshItems]);

  useEffect(() => {
    let cancelled = false;
    googleRelinkRef.current = false;
    void getGoogleCalendarStatus()
      .then((status) => {
        if (!cancelled && !googleRelinkRef.current) setGoogleConnected(status.connected);
      })
      .catch(() => {
        if (!cancelled) setGoogleConnected(false);
      });
    return () => {
      cancelled = true;
    };
  }, [googleVersion]);

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
      overlayEvents.map((event) => ({
        ...event,
        calendarColor: colorOverrides[event.calendarId] || event.calendarColor || colors.google,
      })),
    [overlayEvents, colorOverrides, colors.google],
  );

  const smartTagSamples = useMemo<SmartTagTarget[]>(
    () => [
      ...calendar.displayItems.map((item) => ({
        calendarId: item.calendar.importSource
          ? externalCalendarId(item.calendar.importSource)
          : localCalendarIdOf(item.calendar) ?? "events",
        title: item.title,
        location: item.calendar.location,
        description: item.calendar.description,
      })),
      ...overlayEvents.map((event) => ({
        calendarId: event.calendarId,
        title: event.title,
        location: event.location,
        description: event.description,
      })),
    ],
    [calendar.displayItems, overlayEvents],
  );

  //every event, each merged duplicate once, that a keyword rule or a late deadline could turn into a task
  const mergedTaskItems = useMemo(
    () =>
      mergeTimeline(
        [
          ...itemsForUi
            .filter((item) => item.calendar.kind === "event" && !item.pendingApproval && !item.editorDraft && itemOnMainCalendar(item.calendar.importSource, spaceOnlyFeeds))
            .map(timelineItemOf),
          ...shownOverlayEvents.map(overlayTimelineItemOf),
        ],
        mergedCalendars,
        feedsForMerge,
      ),
    [itemsForUi, shownOverlayEvents, mergedCalendars, feedsForMerge, spaceOnlyFeeds],
  );
  const keywordTaskSources = useMemo<KeywordTaskSource[]>(
    () =>
      mergedTaskItems.flatMap((item): KeywordTaskSource[] => {
        const calendarId = item.kind === "gcal_event" ? item.google?.calendarId : timelineItemCalendarId(item);
        if (!calendarId) return [];
        return [{
          key: item.id,
          calendarId,
          mergedCalendarId: item.mergedCalendarId,
          title: item.title,
          startUTC: item.startUTC,
          endUTC: item.endUTC,
          allDay: item.allDay,
          location: item.location ?? item.google?.location,
          description: item.description ?? item.google?.description,
        }];
      }),
    [mergedTaskItems],
  );
  const derivedKeywordTasks = useMemo(() => keywordTasksOf(keywordTasks, keywordTaskSources), [keywordTasks, keywordTaskSources]);
  const deadlineTasks = useMemo(() => {
    if (keywordTasks.includeDeadlines === false) return [];
    const sources = bottomDeadlines(mergedTaskItems, feedsForMerge).flatMap((item): KeywordTaskSource[] => {
      const calendarId = item.kind === "gcal_event" ? item.google?.calendarId : timelineItemCalendarId(item);
      if (!calendarId) return [];
      return [{
        key: item.id,
        calendarId,
        mergedCalendarId: item.mergedCalendarId,
        title: item.title,
        startUTC: item.startUTC,
        endUTC: item.endUTC,
        allDay: false,
        location: item.location ?? item.google?.location,
        description: item.description ?? item.google?.description,
      }];
    });
    const seen = new Set(derivedKeywordTasks.map((task) => task.key));
    return deadlineTasksOf(sources, keywordTasks.doneKeys).filter((task) => !seen.has(task.key));
  }, [mergedTaskItems, feedsForMerge, derivedKeywordTasks, keywordTasks.doneKeys, keywordTasks.includeDeadlines]);
  const listedTasks = useMemo(() => {
    const claimed = new Set([...derivedKeywordTasks, ...deadlineTasks].map((task) => task.key));
    const fromTags = smartTagTasksOf(taskSmartTags, keywordTaskSources, keywordTasks.doneKeys, claimed);
    return withTaskTags(
      dedupeSchoolAssignmentTasks([...derivedKeywordTasks, ...deadlineTasks, ...fromTags].sort((a, b) => a.dueUTC - b.dueUTC || a.title.localeCompare(b.title))),
      taskSmartTags,
    );
  }, [derivedKeywordTasks, deadlineTasks, taskSmartTags, keywordTaskSources, keywordTasks.doneKeys]);
  const taskTagMatcher = useMemo(() => compileSmartTags(taskSmartTags), [taskSmartTags]);
  const tagForTaskItem = useCallback((item: CalendarItemDoc) => taskTagMatcher({
    calendarId: item.calendar.importSource
      ? externalCalendarId(item.calendar.importSource)
      : localCalendarIdOf(item.calendar) ?? "events",
    title: item.title,
    location: item.calendar.location,
    description: item.calendar.description,
  }), [taskTagMatcher]);
  const taskTagSamples = useMemo<SmartTagTarget[]>(
    () => [
      ...keywordTaskSources.map((source) => ({
        calendarId: source.calendarId,
        title: source.title,
        location: source.location,
        description: source.description,
      })),
      ...itemsForUi
        .filter((item) => item.calendar.kind === "task" && !item.editorDraft)
        .map((item) => ({
          calendarId: item.calendar.importSource
            ? externalCalendarId(item.calendar.importSource)
            : localCalendarIdOf(item.calendar) ?? "events",
          title: item.title,
          location: item.calendar.location,
          description: item.calendar.description,
        })),
    ],
    [keywordTaskSources, itemsForUi],
  );
  const keywordTaskCalendars = useMemo<KeywordTaskCalendarOption[]>(
    () => [
      ...sideExternalCalendars.map((calendar) => ({
        id: calendar.id,
        name: calendar.name,
        group: "Imported" as const,
      })),
      ...sideCampusCalendars.map((calendar) => ({
        id: calendar.id,
        name: calendar.name,
        group: "UWaterloo Events" as const,
      })),
      ...sidebarCalendars
        .filter((calendar) => !isExcludedGoogleCalendarName(calendar.name))
        .map((calendar) => ({ id: calendar.id, name: calendar.name, group: "Google" as const })),
      ...shownCalendars
        .filter((calendar) => calendar.kind === "event")
        .map((calendar) => ({ id: calendar.id, name: calendar.name, group: "WatAgent" as const })),
    ],
    [sideExternalCalendars, sideCampusCalendars, sidebarCalendars, shownCalendars],
  );
  const taskDueById = useMemo(() => {
    const due = new Map<string, number>();
    for (const task of listedTasks) due.set(task.key, task.dueUTC);
    return due;
  }, [listedTasks]);
  const keywordTaskCalendarName = useCallback(
    (id: string) => keywordTaskCalendars.find((calendar) => calendar.id === id)?.name ?? "Calendar",
    [keywordTaskCalendars],
  );

  function toggleNav() {
    setNavCollapsed((current) => !current);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const google = params.get("google");
    if (!google) return;
    setNotice(google === "connected" ? "Google Calendar connected." : "Google Calendar could not be connected.");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const timelineFor = useCallback(
    (date: Date, filter: CalendarSourceFilter) => {
      const filterGroups = calendarGroupsOf(filter.groups);
      const googleShown = filter.google && filterGroups.other;
      return pinListedDues(pinBottomDeadlines(mergeTimeline(aggregateTimeline({
        focus: date,
        events: itemsForUi.filter((item) => {
          //shortcut feeds stay off main. a quick display shows only the calendars it picked
          if (viewingDisplay) return itemInCalendarSpace(item.calendar, viewingDisplay, mergedCalendars);
          return itemOnMainCalendar(item.calendar.importSource, spaceOnlyFeeds)
            && calendarItemVisible(item, filter, mergedCalendars, campusSources);
        }),
        busyBlocks: viewingDisplay || !googleShown || shownOverlayEvents.length > 0 ? [] : busyBlocks,
        overlayEvents: shownOverlayEvents.filter((event) => {
          if (viewingDisplay) return overlayInCalendarSpace(event.calendarId, viewingDisplay);
          if (filterGroups.hidden && filter.hiddenIds.includes(event.calendarId)) return true;
          return googleShown && !isSidebarHidden(filter, event.calendarId) && !filter.mutedGoogleIds.includes(event.calendarId);
        }),
      }), mergedCalendars, feedsForMerge), date, feedsForMerge), taskDueById, date).map((item) => {
        const swatch = (calendarId: string, importSource?: string) => {
          //a shortcut color paints this view only
          const shortcut = viewingDisplay?.colorOverrides[calendarId];
          if (shortcut) return shortcut;
          if (importSource) {
            const categoryId = campusCategoryByFeedId.get(importSource);
            if (categoryId) {
              const stable = colorOverrides[campusColorKey(categoryId)];
              if (stable) return stable;
            }
          }
          return calendarSwatchColor(calendarId, colors, colorOverrides);
        };
        return {
          ...item,
          calendarColor: item.importSource
            ? swatch(item.mergedCalendarId ?? externalCalendarId(item.importSource), item.importSource)
            : item.calendarId
              ? swatch(item.calendarId)
              : colors.event,
        };
      });
    },
    [itemsForUi, busyBlocks, shownOverlayEvents, mergedCalendars, feedsForMerge, campusSources, campusCategoryByFeedId, colorOverrides, colors, viewingDisplay, spaceOnlyFeeds, taskDueById],
  );

  const displayTagMatcher = useMemo(() => {
    if (!viewingDisplay) return smartTagMatcher;
    //shortcut tags paint this view only. the calendar's own tags stay underneath
    const local = compileSmartTags(viewingDisplay.smartTags);
    return (target: SmartTagTarget) => local(target) ?? smartTagMatcher(target);
  }, [viewingDisplay, smartTagMatcher]);

  const itemsForDay = useCallback(
    (date: Date) => applySmartTags(timelineFor(date, sources), displayTagMatcher),
    [timelineFor, sources, displayTagMatcher],
  );

  const dayItems = useMemo(() => itemsForDay(focus), [itemsForDay, focus]);

  const timelineDigest = useMemo(
    () =>
      timelineFor(focus, ALL_SOURCES)
        //calendars whose Map link to the Agent was deleted stay out of what the Agent is sent
        .filter((item) => {
          if (item.kind === "gcal_event" || item.kind === "gcal_busy") return !isAgentCalendarHidden(agentHiddenCalendarIds, "google");
          const id = timelineItemCalendarId(item);
          return !id || !isAgentCalendarHidden(agentHiddenCalendarIds, id);
        })
        .slice(0, 80)
        .map((item) => {
          const when = item.pinned
            ? `due ${formatTime(item.pinnedDueUTC ?? item.startUTC)}`
            : item.allDay ? "all-day" : `${formatTime(item.startUTC)}–${formatTime(item.endUTC)}`;
          if (item.kind === "gcal_event" || item.kind === "gcal_busy") {
            const where = item.google?.location ? ` @ ${item.google.location}` : "";
            const calendarName = item.google?.calendarName ? ` [${item.google.calendarName}]` : "";
            return `- ${item.kind} "${item.title}" ${when}${where}${calendarName} (read-only Google calendar)`;
          }
          const ownedId = localCalendarIdOf({
            kind: item.kind === "task" ? "task" : "event",
            startUTC: item.startUTC,
            endUTC: item.endUTC,
            allDay: item.allDay,
            importSource: item.importSource,
            calendarId: item.calendarId,
          });
          const calendarName = ownedId
            ? shownCalendars.find((calendar) => calendar.id === ownedId)?.name
              ?? (ownedId === "events" ? PRIMARY_EVENT_CALENDAR_NAME : ownedId)
            : "";
          const calendar = ownedId ? ` calendar=${ownedId} "${calendarName.replace(/"/g, "")}"` : "";
          const done = item.kind === "task" ? ` completed=${item.completed ? "true" : "false"}` : "";
          const where = item.location ? ` @ ${item.location}` : "";
          const about = item.description ? ` — ${item.description.replace(/\s+/g, " ").slice(0, 140)}` : "";
          return `- ${item.kind} id=${item.id}${calendar} "${item.title}" ${when}${where}${about}${done}`;
        })
        .join("\n")
        .slice(0, 12_000),
    [timelineFor, focus, shownCalendars, agentHiddenCalendarIds],
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
    if (googleConnected === false) {
      googlePullRef.current = async () => null;
      return;
    }
    if (seenGoogleVersionRef.current !== googleVersion) {
      seenGoogleVersionRef.current = googleVersion;
      coveredRef.current = [];
    }
    const desired = googleFetchRange(focus, shownView, weekStartsOn);
    const key = `${desired.rangeStartUTC}:${desired.rangeEndUTC}`;
    async function pull(): Promise<number | null> {
      const gen = (pullGenRef.current.get(key) ?? 0) + 1;
      pullGenRef.current.set(key, gen);
      const chunks = googleSyncChunks(desired);
      let lastSyncedAt: number | null = null;
      for (const chunk of chunks) {
        if (!mountedRef.current || pullGenRef.current.get(key) !== gen) return null;
        let pulled: Awaited<ReturnType<typeof syncFromGoogle>>;
        try {
          pulled = await syncFromGoogle(chunk);
        } catch (err) {
          if (
            err instanceof ApiError &&
            err.status === 409 &&
            err.message === "Google Calendar needs to be linked again."
          ) {
            googleRelinkRef.current = true;
            setGoogleConnected(false);
            setNotice("Google Calendar needs to be linked again.");
            return null;
          }
          throw err;
        }
        if (!mountedRef.current || pullGenRef.current.get(key) !== gen) return null;
        setBusyBlocks((prev) =>
          mergeTimed(prev, pulled.busyBlocks, chunk, (block) => `${block.startUTC}:${block.endUTC}`),
        );
        setOverlayEvents((prev) => mergeTimed(prev, pulled.overlayEvents, chunk, (event) => event.id));
        if (pulled.calendars.length > 0) {
          setGoogleCalendars(
            pulled.calendars.filter((calendar) => !isExcludedGoogleCalendarName(calendar.name)),
          );
        }
        const now = Date.now();
        coveredRef.current = [
          ...coveredRef.current.filter((entry) => now - entry.at < GOOGLE_POLL_MS),
          { start: chunk.rangeStartUTC, end: chunk.rangeEndUTC, at: now },
        ];
        lastSyncedAt = pulled.lastSyncedAt;
      }
      if (lastSyncedAt != null) setGoogleSyncedAt(lastSyncedAt);
      return lastSyncedAt;
    }
    googlePullRef.current = pull;
    if (!googleSyncDesiredFresh(coveredRef.current, desired, Date.now())) {
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
  }, [focus, shownView, weekStartsOn, syncFromGoogle, googleVersion, googleConnected]);

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
    if (chatOpen && !restriction && calendar.chats.length === 0) createChat();
  }, [chatOpen, calendar.chats.length, createChat, restriction]);

  useEffect(() => {
    if (!chatOpen) pruneEmptyChats();
  }, [chatOpen, pruneEmptyChats]);

  const pendingCount = calendar.pendingChanges.length;
  const pendingSeen = useRef(0);
  useEffect(() => {
    if (pendingCount > pendingSeen.current) setChatOpen(true);
    pendingSeen.current = pendingCount;
  }, [pendingCount]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable ||
          target.closest("[data-calendar-popover]"))
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      //shortcuts shouldn't reshuffle the calendar behind an open dialog
      if (document.querySelector('[aria-modal="true"]')) return;
      const key = event.key.toLowerCase();
      if (key === "t") setFocus(startOfLocalDay(new Date()));
      if (key === "d") changeView("day");
      if (key === "w") changeView("week");
      if (key === "5") changeView("workweek");
      if (key === "m") changeView("month");
      if (key === "y") changeView("year");
      if (event.key === "ArrowLeft") setFocus((current) => shiftFocus(current, shownView, -1));
      if (event.key === "ArrowRight") setFocus((current) => shiftFocus(current, shownView, 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shownView, changeView]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function currentMessages(): ChatMessage[] {
    return calendar.activeChatRef()?.messages ?? [];
  }

  function onOpenItem(item: TimelineItem, anchor?: DOMRect) {
    if (item.editorDraft) return;
    //a quick display can check off a task. everything else is changed on calendar
    if (viewingDisplay) {
      if (item.kind === "task" || item.kind === "gcal_busy") return;
      setDraft(null);
      setGooglePeek({
        item,
        anchor: anchor ?? new DOMRect(window.innerWidth / 2 - 180, 96, 0, 0),
      });
      return;
    }
    if (item.kind === "task" && isTimelineItemReadOnly(item)) return;
    if (item.kind === "gcal_busy") return;
    if (item.pendingApproval || item.kind === "gcal_event" || item.kind === "event") {
      setDraft(null);
      setGooglePeek({
        item,
        anchor: anchor ?? new DOMRect(window.innerWidth / 2 - 180, 96, 0, 0),
      });
      return;
    }
    const existing = calendar.items.find((row) => row.id === item.id);
    if (existing) setDraft(draftFromMeta(existing.id, existing.title, existing.calendar));
  }

  const openItemRef = useRef(onOpenItem);
  openItemRef.current = onOpenItem;
  const revealRef = useRef<{ id: string; startUTC: number; triedDay: boolean } | null>(null);
  const [revealSerial, setRevealSerial] = useState(0);

  function revealPending(change: PendingAiChange) {
    const meta = change.calendar ?? change.previousCalendar;
    if (!meta) return;
    revealRef.current = { id: change.sourceId, startUTC: meta.startUTC, triedDay: false };
    setSection("calendar");
    setActiveCalendarSpaceId(MAIN_CALENDAR_SPACE_ID);
    setFocus(startOfLocalDay(new Date(meta.startUTC)));
    if (view === "year") setView("day");
    setRevealSerial((n) => n + 1);
  }

  useEffect(() => {
    const target = revealRef.current;
    if (!target || section !== "calendar") return;
    let cancelled = false;
    let timer = 0;
    let stage: HTMLElement | null = null;
    let done = () => {};
    const frame = requestAnimationFrame(() => {
      if (cancelled) return;
      const node = document.querySelector(`[data-calendar-item="${CSS.escape(target.id)}"]`);
      if (!(node instanceof HTMLElement)) {
        if (shownView !== "day" && !target.triedDay) {
          target.triedDay = true;
          changeView("day");
          return;
        }
        if (shownView !== "day") return;
        setNotice("That change isn't on the calendar.");
        revealRef.current = null;
        return;
      }
      const item = itemsForDay(startOfLocalDay(new Date(target.startUTC))).find((row) => row.id === target.id);
      if (!item) {
        revealRef.current = null;
        return;
      }
      const boundsHost = node.closest(".calendar-stage");
      const bounds = boundsHost instanceof HTMLElement
        ? boundsHost.getBoundingClientRect()
        : new DOMRect(0, 0, window.innerWidth, window.innerHeight);
      const rect = node.getBoundingClientRect();
      const inView = rect.height > 0
        && rect.top >= bounds.top - 1
        && rect.bottom <= bounds.bottom + 1
        && rect.left >= bounds.left - 1
        && rect.right <= bounds.right + 1;
      done = () => {
        if (cancelled || revealRef.current !== target) return;
        revealRef.current = null;
        openItemRef.current(item, node.getBoundingClientRect());
      };
      if (inView) {
        done();
        return;
      }
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      node.scrollIntoView({ block: "center", inline: "nearest", behavior: reduce ? "auto" : "smooth" });
      if (boundsHost instanceof HTMLElement) {
        stage = boundsHost;
        stage.addEventListener("scrollend", done, { once: true });
      }
      timer = window.setTimeout(done, reduce ? 40 : 420);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      stage?.removeEventListener("scrollend", done);
    };
  }, [revealSerial, section, shownView, changeView, focus, itemsForDay]);

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

  function createLocalCalendar(name: string) {
    const created = newLocalCalendar(name);
    const used = new Set(Object.values(colorOverrides));
    const color = CALENDAR_PALETTE.find((option) => !used.has(option) && option !== colors.event && option !== colors.task)
      ?? CALENDAR_PALETTE[localCalendars.length % CALENDAR_PALETTE.length];
    setColorOverrides((overrides) => ({ ...overrides, [created.id]: color }));
    setLocalCalendars((list) => [...list, created]);
    setSources((current) => withNewCalendar(current, created.id, newCalendarsShown));
    setNotice(newCalendarsShown ? `Created ${created.name}.` : `Created ${created.name}. It starts hidden; show it from the side panel or Configuration.`);
  }

  function renameLocalCalendar(id: string, name: string) {
    if (isBuiltinLocalCalendarId(id)) return;
    setLocalCalendars((list) => {
      //a built-in that came back after deletion is shown but not stored; store it with its new name
      const base = list.some((entry) => entry.id === id)
        ? list
        : [...BUILTIN_CALENDARS.filter((entry) => entry.id === id), ...list];
      return base.map((entry) => (entry.id === id ? { ...entry, name: name.trim().slice(0, 60) } : entry));
    });
  }

  async function deleteLocalCalendar(id: string) {
    if (isBuiltinLocalCalendarId(id)) return;
    const name = shownCalendars.find((entry) => entry.id === id)?.name ?? "Calendar";
    const ids = calendar.items.filter((item) => localCalendarIdOf(item.calendar) === id).map((item) => item.id);
    const failed = await calendar.removeMany(ids);
    if (failed > 0) {
      throw new Error(`${failed} of ${ids.length} items in ${name} could not be deleted, so the calendar was kept. Try again.`);
    }
    setLocalCalendars((list) => list.filter((entry) => entry.id !== id));
    setSources((current) => ({
      ...current,
      mutedGoogleIds: current.mutedGoogleIds.filter((entry) => entry !== id),
      hiddenIds: current.hiddenIds.filter((entry) => entry !== id),
      readOnlyCalendarIds: current.readOnlyCalendarIds.filter((entry) => entry !== id),
      ...(id === "events" ? { events: true } : {}),
    }));
    if (id.startsWith("cal-")) {
      setColorOverrides((overrides) => {
        const next = { ...overrides };
        delete next[id];
        return next;
      });
    }
    setNotice(ids.length ? `Deleted ${name} and its ${ids.length} item${ids.length === 1 ? "" : "s"}.` : `Deleted ${name}.`);
  }

  function confirmItemDelete() {
    const target = itemDelete;
    if (!target) return;
    setItemDelete(null);
    setDraft(null);
    setGooglePeek(null);
    calendar.remove(target.id);
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

  function saveDraft(draft: CalendarDraft) {
    if (isCalendarReadOnly(sources, calendarIdForDraft(draft, calendar.items, localCalendars))) {
      setNotice("This calendar is read-only.");
      return;
    }
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
    const location = draft.location?.replace(/\s+/g, " ").trim().slice(0, 300) || undefined;
    const description = draft.description?.replace(/\r\n/g, "\n").trim().slice(0, 4000) || undefined;
    const calendarMeta: CalendarItemMeta = {
      kind: draft.kind,
      startUTC: draft.startUTC,
      endUTC: draft.endUTC,
      allDay: draft.allDay,
      completed: draft.kind === "task" ? Boolean(draft.completed) : undefined,
      calendarId: calendarIdField(draft.calendarId ?? defaultEventCalendarId(localCalendars)),
      ...(location ? { location } : {}),
      ...(description ? { description } : {}),
    };
    if (location) rememberPlace(location);
    const pending = draft;
    setDraft(null);
    calendar.upsert({
      id: pending.id,
      title: pending.title.trim() || (pending.kind === "task" ? "Task" : "Event"),
      calendar: calendarMeta,
    });
    if (viewingDisplay && !itemInCalendarSpace(calendarMeta, viewingDisplay)) {
      setNotice(`Saved on Calendar. ${viewingDisplay.name} only shows the calendars you picked.`);
    }
  }

  async function handleSend(payload: SendPayload) {
    if (busy || restriction) return;
    const existing = currentMessages();
    let text = payload.text.trim();
    let calendarIds = attachedIdsOf(payload.calendarIds);
    let history = existing;
    let reuseUser = false;
    if (payload.branch?.kind === "edit") {
      const index = existing.findIndex((message) => message.id === payload.branch?.messageId);
      const target = existing[index];
      if (!target || target.role !== "user" || (!text && !calendarIds?.length)) return;
      history = existing.slice(0, index);
    } else if (payload.branch?.kind === "regenerate") {
      const index = existing.findIndex((message) => message.id === payload.branch?.messageId);
      const target = existing[index];
      if (!target || target.role !== "assistant") return;
      const prior = existing.slice(0, index);
      const priorUser = [...prior].reverse().find((message) => message.role === "user");
      text = priorUser?.content.trim() ?? "";
      calendarIds = attachedIdsOf(priorUser?.calendarIds);
      if (!text && !calendarIds?.length) return;
      history = prior;
      reuseUser = true;
    } else if (!text && !calendarIds?.length) {
      return;
    }

    const userMessage: ChatMessage = {
      id: uid("msg"),
      role: "user",
      content: text.slice(0, 20_000),
      createdAt: Date.now(),
      calendarIds,
    };
    const assistantId = uid("msg");
    const visible = reuseUser ? history : [...history, userMessage];
    const parts: ActivityPart[] = [
      { kind: "thought", thought: { id: uid("thought"), text: "", startedAt: Date.now() } },
    ];
    calendar.setChatMessages([
      ...visible,
      { id: assistantId, role: "assistant", content: "", createdAt: Date.now(), activity: cloneActivity(parts) },
    ]);
    const chatId = calendar.activeChatRef()?.id ?? null;
    const nameAfterReply =
      calendar.activeChatRef()?.titleSource !== "user" &&
      !history.some((message) => message.role === "assistant" && message.content.trim());
    window.clearTimeout(settleTimerRef.current);
    setSettlingAssistantId(null);
    setHoldLabel(null);
    setStreamingAssistantId(assistantId);
    setBusy(true);
    setError(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const bounds = localDayBounds(focus);

    let assistantText = "";
    let announcedTool = "";
    let nameThisChat = false;
    let replaceNext = false;
    const THOUGHT_CAP = 16_000;

    function thoughtTextLength(): number {
      return parts.reduce((sum, part) => sum + (part.kind === "thought" ? part.thought.text.length : 0), 0);
    }

    function closeThought() {
      const last = parts[parts.length - 1];
      if (!last || last.kind !== "thought" || last.thought.seconds != null) return;
      const elapsed = Date.now() - last.thought.startedAt;
      last.thought.seconds = Math.max(1, Math.round(elapsed / 1000));
      if (!last.thought.text.trim()) parts.pop();
    }

    function appendThought(chunk: string) {
      if (!chunk || thoughtTextLength() >= THOUGHT_CAP) return;
      let last = parts[parts.length - 1];
      if (!last || last.kind !== "thought" || last.thought.seconds != null) {
        const thought: ThoughtSegment = { id: uid("thought"), text: "", startedAt: Date.now() };
        parts.push({ kind: "thought", thought });
        last = parts[parts.length - 1];
      }
      if (!last || last.kind !== "thought") return;
      const room = THOUGHT_CAP - thoughtTextLength();
      last.thought.text += chunk.slice(0, room);
    }

    function toolEvents(): ToolEventRecord[] {
      return parts.flatMap((part) => (part.kind === "tools" ? part.events : []));
    }

    function toolGroup(): Extract<ActivityPart, { kind: "tools" }> {
      closeThought();
      const last = parts[parts.length - 1];
      if (last?.kind === "tools") return last;
      const group: Extract<ActivityPart, { kind: "tools" }> = { kind: "tools", events: [] };
      parts.push(group);
      return group;
    }

    const writeAssistant = () => {
      const activity = cloneActivity(parts);
      calendar.setChatMessages(
        currentMessages().map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: assistantText,
                activity: activity.length > 0 ? activity : undefined,
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
          effort: payload.effort,
          attachedCalendarIds: [...visible].reverse().find((message) => message.role === "user")?.calendarIds,
          messages: visible
            .filter((message) => message.content.trim() || (message.role === "user" && (message.calendarIds?.length ?? 0) > 0))
            .slice(-80)
            .map((message) => ({
              role: message.role,
              content:
                message.role === "user"
                  ? textForModel(message.content, (id) => mentionCalendars.find((calendar) => calendar.id === id)?.name ?? "calendar") ||
                    "Use the attached calendar."
                  : message.content.trim() || "Use the attached calendar.",
            })),
        }),
      });
      if (!res.ok) throw await errorFromResponse(res, "An unexpected error occurred");
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
          if (event.type === "reasoning-reset") {
            for (let index = parts.length - 1; index >= 0; index -= 1) {
              const part = parts[index];
              if (part.kind === "thought" && part.thought.seconds == null) parts.splice(index, 1);
            }
            schedule();
            return;
          }
          if (event.type === "content-reset") {
            //keep the current text until the replacement arrives, so the bubble does not flash empty
            replaceNext = true;
            return;
          }
          if (event.type === "content") {
            closeThought();
            if (replaceNext) {
              assistantText = event.content;
              replaceNext = false;
              if (rafId) cancelAnimationFrame(rafId);
              rafId = 0;
              writeAssistant();
              setHoldLabel(null);
              window.clearTimeout(settleTimerRef.current);
              setSettlingAssistantId(assistantId);
              settleTimerRef.current = window.setTimeout(() => {
                setSettlingAssistantId((current) => (current === assistantId ? null : current));
              }, 240);
              return;
            }
            assistantText += event.content;
            schedule();
            return;
          }
          if (event.type === "reasoning") {
            const chunk = event.content;
            const open = [...parts].reverse().find((part) => part.kind === "thought" && part.thought.seconds == null);
            const current = open?.kind === "thought" ? open.thought.text : "";
            if (current && chunk.startsWith(current)) {
              if (open?.kind === "thought") open.thought.text = chunk.slice(0, THOUGHT_CAP);
            } else appendThought(chunk);
            schedule();
            return;
          }
          if (event.type === "status") {
            //matches OUTPUT_HOLD_LABEL from the guarded loop. the reply stays in progress until the stream closes.
            if (event.label === "Finishing up…") {
              setHoldLabel(event.label);
              return;
            }
            announcedTool = event.label;
            return;
          }
          if (event.state === "calling") {
            const callLabel = event.callLabel || announcedTool;
            announcedTool = "";
            const events = toolEvents();
            const duplicate =
              event.name === "list_calendar_items" &&
              events.some((entry) => entry.tool === event.name && entry.callLabel === callLabel);
            if (!duplicate) {
              toolGroup().events.push({
                id: uid("tool"),
                tool: event.name,
                state: "calling",
                callLabel: callLabel || undefined,
              });
            }
          } else {
            const pending = [...toolEvents()]
              .reverse()
              .find((entry) => entry.tool === event.name && entry.state === "calling");
            if (pending) {
              pending.state = event.state;
              pending.callLabel = event.callLabel || pending.callLabel;
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
      if (replaceNext) assistantText = "";
      if (!controller.signal.aborted) {
        writeAssistant();
        if (assistantText.trim()) nameThisChat = true;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (err instanceof AccessError && err.code === "ai_restricted") {
        setRestriction({ message: err.message, reason: err.reason });
        return;
      }
      if (err instanceof AccessError) return;
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      closeThought();
      writeAssistant();
      //the stream stays open through the output check, so this is the first finished state
      setHoldLabel(null);
      setBusy(false);
      setStreamingAssistantId(null);
      calendar.persistActiveChat();
      if (nameThisChat && nameAfterReply && chatId) {
        const userText =
          textForModel(text, (id) => mentionCalendars.find((calendar) => calendar.id === id)?.name ?? "calendar") ||
          "Attached calendar";
        void requestChatTitle(userText, assistantText).then((title) => {
          if (title) calendar.applyAutoTitle(chatId, title);
        });
      }
    }
  }

  const spaceCalendarChoices = useMemo<SpaceCalendarChoice[]>(() => [
    ...shownCalendars.map((entry) => ({
      id: entry.id,
      name: entry.name,
      color: calendarSwatchColor(entry.id, colors, colorOverrides),
      group: "WatAgent" as const,
    })),
    ...sideExternalCalendars.map((entry) => ({
      id: entry.id,
      name: entry.name,
      color: calendarSwatchColor(entry.id, colors, colorOverrides),
      group: "Imported" as const,
    })),
    ...sideCampusCalendars.map((entry) => ({
      id: entry.id,
      name: entry.name,
      color: calendarSwatchColor(entry.id, colors, colorOverrides),
      group: "UWaterloo Events" as const,
    })),
    ...sidebarCalendars
      .filter((entry) => !isExcludedGoogleCalendarName(entry.name))
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        color: colorOverrides[entry.id] || entry.color || colors.google,
        group: "Google" as const,
      })),
  ], [shownCalendars, sideExternalCalendars, sideCampusCalendars, sidebarCalendars, colors, colorOverrides]);

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
      <SideNav
        section={section}
        collapsed={navCollapsed}
        onSection={(next) => {
          if (next === "displays") setOpenDisplayId(null);
          setSection(next);
        }}
        onToggle={toggleNav}
        advanced={advancedView}
      >
        <CalendarSidePanel
          variant={section === "tasks" ? "tasks" : "calendar"}
          focus={focus}
          view={shownView}
          weekStartsOn={weekStartsOn}
          onFocus={(date) => {
            setFocus(date);
            if (shownView === "year") changeView("day");
          }}
          sources={sources}
          onSources={setSources}
          colors={colors}
          onColors={setColors}
          externalCalendars={sideExternalCalendars}
          campusCalendars={sideCampusCalendars}
          onRenameExternal={renameExternal}
          onRefreshCalendars={() => calendar.refresh()}
          onSyncGoogle={() => googlePullRef.current()}
          onNotice={setNotice}
          onRemoveExternal={removeImported}
          googleCalendars={sidebarCalendars}
          colorOverrides={colorOverrides}
          onColorOverrides={setColorOverrides}
          smartTags={section === "tasks" ? taskSmartTags : smartTags}
          onSmartTags={section === "tasks" ? setTaskSmartTags : setSmartTags}
          smartTagSamples={section === "tasks" ? taskTagSamples : smartTagSamples}
          sidePanelSections={sidePanelSections}
          onSidePanelSections={setSidePanelSections}
          localCalendars={shownCalendars}
          localCalendarCounts={localCalendarCounts}
          onCreateCalendar={createLocalCalendar}
          onRenameCalendar={renameLocalCalendar}
          onDeleteCalendar={deleteLocalCalendar}
        />
      </SideNav>
      <div className="calendar-shell">
      {section === "calendar" || viewingDisplay ? <MobileCalendarToolbar
        focus={focus} view={shownView} weekStartsOn={weekStartsOn}
        onDate={(date) => setFocus(startOfLocalDay(date))} onView={changeView}
        onPrevious={() => setFocus((current) => shiftFocus(current, shownView, -1))}
        onNext={() => setFocus((current) => shiftFocus(current, shownView, 1))}
        onToday={() => setFocus(startOfLocalDay(new Date()))}
        onCreate={() => setDraft(defaultTimedDraft(focus, 9))}
        allowCreate={!viewingDisplay}
        onAgent={() => setChatOpen((value) => !value)} agentOpen={chatOpen}
      /> : null}
      <header className="calendar-toolbar" data-section={section}>
        <div className="calendar-toolbar-left">
          {viewingDisplay ? (
            <>
              <button type="button" className="qd-back" aria-label="Back to Quick Displays" onClick={() => setOpenDisplayId(null)}>
                <ChevronLeftIcon />
              </button>
              <h2 aria-live="polite">{viewingDisplay.name}</h2>
              <span className="qd-readonly">Read only</span>
            </>
          ) : section === "calendar" ? (
            <h2 aria-live="polite">{formatFocusLabel(focus, shownView, weekStartsOn)}</h2>
          ) : (
            <h2>{SECTION_TITLES[section]}</h2>
          )}
        </div>
        <div className="calendar-toolbar-right">
          {section === "calendar" || viewingDisplay ? (
            <>
              <div className="calendar-step">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Previous"
                  title="Previous (←)"
                  onClick={() => setFocus((current) => shiftFocus(current, shownView, -1))}
                >
                  <ChevronLeftIcon />
                </button>
                <button
                  type="button"
                  className="calendar-today-btn"
                  title="Today (T)"
                  onClick={() => setFocus(startOfLocalDay(new Date()))}
                >
                  Today
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Next"
                  title="Next (→)"
                  onClick={() => setFocus((current) => shiftFocus(current, shownView, 1))}
                >
                  <ChevronRightIcon />
                </button>
              </div>
              <SegmentedControl label="Calendar view" value={shownView} options={VIEW_OPTIONS} onChange={changeView} />
            </>
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

      {banner.value ? (
        <div className="calendar-notice" role="status" data-state={banner.open ? "open" : "closed"}>
          <div className="calendar-notice-inner">
            <span>{banner.value}</span>
            <button
              type="button"
              className="icon-btn"
              aria-label="Dismiss"
              disabled={!banner.open}
              onClick={() => {
                setNotice(null);
                if (calendar.loadError) void calendar.refresh();
              }}
            >
              <CloseIcon />
            </button>
          </div>
        </div>
      ) : null}

      <div className="calendar-body">
        <div className="calendar-stage">
          <div key={stageKey} className="calendar-stage-view" data-nav={navDirection}>
            {section === "displays" && !viewingDisplay ? (
              <QuickDisplays
                displays={calendarSpaces}
                choices={spaceCalendarChoices}
                samples={smartTagSamples}
                onOpen={openQuickDisplay}
                onCreate={createQuickDisplay}
                onUpdate={updateQuickDisplay}
                onDelete={deleteCalendarSpace}
              />
            ) : null}
            {section === "tasks" ? (
              <TodoList
                items={itemsForUi}
                onOpen={(item) => {
                  if (item.pendingApproval) {
                    setNotice("Approve or undo this Agent change in the chat.");
                    return;
                  }
                  const calId = calendarIdForMeta(item.calendar);
                  if (calId && isCalendarReadOnly(sources, calId)) return;
                  setDraft(draftFromMeta(item.id, item.title, item.calendar));
                }}
                onComplete={calendar.completeTask}
                onCreate={() => setDraft({ ...defaultAllDayDraft(startOfLocalDay(new Date())), kind: "task" })}
                keywordTasks={listedTasks}
                calendarName={keywordTaskCalendarName}
                tagForItem={tagForTaskItem}
                onKeywordComplete={(key, done) => setKeywordTasks((current) => withKeywordTaskDone(current, key, done))}
                onKeywordOpen={(task) => {
                  setActiveCalendarSpaceId(MAIN_CALENDAR_SPACE_ID);
                  setFocus(new Date(task.dueUTC));
                  setView("day");
                  setSection("calendar");
                }}
                rules={
                  <KeywordTaskRules
                    config={keywordTasks}
                    onChange={setKeywordTasks}
                    calendars={keywordTaskCalendars}
                    sources={keywordTaskSources}
                  />
                }
              />
            ) : null}
            {section === "events" ? (
              <CampusEventsSection
                items={calendar.items}
                calendars={campusTargets}
                onAdd={addCampusEvent}
                subscriptions={campusCalendars.map((entry) => ({ feedId: entry.calendar.id, categories: entry.categories }))}
                onSubscribe={subscribeCampus}
              />
            ) : null}
            {section === "map" ? (
              <CalendarMapSection
                items={itemsForUi.filter((item) => itemOnMainCalendar(item.calendar.importSource, spaceOnlyFeeds))}
                overlayEvents={overlayEvents}
                mergedCalendars={mergedCalendars}
                onMergedCalendars={setMergedCalendars}
                agentHiddenIds={agentHiddenCalendarIds}
                onAgentHiddenIds={setAgentHiddenCalendarIds}
                newCalendarsShown={newCalendarsShown}
                onNewCalendarsShown={setNewCalendarsShown}
                sources={sources}
                onSources={setSources}
                importedCalendars={importedCalendars}
                campusCalendars={campusCalendarFeeds}
                colors={colors}
                colorOverrides={colorOverrides}
                localCalendars={shownCalendars}
                googleConnected={googleConnected}
                requireAiApproval={calendar.requireAiApproval}
                onRequireAiApproval={calendar.setRequireAiApproval}
                onRefresh={calendar.refresh}
                onSyncGoogle={() => googlePullRef.current()}
                onAskAgent={(id) => {
                  setChatOpen(true);
                  setAttachRequest({ id, nonce: Date.now() });
                }}
                onReviewPending={() => setChatOpen(true)}
                rules={agentRules.rules}
                rulesStatus={agentRules.status}
                onRulesChanged={agentRules.reload}
                onRefreshPending={calendar.refreshPending}
              />
            ) : null}
            {section === "settings" ? (
              <SettingsPanel
                importedCalendars={importedCalendars}
                campusCalendars={campusCalendarFeeds}
                mergedCalendars={mergedCalendars}
                onRenameCalendar={(id, name) => renameExternal(externalCalendarId(id), name)}
                accountEmail={user.email}
                advancedView={advancedView}
                onAdvancedViewChange={(value) => {
                  onAdvancedViewChange(value);
                }}
                requireAiApproval={calendar.requireAiApproval}
                onRequireAiApprovalChange={(value) =>
                  void calendar.setRequireAiApproval(value).catch(() => setNotice("Unable to save Agent settings."))
                }
                syncedAt={googleSyncedAt}
                onSyncGoogle={() => googlePullRef.current()}
                onImported={addImported}
                onRefresh={() => calendar.refresh()}
                onRemoveCalendar={removeImported}
                onChanged={() => setGoogleVersion((value) => value + 1)}
                onNotice={setNotice}
                onSignOut={onSignOut}
              />
            ) : null}
            {(section === "calendar" || viewingDisplay) && shownView === "day" ? (
              <CalendarDayView
                focus={focus}
                items={dayItems}
                editorDraft={viewingDisplay ? null : draft}
                onOpen={onOpenItem}
                onCreateTimed={(hour, _minute, endHour) => setDraft(defaultTimedDraft(focus, hour, 0, endHour))}
                onCreateAllDay={() => setDraft(defaultAllDayDraft(focus))}
                onCompleteTask={calendar.completeTask}
                readOnly={viewingDisplay != null}
              />
            ) : null}
            {(section === "calendar" || viewingDisplay) && (shownView === "week" || shownView === "workweek") ? (
              <CalendarWeekView
                focus={focus}
                weekStartsOn={weekStartsOn}
                days={shownView === "workweek" ? Array.from({ length: 5 }, (_, i) => addDays(startOfWorkWeek(focus), i)) : undefined}
                itemsForDay={itemsForDay}
                editorDraft={viewingDisplay ? null : draft}
                onOpen={onOpenItem}
                onCreateTimed={(date, hour, endHour) => setDraft(defaultTimedDraft(date, hour, 0, endHour))}
                onCreateAllDay={(date) => setDraft(defaultAllDayDraft(date))}
                onSelectDay={(date) => {
                  setFocus(startOfLocalDay(date));
                  changeView("day");
                }}
                onCompleteTask={calendar.completeTask}
                readOnly={viewingDisplay != null}
              />
            ) : null}
            {(section === "calendar" || viewingDisplay) && shownView === "month" ? (
              <CalendarMonthView
                focus={focus}
                onSelectDate={(date) => setFocus(startOfLocalDay(date))}
                weekStartsOn={weekStartsOn}
                itemsForDay={itemsForDay}
                onOpen={onOpenItem}
                onCreate={(date) => setDraft(defaultAllDayDraft(date))}
                onCompleteTask={calendar.completeTask}
                readOnly={viewingDisplay != null}
              />
            ) : null}
            {(section === "calendar" || viewingDisplay) && shownView === "year" ? (
              <CalendarYearView
                focus={focus}
                weekStartsOn={weekStartsOn}
                itemsForDay={itemsForDay}
                onSelectDay={(date) => {
                  setFocus(startOfLocalDay(date));
                  changeView("day");
                }}
              />
            ) : null}
          </div>
        </div>

        <CalendarChatPanel
          open={chatOpen}
          chats={calendar.chats}
          activeChat={calendar.activeChat}
          messages={calendar.activeChat?.messages ?? []}
          busy={busy}
          error={error}
          restriction={restriction}
          streamingAssistantId={streamingAssistantId}
          settlingAssistantId={settlingAssistantId}
          holdLabel={holdLabel}
          onSend={(payload) => void handleSend(payload)}
          onStop={() => abortRef.current?.abort()}
          onError={setError}
          onNewChat={() => {
            if (restriction) return;
            calendar.createChat();
          }}
          onDeleteChat={(chatId) => {
            if (restriction) return;
            calendar.deleteChat(chatId);
          }}
          onRenameChat={calendar.renameChat}
          onCloseChat={calendar.closeChat}
          onReopenChat={calendar.reopenChat}
          onSelectChat={calendar.selectChat}
          onReorderChats={calendar.reorderChats}
          onResizingChange={setChatResizing}
          onClose={() => setChatOpen(false)}
          calendars={mentionCalendars}
          items={chatItems}
          pendingChanges={calendar.pendingChanges}
          approvalBusy={calendar.approvalBusy}
          onApprove={(id) =>
            void calendar.approvePendingChanges({ ids: [id] }).catch(() => setNotice("Unable to approve the change."))
          }
          onReject={(id) =>
            void calendar.rejectPendingChanges({ ids: [id] }).catch(() => setNotice("Unable to undo the change."))
          }
          onApproveAll={() =>
            void calendar.approvePendingChanges({ all: true }).catch(() => setNotice("Unable to approve changes."))
          }
          onRejectAll={() =>
            void calendar.rejectPendingChanges({ all: true }).catch(() => setNotice("Unable to undo changes."))
          }
          onInspectPending={revealPending}
          attachRequest={attachRequest}
          ruleNames={ruleNames}
          onEditCalendarItem={(item) => {
            const calId = calendarIdForMeta(item.calendar);
            if (calId && isCalendarReadOnly(sources, calId)) return;
            setSection("calendar");
            setDraft(draftFromMeta(item.id, item.title, item.calendar));
          }}
        />
      </div>

      {shownPeek ? (
        <GoogleEventCard
          key={shownPeek.item.id}
          item={shownPeek.item}
          anchor={shownPeek.anchor}
          open={peek.open}
          calendarLabel={eventCalendarLabel(shownPeek.item, shownCalendars, importedLabels)}
          onClose={closePeek}
          onEdit={
            viewingDisplay || shownPeek.item.pendingApproval || isTimelineItemReadOnly(shownPeek.item)
              ? undefined
              : shownPeek.item.kind === "event"
              ? () => {
                  const existing = calendar.items.find((row) => row.id === shownPeek.item.id);
                  setGooglePeek(null);
                  if (existing) setDraft(draftFromMeta(existing.id, existing.title, existing.calendar));
                }
              : shownPeek.item.google?.editable
                ? () => {
                    const next = draftFromGoogle(shownPeek.item);
                    setGooglePeek(null);
                    if (next) setDraft(next);
                  }
                : undefined
          }
          onDelete={
            viewingDisplay || shownPeek.item.pendingApproval || isTimelineItemReadOnly(shownPeek.item)
              ? undefined
              : shownPeek.item.kind === "event"
              ? () => {
                  setGooglePeek(null);
                  setItemDelete({
                    id: shownPeek.item.id,
                    title: shownPeek.item.title,
                    kind: "event",
                    calendarName: eventCalendarLabel(shownPeek.item, shownCalendars, importedLabels),
                  });
                }
              : shownPeek.item.google?.deletable
                ? () => {
                    const target = googleTargetOf(shownPeek.item);
                    setGooglePeek(null);
                    if (target) setGoogleDelete({ ...target, title: shownPeek.item.title });
                  }
                : undefined
          }
        />
      ) : null}

      {itemDeletePrompt.value ? (
        <ConfirmDialog
          title={`Delete “${itemDeletePrompt.value.title}”?`}
          message={
            itemDeletePrompt.value.kind === "task"
              ? "This deletes the task from your WatAgent calendar."
              : itemDeletePrompt.value.calendarName
                ? `This deletes the event from ${itemDeletePrompt.value.calendarName}.`
                : "This deletes the event from your WatAgent calendar."
          }
          open={itemDeletePrompt.open}
          onCancel={() => setItemDelete(null)}
          onConfirm={confirmItemDelete}
        />
      ) : null}

      {deletePrompt.value ? (
        <ConfirmDialog
          title={`Delete “${deletePrompt.value.title}”?`}
          message={`This deletes it from ${deletePrompt.value.calendarName || "your calendar"} in Google Calendar. If it repeats, only this occurrence is removed.`}
          open={deletePrompt.open}
          onCancel={() => setGoogleDelete(null)}
          onConfirm={() => void confirmGoogleDelete()}
        />
      ) : null}

      {shownDraft ? (
        <CalendarItemEditor
          key={shownDraft.google?.eventId ?? shownDraft.id ?? "new-item"}
          draft={shownDraft}
          open={editor.open}
          readOnly={draftReadOnly}
          onChange={setDraft}
          onSave={saveDraft}
          onCancel={closeEditor}
          calendars={shownCalendars}
          readOnlyCalendarIds={sources.readOnlyCalendarIds}
          defaultCalendarId={defaultEventCalendarId(localCalendars)}
          onDelete={
            draftReadOnly
              ? undefined
              : shownDraft.google
              ? shownDraft.google.deletable
                ? () =>
                    setGoogleDelete({
                      ...(shownDraft.google as GoogleDraftTarget),
                      title: shownDraft.title || "Event",
                    })
                : undefined
              : shownDraft.id
                ? () =>
                    setItemDelete({
                      id: shownDraft.id as string,
                      title: shownDraft.title || (shownDraft.kind === "task" ? "Task" : "Event"),
                      kind: shownDraft.kind,
                    })
                : undefined
          }
        />
      ) : null}
    </div>
    </div>
  );
}
