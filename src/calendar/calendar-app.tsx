"use client";

import { memo, startTransition, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type MutableRefObject } from "react";
import { leadHourForDays } from "@/calendar/time-scale";
import { useTimedGridScroll } from "@/calendar/use-time-scale";
import type { CalendarItemDoc, CalendarItemMeta, CalendarView, ImportedCalendar, ImportedCalendarSource, MergedCalendar, TimelineItem } from "@/calendar/types";
import { useCalendarItem, useEventStore } from "@/calendar/event-store";
import {
  DerivedProvider,
  EMPTY_TASK_DUES,
  currentTaskDues,
  sameDueConfig,
  taskCompletionDocs,
  useChatDerived,
  useDisplayDerived,
  useEventItems,
  useMapDerived,
  useSideDerived,
  useTaskDerived,
  type DerivedConfig,
} from "@/calendar/calendar-derived";
import { DayBuilderProvider, buildDayTimeline, type BuildDay } from "@/calendar/day-builder";
import { useCalendarActions, useCalendarApproval, useCalendarStatus, useChatActions, useChatState } from "@/calendar/store";
import {
  addDays,
  daysInView,
  formatFocusLabel,
  formatTime,
  localDayBounds,
  localeWeekStartsOn,
  shiftFocus,
  focusEnteringWorkweek,
  stageViewKey,
  startOfLocalDay,
  startOfWeek,
  startOfWorkWeek,
  viewForToday,
  viewsShareTimedWeek,
} from "@/calendar/date-utils";
import { removeImportedCalendar } from "@/calendar/client";
import { externalCalendarId } from "@/calendar/external-calendars";
import { newFeedId } from "@/calendar/imported-calendars";
import { formatFeedSyncSummary, syncImportedFeed } from "@/calendar/calendar-sync";
import { localDayKey, type OverlayEvent } from "@/calendar/timeline";
import { EditorDraftProvider } from "@/calendar/slot-draft";
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
  HEX_COLOR,
  calendarSwatchColor,
  installCalendarColorStyles,
  paintCalendarSwatchLive,
  syncCalendarKindVars,
  readSidePanelSections,
  readSourceFilter,
  isCalendarReadOnly,
  calendarGroupsOf,
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
  type SmartTagTarget,
} from "@/calendar/smart-tags";
import { calendarIdForDraft, calendarIdForMeta, timelineItemCalendarId } from "@/calendar/calendar-ownership";
import { CalendarSidePanel } from "@/calendar/calendar-side-panel";
import { QuickDisplays } from "@/calendar/quick-displays";
import {
  MAIN_CALENDAR_SPACE_ID,
  itemInCalendarSpace,
  mapCalendarSpace,
  readCalendarSpaces,
  spaceOnlyFeedIds,
  type CalendarSpace,
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
import { EventPeek, type EventPeekHandle } from "@/calendar/google-event-card";
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
import { markCampusFeed, unmarkCampusFeed } from "@/campus/campus-feed-sources";
import { readKeywordTasks, withKeywordTaskDone, type KeywordTask, type KeywordTasks } from "@/calendar/keyword-tasks";
import { KeywordTaskRules } from "@/calendar/keyword-task-rules";
import { AccessError, plainReason } from "@/auth/access";
import { CalendarChatPanel } from "@/agent/calendar-chat-panel";
import type { PendingAiChange } from "@/calendar/approval-client";
import { attachedIdsOf, textForModel, type MentionCalendar } from "@/agent/calendar-mention";
import type { AgentEffort } from "@/agent/agent-effort";
import { withImageTranscripts } from "@/agent/image-ocr";
import { requestChatTitle } from "@/agent/chat-title";
import { readAgentStream } from "@/agent/stream";
import { cloneActivity } from "@/agent/agent-activity";
import { settleCallingTools } from "@/agent/settle-tools";
import type { ActivityPart, ChatImage, ChatMessage, ThoughtSegment, ToolEventRecord } from "@/agent/types";
import { afterMotion, afterPaint } from "@/shared/after-paint";
import { ApiError, apiFetch, apiJson, errorFromResponse } from "@/shared/api-base";
import { LockdownBanner } from "@/shared/lockdown-banner";
import { uid } from "@/shared/ids";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "@/shared/icons";
import { SegmentedControl, type SegmentOption } from "@/shared/segmented-control";
import { usePresence } from "@/shared/use-presence";
import { useStableCallback } from "@/shared/use-stable-callback";
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
  images?: ChatImage[];
  imageText?: string;
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

type GridSwatch = { id: string; googleColor?: string; campusCategoryId?: string };

//resolved hex per calendar id. display tints win, then a campus color that survives a new feed id
function resolvedGridSwatches(
  colors: CalendarColors,
  colorOverrides: Record<string, string>,
  displayOverrides: Record<string, string> | undefined,
  calendars: readonly GridSwatch[],
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const calendar of calendars) {
    if (!calendar.id || resolved[calendar.id]) continue;
    let color = displayOverrides?.[calendar.id];
    if (!color && calendar.campusCategoryId) color = colorOverrides[campusColorKey(calendar.campusCategoryId)];
    if (!color) color = colorOverrides[calendar.id];
    if (!color && calendar.googleColor) color = calendar.googleColor;
    if (!color) color = calendarSwatchColor(calendar.id, colors, colorOverrides);
    if (color && HEX_COLOR.test(color)) resolved[calendar.id] = color;
  }
  return resolved;
}

function buildGridSwatchList(
  shownCalendars: LocalCalendar[],
  mergedCalendars: MergedCalendar[],
  feedsForMerge: ImportedCalendar[],
  campusCategoryByFeedId: ReadonlyMap<string, string>,
  googleCalendars: GoogleCalendarRef[],
  colors: CalendarColors,
  colorOverrides: Record<string, string>,
): GridSwatch[] {
  const list: GridSwatch[] = [{ id: "events" }, { id: "tasks" }];
  for (const calendar of shownCalendars) list.push({ id: calendar.id });
  for (const calendar of mergedCalendars) list.push({ id: calendar.id });
  for (const feed of feedsForMerge) {
    list.push({ id: externalCalendarId(feed.id), campusCategoryId: campusCategoryByFeedId.get(feed.id) });
  }
  for (const calendar of googleCalendars) {
    list.push({ id: calendar.id, googleColor: calendar.color || colors.google });
  }
  for (const id of Object.keys(colorOverrides)) {
    if (!id.startsWith("campus:")) list.push({ id });
  }
  return list;
}

function gridSwatchIdSignature(
  shownCalendars: LocalCalendar[],
  mergedCalendars: MergedCalendar[],
  feedsForMerge: ImportedCalendar[],
  googleCalendars: GoogleCalendarRef[],
  overrideKeys: string,
): string {
  const ids = new Set<string>(["events", "tasks"]);
  for (const calendar of shownCalendars) ids.add(calendar.id);
  for (const calendar of mergedCalendars) ids.add(calendar.id);
  for (const feed of feedsForMerge) ids.add(externalCalendarId(feed.id));
  for (const calendar of googleCalendars) ids.add(calendar.id);
  for (const id of overrideKeys.split("\0")) if (id) ids.add(id);
  return [...ids].sort().join("\0");
}

function smartTagKey(tags: SmartTag[]): string {
  return tags.map((tag) => [
    tag.id,
    tag.name,
    tag.color,
    tag.enabled ? 1 : 0,
    tag.match,
    tag.cover,
    tag.exemptCalendarIds.join(","),
    tag.rules.map((rule) => `${rule.field}:${rule.operator}:${rule.value}`).join(","),
  ].join("\0")).join("\n");
}

function rowSignature(rows: unknown[][]): string {
  return JSON.stringify(rows);
}

//keep the previous array when a fresh derive matches, so memo children can bail out
function useContentStable<T>(value: T, signature: string): T {
  const held = useRef<{ signature: string; value: T } | null>(null);
  if (!held.current || held.current.signature !== signature) held.current = { signature, value };
  return held.current.value;
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

const EMPTY_CHAT_MESSAGES: ChatMessage[] = [];
const STABLE_PENDING: PendingAiChange[] = [];

function PendingChatOpener({ onOpen }: { onOpen: () => void }) {
  const { pendingChanges } = useCalendarApproval();
  const count = pendingChanges.length;
  const seen = useRef(0);
  useEffect(() => {
    if (count > seen.current) onOpen();
    seen.current = count;
  }, [count, onOpen]);
  return null;
}

//start of the period the stage is showing, so moving within the same week/month isn't a "navigation"
const CalendarChatDock = memo(function CalendarChatDock({
  open,
  busy,
  error,
  restriction,
  streamingAssistantId,
  settlingAssistantId,
  holdLabel,
  onSend,
  onStop,
  onError,
  onResizingChange,
  onClose,
  calendars,
  items,
  onApprove,
  onReject,
  onApproveAll,
  onRejectAll,
  onInspectPending,
  onEditCalendarItem,
  attachRequest,
  ruleNames,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  restriction: { message: string; reason: string | null } | null;
  streamingAssistantId: string | null;
  settlingAssistantId: string | null;
  holdLabel: string | null;
  onSend: (payload: SendPayload) => void;
  onStop: () => void;
  onError: (message: string | null) => void;
  onResizingChange: (resizing: boolean) => void;
  onClose: () => void;
  calendars: MentionCalendar[];
  items: CalendarItemDoc[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onApproveAll: () => void;
  onRejectAll: () => void;
  onInspectPending: (change: PendingAiChange) => void;
  onEditCalendarItem: (item: CalendarItemDoc) => void;
  attachRequest?: { id: string; nonce: number } | null;
  ruleNames?: Record<string, string>;
}) {
  const { chats, activeChat } = useChatState();
  const { pendingChanges, approvalBusy } = useCalendarApproval();
  const { createChat, deleteChat, renameChat, closeChat, reopenChat, selectChat, reorderChats, setChatPinned } =
    useChatActions();
  useEffect(() => {
    if (open && !restriction && chats.length === 0) createChat();
  }, [open, restriction, chats.length, createChat]);
  const newChat = useStableCallback(() => {
    if (restriction) return;
    createChat();
  });
  const removeChat = useStableCallback((chatId: string) => {
    if (restriction) return;
    deleteChat(chatId);
  });
  return (
    <CalendarChatPanel
      open={open}
      chats={chats}
      activeChat={activeChat}
      messages={activeChat?.messages ?? EMPTY_CHAT_MESSAGES}
      busy={busy}
      error={error}
      restriction={restriction}
      streamingAssistantId={streamingAssistantId}
      settlingAssistantId={settlingAssistantId}
      holdLabel={holdLabel}
      onSend={onSend}
      onStop={onStop}
      onError={onError}
      onNewChat={newChat}
      onDeleteChat={removeChat}
      onRenameChat={renameChat}
      onCloseChat={closeChat}
      onReopenChat={reopenChat}
      onPinChat={setChatPinned}
      onSelectChat={selectChat}
      onReorderChats={reorderChats}
      onResizingChange={onResizingChange}
      onClose={onClose}
      calendars={calendars}
      items={items}
      pendingChanges={pendingChanges}
      approvalBusy={approvalBusy}
      onApprove={onApprove}
      onReject={onReject}
      onApproveAll={onApproveAll}
      onRejectAll={onRejectAll}
      onInspectPending={onInspectPending}
      onEditCalendarItem={onEditCalendarItem}
      attachRequest={attachRequest}
      ruleNames={ruleNames}
    />
  );
});

const CalendarToolbar = memo(function CalendarToolbar({
  section,
  displayName,
  focus,
  view,
  weekStartsOn,
  chatOpen,
  onBack,
  onPrevious,
  onToday,
  onNext,
  onView,
  onToggleAgent,
}: {
  section: AppSection;
  displayName: string | null;
  focus: Date;
  view: CalendarView;
  weekStartsOn: 0 | 1;
  chatOpen: boolean;
  onBack: () => void;
  onPrevious: () => void;
  onToday: () => void;
  onNext: () => void;
  onView: (view: CalendarView) => void;
  onToggleAgent: () => void;
}) {
  const onStage = section === "calendar" || displayName != null;
  return (
    <header className="calendar-toolbar" data-section={section}>
      <div className="calendar-toolbar-left">
        {displayName != null ? (
          <>
            <button type="button" className="qd-back" aria-label="Back to Quick Displays" onClick={onBack}>
              <ChevronLeftIcon />
            </button>
            <h2 aria-live="polite">{displayName}</h2>
            <span className="qd-readonly">Read only</span>
          </>
        ) : section === "calendar" ? (
          <h2 aria-live="polite">{formatFocusLabel(focus, view, weekStartsOn)}</h2>
        ) : (
          <h2>{SECTION_TITLES[section]}</h2>
        )}
      </div>
      <div className="calendar-toolbar-right">
        {onStage ? (
          <>
            <div className="calendar-step">
              <button
                type="button"
                className="icon-btn"
                aria-label="Previous"
                title="Previous (←)"
                onClick={onPrevious}
              >
                <ChevronLeftIcon />
              </button>
              <button
                type="button"
                className="calendar-today-btn"
                title="Today (T)"
                onClick={onToday}
              >
                Today
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label="Next"
                title="Next (→)"
                onClick={onNext}
              >
                <ChevronRightIcon />
              </button>
            </div>
            <SegmentedControl label="Calendar view" value={view} options={VIEW_OPTIONS} onChange={onView} />
          </>
        ) : null}
        <button
          type="button"
          className={`ghost-btn calendar-agent-btn${chatOpen ? " is-active" : ""}`}
          aria-label="Agent"
          aria-pressed={chatOpen}
          onClick={onToggleAgent}
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
  );
});

function periodStart(focus: Date, view: CalendarView, weekStartsOn: 0 | 1): number {
  if (view === "day") return startOfLocalDay(focus).getTime();
  if (view === "week") return startOfWeek(focus, weekStartsOn).getTime();
  if (view === "workweek") return startOfWorkWeek(focus).getTime();
  if (view === "month") return new Date(focus.getFullYear(), focus.getMonth(), 1).getTime();
  return new Date(focus.getFullYear(), 0, 1).getTime();
}

const EMPTY_LEAD_DAYS: Date[] = [];

//the snapshot is the hour, so an edit that does not move the first timed event does not re-render
function useViewLeadHour(
  days: readonly Date[],
  itemsForDay: (date: Date) => TimelineItem[],
  configRef: MutableRefObject<DerivedConfig | null>,
  filterRef: MutableRefObject<CalendarSourceFilter>,
): number {
  const store = useEventStore();
  const daysRef = useRef(days);
  const itemsForDayRef = useRef(itemsForDay);
  daysRef.current = days;
  itemsForDayRef.current = itemsForDay;
  const keys = days.map((date) => localDayKey(date.getTime())).join("|");
  const cache = useRef<{ keys: string; items: CalendarItemDoc[] | null; google: OverlayEvent[] | null; config: DerivedConfig | null; filter: CalendarSourceFilter | null; hour: number }>({ keys: "\0", items: null, google: null, config: null, filter: null, hour: 0 });
  const subscribe = useCallback((onStoreChange: () => void) => {
    const dayKeys = keys ? keys.split("|") : [];
    const unsubs = dayKeys.map((key) => store.subscribeDay(key, onStoreChange));
    //a due on another day can pull a timed card off the one on screen
    const unsubAll = store.subscribeAll(onStoreChange);
    return () => {
      for (const unsub of unsubs) unsub();
      unsubAll();
    };
  }, [store, keys]);
  const getSnapshot = useCallback(() => {
    const visible = daysRef.current;
    const key = visible.map((date) => localDayKey(date.getTime())).join("|");
    const items = store.getAllItems();
    const google = store.getAllGoogle();
    const config = configRef.current;
    const filter = filterRef.current;
    const hit = cache.current;
    //tags on a shortcut, and checking a task off, do not move the first hour
    const sameConfig = hit.config === config || (config != null && sameDueConfig(hit.config, config));
    const sameItems = hit.items === items || taskCompletionDocs(hit.items, items) != null;
    if (hit.keys === key && hit.google === google && hit.filter === filter && sameConfig && sameItems) {
      if (hit.items !== items || (config && hit.config !== config)) cache.current = { ...hit, items, config: config ?? hit.config };
      return hit.hour;
    }
    const hour = visible.length === 0 || !config ? 0 : leadHourForDays([...visible], (date) => itemsForDayRef.current(date));
    cache.current = { keys: key, items, google, config, filter, hour };
    return hour;
  }, [store, configRef, filterRef]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function useGoogleOverlayPresent(): boolean {
  const store = useEventStore();
  const subscribe = useCallback((onStoreChange: () => void) => store.subscribeGoogle(onStoreChange), [store]);
  const getSnapshot = useCallback(() => store.getAllGoogle().length > 0, [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function LeadHourSync({
  days,
  itemsForDay,
  configRef,
  filterRef,
  onHour,
}: {
  days: readonly Date[];
  itemsForDay: (date: Date) => TimelineItem[];
  configRef: MutableRefObject<DerivedConfig | null>;
  filterRef: MutableRefObject<CalendarSourceFilter>;
  onHour: (hour: number) => void;
}) {
  const hour = useViewLeadHour(days, itemsForDay, configRef, filterRef);
  const onHourRef = useRef(onHour);
  onHourRef.current = onHour;
  useLayoutEffect(() => {
    onHourRef.current(hour);
  }, [hour]);
  return null;
}

function SidePanelFromStore({
  section,
  focus,
  view,
  weekStartsOn,
  onFocus,
  sources,
  onSources,
  colors,
  onColors,
  onRenameExternal,
  onRefreshCalendars,
  onSyncGoogle,
  onNotice,
  onRemoveExternal,
  colorOverrides,
  onColorOverrides,
  smartTags,
  taskSmartTags,
  onSmartTags,
  onTaskSmartTags,
  sidePanelSections,
  onSidePanelSections,
  localCalendars,
  onCreateCalendar,
  onRenameCalendar,
  onDeleteCalendar,
}: {
  section: AppSection;
  focus: Date;
  view: CalendarView;
  weekStartsOn: 0 | 1;
  onFocus: (date: Date) => void;
  sources: CalendarSourceFilter;
  onSources: (next: CalendarSourceFilter) => void;
  colors: CalendarColors;
  onColors: (next: CalendarColors | ((current: CalendarColors) => CalendarColors)) => void;
  onRenameExternal: (id: string, name: string) => void;
  onRefreshCalendars: () => Promise<void>;
  onSyncGoogle: () => Promise<number | null>;
  onNotice: (message: string) => void;
  onRemoveExternal: (source: ImportedCalendarSource) => Promise<void>;
  colorOverrides: Record<string, string>;
  onColorOverrides: (
    next: Record<string, string> | ((current: Record<string, string>) => Record<string, string>),
  ) => void;
  smartTags: SmartTag[];
  taskSmartTags: SmartTag[];
  onSmartTags: (next: SmartTag[]) => void;
  onTaskSmartTags: (next: SmartTag[]) => void;
  sidePanelSections: SidePanelSectionsOpen;
  onSidePanelSections: (next: SidePanelSectionsOpen) => void;
  localCalendars: LocalCalendar[];
  onCreateCalendar: (name: string) => void;
  onRenameCalendar: (id: string, name: string) => void;
  onDeleteCalendar: (id: string) => Promise<void>;
}) {
  const side = useSideDerived();
  return (
    <CalendarSidePanel
      variant={section === "tasks" ? "tasks" : "calendar"}
      focus={focus}
      view={view}
      weekStartsOn={weekStartsOn}
      onFocus={onFocus}
      sources={sources}
      onSources={onSources}
      colors={colors}
      onColors={onColors}
      externalCalendars={side.externalCalendars}
      campusCalendars={side.campusCalendars}
      onRenameExternal={onRenameExternal}
      onRefreshCalendars={onRefreshCalendars}
      onSyncGoogle={onSyncGoogle}
      onNotice={onNotice}
      onRemoveExternal={onRemoveExternal}
      googleCalendars={side.googleCalendars}
      colorOverrides={colorOverrides}
      onColorOverrides={onColorOverrides}
      smartTags={section === "tasks" ? taskSmartTags : smartTags}
      onSmartTags={section === "tasks" ? onTaskSmartTags : onSmartTags}
      smartTagSamples={section === "tasks" ? side.taskTagSamples : side.smartTagSamples}
      sidePanelSections={sidePanelSections}
      onSidePanelSections={onSidePanelSections}
      localCalendars={localCalendars}
      localCalendarCounts={side.localCalendarCounts}
      onCreateCalendar={onCreateCalendar}
      onRenameCalendar={onRenameCalendar}
      onDeleteCalendar={onDeleteCalendar}
    />
  );
}

function TasksFromStore({
  keywordTasks,
  taskSmartTags,
  onKeywordTasks,
  onOpen,
  onComplete,
  onCreate,
  onKeywordComplete,
  onKeywordOpen,
}: {
  keywordTasks: KeywordTasks;
  taskSmartTags: SmartTag[];
  onKeywordTasks: (next: KeywordTasks) => void;
  onOpen: (item: CalendarItemDoc) => void;
  onComplete: (id: string, completed: boolean) => void;
  onCreate: () => void;
  onKeywordComplete: (key: string, done: boolean) => void;
  onKeywordOpen: (task: KeywordTask) => void;
}) {
  const tasks = useTaskDerived();
  const tagMatcher = useMemo(() => compileSmartTags(taskSmartTags), [taskSmartTags]);
  const tagForTaskItem = useCallback((item: CalendarItemDoc) => tagMatcher({
    calendarId: item.calendar.importSource
      ? externalCalendarId(item.calendar.importSource)
      : localCalendarIdOf(item.calendar) ?? "events",
    title: item.title,
    location: item.calendar.location,
    description: item.calendar.description,
  }), [tagMatcher]);
  const tagForKeyword = useCallback((task: KeywordTask) => tagMatcher({
    calendarId: task.source.calendarId,
    title: task.source.title,
    location: task.source.location,
    description: task.source.description,
  }), [tagMatcher]);
  const calendarName = useCallback(
    (id: string) => tasks.calendars.find((calendar) => calendar.id === id)?.name ?? "Calendar",
    [tasks.calendars],
  );
  const rules = useMemo(() => (
    <KeywordTaskRules
      config={keywordTasks}
      onChange={onKeywordTasks}
      calendars={tasks.calendars}
      sources={tasks.sources}
    />
  ), [keywordTasks, onKeywordTasks, tasks.calendars, tasks.sources]);
  return (
    <TodoList
      items={tasks.items}
      onOpen={onOpen}
      onComplete={onComplete}
      onCreate={onCreate}
      keywordTasks={tasks.listed}
      calendarName={calendarName}
      tagForItem={tagForTaskItem}
      tagForKeyword={tagForKeyword}
      onKeywordComplete={onKeywordComplete}
      onKeywordOpen={onKeywordOpen}
      rules={rules}
    />
  );
}

function EventsFromStore(props: Omit<ComponentProps<typeof CampusEventsSection>, "items">) {
  const items = useEventItems();
  return <CampusEventsSection {...props} items={items} />;
}

function MapFromStore(props: Omit<ComponentProps<typeof CalendarMapSection>, "items" | "overlayEvents">) {
  const map = useMapDerived();
  return <CalendarMapSection {...props} items={map.items} overlayEvents={map.overlayEvents} />;
}

function DisplaysFromStore(props: Omit<ComponentProps<typeof QuickDisplays>, "samples" | "choices">) {
  const displays = useDisplayDerived();
  return <QuickDisplays {...props} samples={displays.samples} choices={displays.choices} />;
}

function ChatDockFromStore(props: Omit<ComponentProps<typeof CalendarChatDock>, "calendars" | "items">) {
  const chat = useChatDerived();
  return <CalendarChatDock {...props} calendars={chat.mentions} items={chat.items} />;
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
  const actions = useCalendarActions();
  const status = useCalendarStatus();
  const chat = useChatActions();
  const store = useEventStore();
  const mentionRef = useRef<MentionCalendar[]>([]);
  const overlayCoversBusy = useGoogleOverlayPresent();
  const calendar = useMemo(
    () => ({ ...status, ...actions, ...chat }),
    [status, actions, chat],
  );
  const { syncFromGoogle, pruneEmptyChats, setAfterWrite } = calendar;
  const [view, setView] = useState<CalendarView>(() => readCalendarView());
  const [calendarSpaces, setCalendarSpaces] = useState<CalendarSpace[]>(() => readCalendarSpaces().spaces);
  const [activeCalendarSpaceId, setActiveCalendarSpaceId] = useState(() => readCalendarSpaces().activeId);
  const [openDisplayId, setOpenDisplayId] = useState<string | null>(null);
  const [displayView, setDisplayView] = useState<CalendarView>(() => readCalendarView());
  const displayViewRef = useRef(displayView);
  displayViewRef.current = displayView;
  const viewRef = useRef(view);
  viewRef.current = view;
  const lastOpenDisplayIdRef = useRef<string | null>(null);
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
  useEffect(() => actions.subscribeNotice(setNotice), [actions]);
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
  const [googleDelete, setGoogleDelete] = useState<(GoogleDraftTarget & { title: string }) | null>(null);
  const [itemDelete, setItemDelete] = useState<{ id: string; title: string; kind: "event" | "task"; calendarName?: string } | null>(null);
  const [sources, setSourcesState] = useState<CalendarSourceFilter>(() => readSourceFilter());
  const sourcesRef = useRef(sources);
  //grid reads the ref in this same turn, so the checkbox and the events paint together
  const setSources = useCallback((next: CalendarSourceFilter | ((current: CalendarSourceFilter) => CalendarSourceFilter)) => {
    const resolved = typeof next === "function" ? next(sourcesRef.current) : next;
    if (resolved === sourcesRef.current) return;
    sourcesRef.current = resolved;
    setSourcesState(resolved);
    store.noteVisibility();
  }, [store]);
  const [colors, setColorsState] = useState<CalendarColors>(() => readCalendarColors());
  const [colorOverrides, setColorOverridesState] = useState<Record<string, string>>(() => readColorOverrides());
  const colorsRef = useRef(colors);
  const colorOverridesRef = useRef(colorOverrides);
  colorsRef.current = colors;
  colorOverridesRef.current = colorOverrides;
  const paintCommitRef = useRef(0);
  const paintDirtyRef = useRef({ colors: false, overrides: false });
  const flushPaintState = useCallback(() => {
    paintCommitRef.current = 0;
    const dirty = paintDirtyRef.current;
    paintDirtyRef.current = { colors: false, overrides: false };
    if (dirty.colors) {
      syncCalendarKindVars(colorsRef.current);
      setColorsState(colorsRef.current);
    }
    if (dirty.overrides) setColorOverridesState(colorOverridesRef.current);
  }, []);
  const schedulePaintStateCommit = useCallback(() => {
    if (paintCommitRef.current) return;
    paintCommitRef.current = requestAnimationFrame(flushPaintState);
  }, [flushPaintState]);
  const setColors = useCallback((
    next: CalendarColors | ((current: CalendarColors) => CalendarColors),
  ) => {
    colorsRef.current = typeof next === "function" ? next(colorsRef.current) : next;
    paintDirtyRef.current.colors = true;
    schedulePaintStateCommit();
  }, [schedulePaintStateCommit]);
  const setColorOverrides = useCallback((
    next: Record<string, string> | ((current: Record<string, string>) => Record<string, string>),
  ) => {
    colorOverridesRef.current = typeof next === "function" ? next(colorOverridesRef.current) : next;
    paintDirtyRef.current.overrides = true;
    schedulePaintStateCommit();
  }, [schedulePaintStateCommit]);
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
  const abortRef = useRef<AbortController | null>(null);
  const peekRef = useRef<EventPeekHandle>(null);
  const deletePrompt = usePresence(googleDelete);
  const itemDeletePrompt = usePresence(itemDelete);
  const editor = usePresence(draft);
  const shownDraft = editor.value;
  const banner = usePresence(notice ?? calendar.loadError);
  const closeEditor = useCallback(() => setDraft(null), []);

  const isTimelineItemReadOnly = useCallback(
    (item: TimelineItem) => {
      const id = timelineItemCalendarId(item);
      return id ? isCalendarReadOnly(sources, id) : false;
    },
    [sources],
  );

  const draftItem = useCalendarItem(shownDraft?.id ?? "");
  const draftReadOnly = shownDraft
    ? isCalendarReadOnly(sources, calendarIdForDraft(shownDraft, draftItem ? [draftItem] : [], localCalendars))
    : false;

  useEffect(() => {
    if (draft) peekRef.current?.close();
  }, [draft]);

  const shownCalendarList = useMemo(() => shownLocalCalendars(localCalendars, []), [localCalendars]);
  const shownCalendars = useContentStable(
    shownCalendarList,
    rowSignature(shownCalendarList.map((calendar) => [calendar.id, calendar.kind, calendar.name])),
  );

  //a quick display filters the stage. the main calendar stays on its own view
  const viewingDisplay = useMemo(() => {
    if (section !== "displays" || !openDisplayId) return null;
    return calendarSpaces.find((space) => space.id === openDisplayId) ?? null;
  }, [section, openDisplayId, calendarSpaces]);
  //colors and tags on a shortcut are not part of which events show, so they leave the grid callback alone
  const displayFilterKey = viewingDisplay
    ? [
        viewingDisplay.id,
        viewingDisplay.includedCalendarIds.join("\0"),
        viewingDisplay.mutedIds.join("\0"),
        viewingDisplay.importedCalendars.map((feed) => feed.id).join("\0"),
      ].join("\n")
    : "";
  const displayForGrid = useContentStable(viewingDisplay, displayFilterKey);
  const displayForTags = useContentStable(
    viewingDisplay,
    viewingDisplay ? `on\n${smartTagKey(viewingDisplay.smartTags)}\n${viewingDisplay.mutedSmartTagIds.join("\0")}` : "off",
  );
  //like main `view`, kept out of calendarSpaces until the display closes so toggles stay cheap
  const shownView = viewingDisplay ? displayView : view;

  const persistDisplayView = useCallback((spaceId: string, nextView: CalendarView) => {
    setCalendarSpaces((current) => {
      const space = current.find((entry) => entry.id === spaceId);
      if (!space || space.view === nextView) return current;
      return mapCalendarSpace(current, spaceId, (entry) => ({ ...entry, view: nextView }));
    });
  }, []);

  const changeView = useCallback((next: CalendarView) => {
    if (viewingDisplay) {
      const prev = displayViewRef.current;
      if (next === "workweek" && prev !== "workweek") {
        setFocus((current) => focusEnteringWorkweek(current, weekStartsOn));
      }
      if (next !== prev) setDisplayView(next);
      return;
    }
    const prev = viewRef.current;
    if (next === "workweek" && prev !== "workweek") {
      setFocus((current) => focusEnteringWorkweek(current, weekStartsOn));
    }
    setView(next);
  }, [viewingDisplay, weekStartsOn]);

  useEffect(() => {
    const previous = lastOpenDisplayIdRef.current;
    lastOpenDisplayIdRef.current = openDisplayId;
    if (previous && previous !== openDisplayId) {
      persistDisplayView(previous, displayViewRef.current);
    }
    if (!openDisplayId) return;
    const space = calendarSpaces.find((entry) => entry.id === openDisplayId);
    if (space) setDisplayView(space.view);
  }, [openDisplayId, persistDisplayView]);

  const period = periodStart(focus, shownView, weekStartsOn);
  const displayKey = viewingDisplay?.id ?? "main";
  const lastPeriodRef = useRef({ period, view: shownView, section, spaceId: displayKey });
  const navDirection = useMemo<NavDirection>(() => {
    const last = lastPeriodRef.current;
    const onStage = section === "calendar" || viewingDisplay != null;
    if (!onStage || section !== last.section) return "none";
    if (displayKey !== last.spaceId) return "none";
    if (shownView !== last.view) {
      if (viewsShareTimedWeek(shownView, last.view)) return "none";
      if (period === last.period) return "none";
      return VIEW_DEPTH[shownView] > VIEW_DEPTH[last.view] ? "in" : "out";
    }
    if (period === last.period) return "none";
    return period > last.period ? "next" : "prev";
  }, [period, shownView, section, displayKey, viewingDisplay]);
  useEffect(() => {
    lastPeriodRef.current = { period, view: shownView, section, spaceId: displayKey };
  }, [period, shownView, section, displayKey]);
  const stageKey = viewingDisplay
    ? `${viewingDisplay.id}:${stageViewKey(shownView)}:${period}`
    : section === "calendar"
      ? `main:${stageViewKey(shownView)}:${period}`
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
  const spaceOnlyFeedsRaw = useMemo(
    () => spaceOnlyFeedIds(calendarSpaces, feedsForMerge.map((feed) => feed.id)),
    [calendarSpaces, feedsForMerge],
  );
  //a tag or color on a shortcut must not look like a new feed set, or every column rebuilds
  const spaceOnlyFeeds = useContentStable(spaceOnlyFeedsRaw, [...spaceOnlyFeedsRaw].sort().join("\0"));

  //item lists live in DerivedProvider, so an edit does not re-run this component
  //checking a calendar does not change read-only, so this stays put and the derive does not run
  const derivedSources = useContentStable(sources, sources.readOnlyCalendarIds.join("\0"));
  //defer each paint field on its own — never useDeferredValue({ colors, colorOverrides }) or config churns every render
  const deferredColors = useDeferredValue(colors);
  const deferredColorOverrides = useDeferredValue(colorOverrides);
  const derivedConfig = useMemo<DerivedConfig>(() => ({
    //queued rows come from the approval context inside DerivedProvider, so this stays put while the agent writes
    pendingChanges: STABLE_PENDING,
    googleCalendars,
    importedCalendars,
    campusCalendarFeeds,
    mergedCalendars,
    feedsForMerge,
    calendarSpaces,
    spaceOnlyFeeds,
    shownCalendars,
    colors: deferredColors,
    colorOverrides: deferredColorOverrides,
    sources: derivedSources,
    agentHiddenCalendarIds,
    googleConnected,
    keywordTasks,
    taskSmartTags,
  }), [
    googleCalendars,
    importedCalendars,
    campusCalendarFeeds,
    mergedCalendars,
    feedsForMerge,
    calendarSpaces,
    spaceOnlyFeeds,
    shownCalendars,
    deferredColors,
    deferredColorOverrides,
    derivedSources,
    agentHiddenCalendarIds,
    googleConnected,
    keywordTasks,
    taskSmartTags,
  ]);

  const derivedConfigRef = useRef<DerivedConfig | null>(null);
  derivedConfigRef.current = derivedConfig;

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
  }, [calendar, importedCalendars, campusCalendarFeeds, newCalendarsShown, setSources]);

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
  const stageEpoch = useRef(new Map<string, number>());
  const campusBusy = useRef(false);
  if (!campusBusy.current) campusRef.current = campusCalendarFeeds;
  for (const feed of campusCalendarFeeds) markCampusFeed(feed.id);
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

  //the row leaves first. events follow, so a store refresh can't paint the old row back over the removal
  const disconnectFeed = useCallback((source: ImportedCalendarSource, options?: { hideEvents?: boolean }) => {
    const id = externalCalendarId(source);
    const campus = campusRef.current.find((entry) => entry.id === source);
    let external: ImportedCalendar | undefined;
    let merged: MergedCalendar[] = [];
    if (campus) {
      campusRef.current = campusRef.current.filter((entry) => entry.id !== source);
      setCampusCalendarFeeds(campusRef.current);
    }
    setImportedCalendars((current) => {
      external = current.find((entry) => entry.id === source);
      const next = current.filter((entry) => entry.id !== source);
      return next.length === current.length ? current : next;
    });
    setMergedCalendars((current) => {
      merged = current;
      let changed = false;
      const next = current.flatMap((entry) => {
        if (!entry.members.includes(id)) return [entry];
        changed = true;
        const members = entry.members.filter((member) => member !== id);
        return members.length >= 2 ? [{ ...entry, members }] : [];
      });
      return changed ? next : current;
    });
    if (options?.hideEvents !== false) calendar.hideImport(source);
    return { campus, external, merged };
  }, [calendar]);

  const restoreFeed = useCallback((source: ImportedCalendarSource, snapshot: { campus?: ImportedCalendar; external?: ImportedCalendar; merged: MergedCalendar[] }) => {
    calendar.releaseImport(source);
    if (snapshot.campus) {
      markCampusFeed(source);
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
      campusBusy.current = true;
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
        //mark before any event exists, so this feed can never land in imported calendars
        markCampusFeed(feedId);
        remember({ id: feedId, name: label, url });
        const epoch = (stageEpoch.current.get(feedId) ?? 0) + 1;
        stageEpoch.current.set(feedId, epoch);
        //color, visibility, and events follow the switch spring so the knob and the sidebar row are not blocked
        afterMotion(() => {
          if (stageEpoch.current.get(feedId) !== epoch) return;
          if (!campusRef.current.some((entry) => entry.id === feedId)) return;
          setColorOverrides((overrides) => withCampusFeedColor(overrides, id, feedKey));
          setSources((sourcesNow) => withNewCalendar(sourcesNow, feedKey, newCalendarsShown));
          const docs = campusCalendarItems(cachedCampusEvents(), feedId, id);
          let sent = 0;
          const step = () => {
            if (stageEpoch.current.get(feedId) !== epoch) return;
            if (!campusRef.current.some((entry) => entry.id === feedId)) return;
            sent = Math.min(docs.length, sent + 40);
            calendar.stageImport(feedId, docs.slice(0, sent));
            if (sent < docs.length) afterPaint(step);
          };
          if (docs.length > 0) step();
        });
        added.push({ id: feedId, url, name: label });
      }
      for (const [id, entry] of singles) {
        if (wanted.has(id)) continue;
        stageEpoch.current.set(entry.calendar.id, (stageEpoch.current.get(entry.calendar.id) ?? 0) + 1);
        const source = entry.calendar.id;
        removed.push({ id: source, name: entry.calendar.name, snapshot: disconnectFeed(source, { hideEvents: false }) });
        afterMotion(() => {
          if (campusRef.current.some((calendar) => calendar.id === source)) return;
          calendar.hideImport(source);
          unmarkCampusFeed(source);
        });
      }
      for (const entry of drop) {
        if (entry.categories.length === 0) continue;
        stageEpoch.current.set(entry.calendar.id, (stageEpoch.current.get(entry.calendar.id) ?? 0) + 1);
        const source = entry.calendar.id;
        removed.push({ id: source, name: entry.calendar.name, snapshot: disconnectFeed(source, { hideEvents: false }) });
        afterMotion(() => {
          if (campusRef.current.some((calendar) => calendar.id === source)) return;
          calendar.hideImport(source);
          unmarkCampusFeed(source);
        });
      }
      flushCalendarPreferencesRef.current?.({ campusCalendars: campusRef.current });
      if (!options?.quiet) {
        if (wanted.size === 0 && removed.length > 0) setNotice("Unsubscribed. UWaterloo Events are off your calendars.");
        else if (added.length === 1 && removed.length === 0) setNotice(`Subscribed. ${added[0].name} is its own calendar under UWaterloo Events.`);
        else if (removed.length === 1 && added.length === 0) setNotice(`${removed[0].name} is off your calendars.`);
        else if (added.length > 0 || removed.length > 0) setNotice("Updated your UWaterloo Events calendars.");
      }
      if (added.length === 0 && removed.length === 0) {
        campusBusy.current = false;
        return Promise.resolve();
      }
      enqueueCampus(async () => {
        const saved = new Set<ImportedCalendarSource>();
        const archived = new Set<ImportedCalendarSource>();
        try {
          for (const feed of added) {
            if (!campusRef.current.some((entry) => entry.id === feed.id)) continue;
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
              continue;
            }
            //chunks stop here. the server copy replaces the staged events on refresh
            stageEpoch.current.set(feed.id, (stageEpoch.current.get(feed.id) ?? 0) + 1);
            calendar.releaseImport(feed.id);
          }
          for (const feed of removed) {
            await removeImportedCalendar(feed.id);
            archived.add(feed.id);
          }
          await calendar.refresh();
          //keep the hide flag through the refresh, or the server copy comes back as an imported calendar
          for (const feed of removed) calendar.releaseImport(feed.id);
        } catch (err) {
          for (const feed of added) {
            stageEpoch.current.set(feed.id, (stageEpoch.current.get(feed.id) ?? 0) + 1);
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
    [calendar, disconnectFeed, enqueueCampus, newCalendarsShown, restoreFeed, setSources],
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

  const colorOverrideKeys = useMemo(
    () => Object.keys(colorOverrides).filter((id) => !id.startsWith("campus:")).sort().join("\0"),
    [colorOverrides],
  );
  const gridColorStructureKey = useMemo(
    () => gridSwatchIdSignature(shownCalendars, mergedCalendars, feedsForMerge, googleCalendars, colorOverrideKeys),
    [shownCalendars, mergedCalendars, feedsForMerge, googleCalendars, colorOverrideKeys],
  );
  useLayoutEffect(() => {
    if (!calendar.hydrated || !preferencesLoaded) return;
    const list = buildGridSwatchList(
      shownCalendars,
      mergedCalendars,
      feedsForMerge,
      campusCategoryByFeedId,
      googleCalendars,
      colorsRef.current,
      colorOverridesRef.current,
    );
    installCalendarColorStyles(
      resolvedGridSwatches(
        colorsRef.current,
        colorOverridesRef.current,
        viewingDisplay?.colorOverrides,
        list,
      ),
    );
    syncCalendarKindVars(colorsRef.current);
  }, [calendar.hydrated, preferencesLoaded, gridColorStructureKey, viewingDisplay, shownCalendars, mergedCalendars, feedsForMerge, campusCategoryByFeedId, googleCalendars]);


  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const google = params.get("google");
    if (!google) return;
    setNotice(google === "connected" ? "Google Calendar connected." : "Google Calendar could not be connected.");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const displayTagMatcherNow = useMemo(() => {
    if (!displayForTags) return smartTagMatcher;
    //tags made on this shortcut paint first. calendar tags paint unless this shortcut turned them off
    const local = compileSmartTags(displayForTags.smartTags);
    const muted = new Set(displayForTags.mutedSmartTagIds);
    const inherited = compileSmartTags(
      (groups.smartTags ? smartTags : smartTags.map((tag) => ({ ...tag, enabled: false })))
        .filter((tag) => !muted.has(tag.id)),
    );
    return (target: SmartTagTarget) => local(target) ?? inherited(target);
  }, [displayForTags, smartTagMatcher, smartTags, groups.smartTags]);
  //typing a tag or keyword rule stays urgent; visible days re-tag at low priority
  const displayTagMatcher = useDeferredValue(displayTagMatcherNow);

  const dayBuildConfig = useMemo(() => ({
    mergedCalendars,
    feedsForMerge,
    campusSources,
    viewingDisplay: displayForGrid,
    spaceOnlyFeeds,
    displayTagMatcher,
    taskDueById: EMPTY_TASK_DUES,
    overlayCoversBusy,
  }), [
    mergedCalendars,
    feedsForMerge,
    campusSources,
    displayForGrid,
    spaceOnlyFeeds,
    displayTagMatcher,
    overlayCoversBusy,
  ]);
  const buildDay = useCallback<BuildDay>(
    (date, bucket, filter) =>
      buildDayTimeline(date, bucket, {
        ...dayBuildConfig,
        //live filter, so checking a calendar does not rebuild this callback or every column
        sources: sourcesRef.current,
        //dues and busy are read at call time so this callback stays put across item edits
        taskDueById: derivedConfigRef.current
          ? currentTaskDues(store.getAllItems(), store.getAllGoogle(), derivedConfigRef.current)
          : EMPTY_TASK_DUES,
        overlayCoversBusy: store.getAllGoogle().length > 0,
      }, filter),
    [dayBuildConfig, store],
  );
  const itemsForDay = useCallback(
    (date: Date) => buildDay(date, store.getDayBucket(localDayKey(date.getTime()))),
    [buildDay, store],
  );

  const workweekDays = useMemo(() => Array.from({ length: 5 }, (_, i) => addDays(startOfWorkWeek(focus), i)), [focus]);
  const stageRef = useRef<HTMLDivElement>(null);
  const [todayScroll, setTodayScroll] = useState(0);
  const timedView = shownView === "day" || shownView === "week" || shownView === "workweek";
  const [timedLeadHour, setTimedLeadHour] = useState(0);
  const setLeadHour = useCallback((hour: number) => {
    setTimedLeadHour((current) => (Object.is(current, hour) ? current : hour));
  }, []);
  const leadDays = useMemo(
    () => (timedView && (section === "calendar" || viewingDisplay) ? daysInView(focus, shownView, weekStartsOn) : EMPTY_LEAD_DAYS),
    [timedView, section, viewingDisplay, focus, shownView, weekStartsOn],
  );
  const hourPx = useTimedGridScroll({
    scrollerRef: stageRef,
    active: calendar.hydrated && timedView && (section === "calendar" || viewingDisplay != null),
    resetKey: `${stageKey}:${todayScroll}`,
    leadHour: timedLeadHour,
  });
  const goToToday = useCallback(() => {
    const today = startOfLocalDay(new Date());
    const next = viewForToday(shownView, today);
    if (next !== shownView) changeView(next);
    setFocus(today);
    setTodayScroll((n) => n + 1);
  }, [shownView, changeView]);

  const digestScopeRef = useRef({ focus, buildDay, shownCalendars, agentHiddenCalendarIds });
  digestScopeRef.current = { focus, buildDay, shownCalendars, agentHiddenCalendarIds };
  //built when the message is sent, so the focused day can change without re-running CalendarApp
  function readTimelineDigest() {
    const scope = digestScopeRef.current;
    return scope.buildDay(scope.focus, store.getDayBucket(localDayKey(scope.focus.getTime())), ALL_SOURCES)
      //calendars whose Map link to the Agent was deleted stay out of what the Agent is sent
      .filter((item) => {
        if (item.kind === "gcal_event" || item.kind === "gcal_busy") return !isAgentCalendarHidden(scope.agentHiddenCalendarIds, "google");
        const id = timelineItemCalendarId(item);
        return !id || !isAgentCalendarHidden(scope.agentHiddenCalendarIds, id);
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
          ? scope.shownCalendars.find((calendar) => calendar.id === ownedId)?.name
            ?? (ownedId === "events" ? PRIMARY_EVENT_CALENDAR_NAME : ownedId)
          : "";
        const calendar = ownedId ? ` calendar=${ownedId} "${calendarName.replace(/"/g, "")}"` : "";
        const done = item.kind === "task" ? ` completed=${item.completed ? "true" : "false"}` : "";
        const where = item.location ? ` @ ${item.location}` : "";
        const about = item.description ? ` — ${item.description.replace(/\s+/g, " ").slice(0, 140)}` : "";
        const queued = item.pendingApproval ? " queued" : "";
        return `- ${item.kind} id=${item.id}${calendar} "${item.title}" ${when}${where}${about}${done}${queued}`;
      })
      .join("\n")
      .slice(0, 12_000);
  }

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
            startTransition(() => setNotice("Google Calendar needs to be linked again."));
            return null;
          }
          throw err;
        }
        if (!mountedRef.current || pullGenRef.current.get(key) !== gen) return null;
        if (pulled.calendars.length > 0) {
          const calendars = pulled.calendars.filter((calendar) => !isExcludedGoogleCalendarName(calendar.name));
          startTransition(() => setGoogleCalendars(calendars));
        }
        const now = Date.now();
        coveredRef.current = [
          ...coveredRef.current.filter((entry) => now - entry.at < GOOGLE_POLL_MS),
          { start: chunk.rangeStartUTC, end: chunk.rangeEndUTC, at: now },
        ];
        lastSyncedAt = pulled.lastSyncedAt;
      }
      if (lastSyncedAt != null) startTransition(() => setGoogleSyncedAt(lastSyncedAt));
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
    if (!chatOpen) pruneEmptyChats();
  }, [chatOpen, pruneEmptyChats]);

  const openChatForPending = useStableCallback(() => {
    setChatOpen(true);
  });

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
      if (key === "t") goToToday();
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
  }, [shownView, changeView, goToToday]);

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
      peekRef.current?.open(item, anchor);
      return;
    }
    if (item.kind === "task" && isTimelineItemReadOnly(item)) return;
    if (item.kind === "gcal_busy") return;
    if (item.pendingApproval || item.kind === "gcal_event" || item.kind === "event") {
      setDraft(null);
      peekRef.current?.open(item, anchor);
      return;
    }
    const existing = store.getItem(item.id);
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
  ): OverlayEvent | null {
    const current = store.findGoogle(target.calendarId, target.eventId);
    if (!current) return null;
    const next = patch(current);
    //store writes paint the touched day immediately; the dialog already closed
    if (next) store.applyGoogleUpsert(next);
    else store.applyGoogleRemove(current.id);
    return current;
  }

  async function saveGoogleDraft(pending: CalendarDraft, target: GoogleDraftTarget) {
    const title = pending.title.trim() || "Event";
    const timing = { startUTC: pending.startUTC, endUTC: pending.endUTC, allDay: pending.allDay };
    const snapshot = patchOverlay(target, (event) => ({ ...event, title, ...timing }));
    try {
      await updateGoogleEvent({ calendarId: target.calendarId, eventId: target.eventId, title, ...timing });
      //refresh this view only; a version bump would drop coverage and re-pull every week
      void googlePullRef.current().catch(() => undefined);
    } catch (err) {
      if (snapshot) store.applyGoogleUpsert(snapshot);
      const message = err instanceof Error ? err.message : "The Google event could not be updated.";
      startTransition(() => setNotice(message));
    }
  }

  function createLocalCalendar(name: string) {
    const created = newLocalCalendar(name);
    const used = new Set(Object.values(colorOverrides));
    const color = CALENDAR_PALETTE.find((option) => !used.has(option) && option !== colors.event && option !== colors.task)
      ?? CALENDAR_PALETTE[localCalendars.length % CALENDAR_PALETTE.length];
    const nextSources = withNewCalendar(sourcesRef.current, created.id, newCalendarsShown);
    //nothing is on this calendar yet, so the visible days do not need to refilter
    if (nextSources !== sourcesRef.current) {
      sourcesRef.current = nextSources;
      setSourcesState(nextSources);
    }
    paintCalendarSwatchLive(created.id, color);
    setColorOverrides((overrides) => ({ ...overrides, [created.id]: color }));
    setLocalCalendars((list) => [...list, created]);
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
    const ids = store.getAllItems().filter((item) => localCalendarIdOf(item.calendar) === id).map((item) => item.id);
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

  function commitItemDelete() {
    const target = itemDelete;
    if (!target) return;
    //the card and the editor preview leave on the click, while the dialog is still fading
    setDraft(null);
    calendar.remove(target.id);
  }

  function confirmItemDelete() {
    setItemDelete(null);
    setDraft(null);
    peekRef.current?.close();
  }

  async function removeGoogleEvent(target: GoogleDraftTarget) {
    const snapshot = patchOverlay(target, () => null);
    try {
      await deleteGoogleEvent({ calendarId: target.calendarId, eventId: target.eventId });
      void googlePullRef.current().catch(() => undefined);
    } catch (err) {
      if (snapshot) store.applyGoogleUpsert(snapshot);
      const message = err instanceof Error ? err.message : "The Google event could not be deleted.";
      startTransition(() => setNotice(message));
    }
  }

  function commitGoogleDelete() {
    const target = googleDelete;
    if (!target) return;
    setDraft(null);
    void removeGoogleEvent(target);
  }

  function confirmGoogleDelete() {
    setGoogleDelete(null);
    setDraft(null);
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
    if (isCalendarReadOnly(sources, calendarIdForDraft(draft, store.getAllItems(), localCalendars))) {
      setNotice("This calendar is read-only.");
      return;
    }
    if (!draft.allDay && draft.endUTC <= draft.startUTC) {
      setNotice("End time must be after the start time.");
      return;
    }
    if (draft.google) {
      const pending = draft;
      const target = draft.google;
      setDraft(null);
      afterPaint(() => {
        void saveGoogleDraft(pending, target);
      });
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
    const title = pending.title.trim() || (pending.kind === "task" ? "Task" : "Event");
    const displayNote = viewingDisplay && !itemInCalendarSpace(calendarMeta, viewingDisplay)
      ? `Saved on Calendar. ${viewingDisplay.name} only shows the calendars you picked.`
      : null;
    setDraft(null);
    afterPaint(() => {
      calendar.upsert({
        id: pending.id,
        title,
        calendar: calendarMeta,
      });
      if (displayNote) setNotice(displayNote);
    });
  }

  async function handleSend(payload: SendPayload) {
    if (busy || restriction) return;
    const existing = currentMessages();
    let text = payload.text.trim();
    let calendarIds = attachedIdsOf(payload.calendarIds);
    let images = payload.images?.slice(0, 4);
    let imageText = payload.imageText?.trim();
    let history = existing;
    let reuseUser = false;
    if (payload.branch?.kind === "edit") {
      const index = existing.findIndex((message) => message.id === payload.branch?.messageId);
      const target = existing[index];
      if (!target || target.role !== "user" || (!text && !calendarIds?.length && !images?.length && !imageText)) return;
      history = existing.slice(0, index);
    } else if (payload.branch?.kind === "regenerate") {
      const index = existing.findIndex((message) => message.id === payload.branch?.messageId);
      const target = existing[index];
      if (!target || target.role !== "assistant") return;
      const prior = existing.slice(0, index);
      const priorUser = [...prior].reverse().find((message) => message.role === "user");
      text = priorUser?.content.trim() ?? "";
      calendarIds = attachedIdsOf(priorUser?.calendarIds);
      images = priorUser?.images;
      imageText = priorUser?.imageText?.trim();
      if (!text && !calendarIds?.length && !images?.length && !imageText) return;
      history = prior;
      reuseUser = true;
    } else if (!text && !calendarIds?.length && !images?.length && !imageText) {
      return;
    }

    const userMessage: ChatMessage = {
      id: uid("msg"),
      role: "user",
      content: text.slice(0, 20_000),
      createdAt: Date.now(),
      calendarIds,
      images: images?.length ? images : undefined,
      imageText: imageText || undefined,
    };
    const assistantId = uid("msg");
    const visible = reuseUser ? history : [...history, userMessage];
    const willRead = visible.some(
      (message) => message.role === "user" && (message.images?.length ?? 0) > 0 && !message.imageText?.trim(),
    );
    //the read shows up with the message, then flashes like a tool call while ocr runs
    const parts: ActivityPart[] = willRead
      ? [
          {
            kind: "tools",
            events: [{ id: uid("tool"), tool: "read_image", state: "calling", callLabel: "read_image()" }],
          },
        ]
      : [{ kind: "thought", thought: { id: uid("thought"), text: "", startedAt: Date.now() } }];
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
    let completed = false;
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
      const next = currentMessages().map((message) =>
        message.id === assistantId
          ? {
              ...message,
              content: assistantText,
              activity: activity.length > 0 ? activity : undefined,
            }
          : message,
      );
      //stream paints can be interrupted by adding an event
      startTransition(() => {
        calendar.setChatMessages(next);
      });
    };

    try {
      if (willRead) {
        //let the calling row paint before ocr starts
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 0);
        });
      }
      const outgoing = willRead ? await withImageTranscripts(visible, controller.signal) : visible;
      if (willRead) {
        const read = toolEvents().find((event) => event.tool === "read_image" && event.state === "calling");
        if (read) {
          read.state = "succeeded";
          read.resultSummary = "Read the image";
        }
        parts.push({ kind: "thought", thought: { id: uid("thought"), text: "", startedAt: Date.now() } });
        const filled = new Map(outgoing.map((message) => [message.id, message.imageText]));
        calendar.setChatMessages(
          currentMessages().map((message) => {
            const nextText = filled.get(message.id);
            return nextText && nextText !== message.imageText ? { ...message, imageText: nextText } : message;
          }),
        );
        writeAssistant();
      }
      const res = await apiFetch("/api/calendar/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          startDateUTC: bounds.startDateUTC,
          endDateUTC: bounds.endDateUTC,
          timeZone: timeZone(),
          timelineDigest: readTimelineDigest(),
          effort: payload.effort,
          attachedCalendarIds: [...outgoing].reverse().find((message) => message.role === "user")?.calendarIds,
          messages: outgoing
            .filter(
              (message) =>
                message.content.trim() ||
                (message.role === "user" &&
                  ((message.calendarIds?.length ?? 0) > 0 ||
                    (message.images?.length ?? 0) > 0 ||
                    Boolean(message.imageText?.trim()))),
            )
            .slice(-80)
            .map((message) => {
              const text =
                message.role === "user"
                  ? textForModel(message.content, (id) => mentionRef.current.find((calendar) => calendar.id === id)?.name ?? "calendar")
                  : message.content.trim();
              return {
                role: message.role,
                content: text || (message.imageText || message.images?.length ? "Look at the attached image." : "Use the attached calendar."),
                imageText: message.role === "user" ? message.imageText : undefined,
              };
            }),
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
        completed = true;
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        const read = toolEvents().find((event) => event.tool === "read_image" && event.state === "calling");
        if (read) read.resultSummary = err instanceof Error ? err.message : "That image couldn't be read.";
      }
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (err instanceof AccessError && err.code === "ai_restricted") {
        setRestriction({ message: err.message, reason: err.reason });
        return;
      }
      if (err instanceof AccessError) return;
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      closeThought();
      //the stream is over, so a call still marked calling would flash forever after reopen
      settleCallingTools(
        toolEvents(),
        completed ? "succeeded" : "failed",
        controller.signal.aborted ? "Stopped." : "Didn't finish.",
      );
      writeAssistant();
      //the stream stays open through the output check, so this is the first finished state
      setHoldLabel(null);
      setBusy(false);
      setStreamingAssistantId(null);
      calendar.persistActiveChat();
      if (nameThisChat && nameAfterReply && chatId) {
        const userText =
          textForModel(text, (id) => mentionRef.current.find((calendar) => calendar.id === id)?.name ?? "calendar") ||
          (images?.length ? "Attached image" : "Attached calendar");
        void requestChatTitle(userText, assistantText).then((title) => {
          if (title) calendar.applyAutoTitle(chatId, title);
        });
      }
    }
  }

  const toggleNav = useStableCallback(() => {
    setNavCollapsed((current) => !current);
  });
  const chooseSection = useStableCallback((next: AppSection) => {
    if (next === "displays") setOpenDisplayId(null);
    setSection(next);
  });
  const createFromNav = useStableCallback(() => {
    setDraft(defaultTimedDraft(focus, 9));
  });
  const openItem = useStableCallback(onOpenItem);
  const createTimedOnFocus = useStableCallback((hour: number, minute: number = 0, endHour?: number) => {
    setDraft(defaultTimedDraft(focus, hour, minute, endHour));
  });
  const createAllDayOnFocus = useStableCallback(() => {
    setDraft(defaultAllDayDraft(focus));
  });
  const createTimedOnDate = useStableCallback((date: Date, hour: number, endHour?: number) => {
    setDraft(defaultTimedDraft(date, hour, 0, endHour));
  });
  const createAllDayOnDate = useStableCallback((date: Date) => {
    setDraft(defaultAllDayDraft(date));
  });
  const selectDay = useStableCallback((date: Date) => {
    setFocus(startOfLocalDay(date));
    changeView("day");
  });
  const selectMonthDate = useStableCallback((date: Date) => {
    setFocus(startOfLocalDay(date));
  });
  const shiftPrevious = useStableCallback(() => {
    setFocus((current) => shiftFocus(current, shownView, -1));
  });
  const shiftNext = useStableCallback(() => {
    setFocus((current) => shiftFocus(current, shownView, 1));
  });
  const focusPickedDate = useStableCallback((date: Date) => {
    setFocus(startOfLocalDay(date));
  });
  const createAtNine = useStableCallback(() => {
    setDraft(defaultTimedDraft(focus, 9));
  });
  const toggleChat = useStableCallback(() => {
    setChatOpen((value) => !value);
  });
  const closeQuickDisplay = useStableCallback(() => {
    if (openDisplayId) persistDisplayView(openDisplayId, displayViewRef.current);
    setOpenDisplayId(null);
  });
  const sideFocus = useStableCallback((date: Date) => {
    setFocus(date);
    if (shownView === "year") changeView("day");
  });
  const refreshCalendars = useStableCallback(() => calendar.refresh());
  const syncGoogle = useStableCallback(() => googlePullRef.current());
  const createCalendar = useStableCallback(createLocalCalendar);
  const renameCalendar = useStableCallback(renameLocalCalendar);
  const deleteCalendar = useStableCallback((id: string) => deleteLocalCalendar(id));
  const openTask = useStableCallback((item: CalendarItemDoc) => {
    if (item.pendingApproval) {
      setNotice("Approve or undo this Agent change in the chat.");
      return;
    }
    const calId = calendarIdForMeta(item.calendar);
    if (calId && isCalendarReadOnly(sources, calId)) return;
    setDraft(draftFromMeta(item.id, item.title, item.calendar));
  });
  const createTask = useStableCallback(() => {
    setDraft({ ...defaultAllDayDraft(startOfLocalDay(new Date())), kind: "task" });
  });
  const completeKeywordTask = useStableCallback((key: string, done: boolean) => {
    setKeywordTasks((current) => withKeywordTaskDone(current, key, done));
  });
  const openKeywordTask = useStableCallback((task: KeywordTask) => {
    setActiveCalendarSpaceId(MAIN_CALENDAR_SPACE_ID);
    setFocus(new Date(task.dueUTC));
    setView("day");
    setSection("calendar");
  });
  const sendChat = useStableCallback((payload: SendPayload) => {
    void handleSend(payload);
  });
  const stopChat = useStableCallback(() => {
    abortRef.current?.abort();
  });
  const closeChat = useStableCallback(() => {
    setChatOpen(false);
  });
  const approvePending = useStableCallback((id: string) => {
    void calendar.approvePendingChanges({ ids: [id] }).catch(() => setNotice("Unable to approve the change."));
  });
  const rejectPending = useStableCallback((id: string) => {
    void calendar.rejectPendingChanges({ ids: [id] }).catch(() => setNotice("Unable to undo the change."));
  });
  const approveAllPending = useStableCallback(() => {
    void calendar.approvePendingChanges({ all: true }).catch(() => setNotice("Unable to approve changes."));
  });
  const rejectAllPending = useStableCallback(() => {
    void calendar.rejectPendingChanges({ all: true }).catch(() => setNotice("Unable to undo changes."));
  });
  const inspectPending = useStableCallback(revealPending);
  const editChatItem = useStableCallback((item: CalendarItemDoc) => {
    const calId = calendarIdForMeta(item.calendar);
    if (calId && isCalendarReadOnly(sources, calId)) return;
    setSection("calendar");
    setDraft(draftFromMeta(item.id, item.title, item.calendar));
  });
  const peekLabelFor = useStableCallback((item: TimelineItem) => eventCalendarLabel(item, shownCalendars, importedLabels));
  const peekEditFor = useStableCallback((item: TimelineItem) => {
    if (viewingDisplay || item.pendingApproval || isTimelineItemReadOnly(item)) return undefined;
    if (item.kind === "event") {
      return () => {
        const existing = store.getItem(item.id);
        if (existing) setDraft(draftFromMeta(existing.id, existing.title, existing.calendar));
      };
    }
    if (item.google?.editable) {
      return () => {
        const next = draftFromGoogle(item);
        if (next) setDraft(next);
      };
    }
    return undefined;
  });
  const peekDeleteFor = useStableCallback((item: TimelineItem) => {
    if (viewingDisplay || item.pendingApproval || isTimelineItemReadOnly(item)) return undefined;
    if (item.kind === "event") {
      return () => {
        setItemDelete({
          id: item.id,
          title: item.title,
          kind: "event",
          calendarName: eventCalendarLabel(item, shownCalendars, importedLabels),
        });
      };
    }
    if (item.google?.deletable) {
      return () => {
        const target = googleTargetOf(item);
        if (target) setGoogleDelete({ ...target, title: item.title });
      };
    }
    return undefined;
  });

  if (!calendar.hydrated) {
    return (
      <main className="calendar-shell">
        <p className="calendar-empty">Loading calendar…</p>
      </main>
    );
  }

  return (
    <EditorDraftProvider value={viewingDisplay ? null : draft}>
    <DerivedProvider config={derivedConfig} mentionsRef={mentionRef} campusFeedsRef={campusRef}>
    <LeadHourSync days={leadDays} itemsForDay={itemsForDay} configRef={derivedConfigRef} filterRef={sourcesRef} onHour={setLeadHour} />
    <div
      className={`app-frame${navCollapsed ? " is-nav-collapsed" : ""}${chatResizing ? " is-resizing-chat" : ""}`}
    >
      <SideNav
        section={section}
        collapsed={navCollapsed}
        onSection={chooseSection}
        onToggle={toggleNav}
        onCreateEvent={section === "calendar" && !viewingDisplay ? createFromNav : undefined}
        advanced={advancedView}
      >
        <SidePanelFromStore
          section={section}
          focus={focus}
          view={shownView}
          weekStartsOn={weekStartsOn}
          onFocus={sideFocus}
          sources={sources}
          onSources={setSources}
          colors={colors}
          onColors={setColors}
          onRenameExternal={renameExternal}
          onRefreshCalendars={refreshCalendars}
          onSyncGoogle={syncGoogle}
          onNotice={setNotice}
          onRemoveExternal={removeImported}
          colorOverrides={colorOverrides}
          onColorOverrides={setColorOverrides}
          smartTags={smartTags}
          taskSmartTags={taskSmartTags}
          onSmartTags={setSmartTags}
          onTaskSmartTags={setTaskSmartTags}
          sidePanelSections={sidePanelSections}
          onSidePanelSections={setSidePanelSections}
          localCalendars={shownCalendars}
          onCreateCalendar={createCalendar}
          onRenameCalendar={renameCalendar}
          onDeleteCalendar={deleteCalendar}
        />
      </SideNav>
      <div className="calendar-shell">
      {section === "calendar" || viewingDisplay ? <MobileCalendarToolbar
        focus={focus} view={shownView} weekStartsOn={weekStartsOn}
        onDate={focusPickedDate} onView={changeView}
        onPrevious={shiftPrevious}
        onNext={shiftNext}
        onToday={goToToday}
        onCreate={createAtNine}
        allowCreate={!viewingDisplay}
        onAgent={toggleChat} agentOpen={chatOpen}
      /> : null}
      <CalendarToolbar
        section={section}
        displayName={viewingDisplay?.name ?? null}
        focus={focus}
        view={shownView}
        weekStartsOn={weekStartsOn}
        chatOpen={chatOpen}
        onBack={closeQuickDisplay}
        onPrevious={shiftPrevious}
        onToday={goToToday}
        onNext={shiftNext}
        onView={changeView}
        onToggleAgent={toggleChat}
      />

      <LockdownBanner />
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
        <div className="calendar-stage" ref={stageRef}>
          <div key={stageKey} className="calendar-stage-view" data-nav={navDirection}>
            {section === "displays" && !viewingDisplay ? (
              <DisplaysFromStore
                displays={calendarSpaces}
                calendarTags={smartTags}
                onOpen={openQuickDisplay}
                onCreate={createQuickDisplay}
                onUpdate={updateQuickDisplay}
                onDelete={deleteCalendarSpace}
              />
            ) : null}
            {section === "tasks" ? (
              <TasksFromStore
                keywordTasks={keywordTasks}
                taskSmartTags={taskSmartTags}
                onKeywordTasks={setKeywordTasks}
                onOpen={openTask}
                onComplete={actions.completeTask}
                onCreate={createTask}
                onKeywordComplete={completeKeywordTask}
                onKeywordOpen={openKeywordTask}
              />
            ) : null}
            {section === "events" ? (
              <EventsFromStore
                calendars={campusTargets}
                onAdd={addCampusEvent}
                subscriptions={campusCalendars.map((entry) => ({ feedId: entry.calendar.id, categories: entry.categories }))}
                onSubscribe={subscribeCampus}
              />
            ) : null}
            {section === "map" ? (
              <MapFromStore
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
            {(section === "calendar" || viewingDisplay) ? (
              <DayBuilderProvider buildDay={buildDay}>
                {shownView === "day" ? (
              <CalendarDayView
                focus={focus}
                onOpen={openItem}
                onCreateTimed={createTimedOnFocus}
                onCreateAllDay={createAllDayOnFocus}
                onCompleteTask={actions.completeTask}
                readOnly={viewingDisplay != null}
                hourPx={hourPx}
              />
                ) : null}
                {(shownView === "week" || shownView === "workweek") ? (
              <CalendarWeekView
                focus={focus}
                weekStartsOn={weekStartsOn}
                days={shownView === "workweek" ? workweekDays : undefined}
                onOpen={openItem}
                onCreateTimed={createTimedOnDate}
                onCreateAllDay={createAllDayOnDate}
                onSelectDay={selectDay}
                onCompleteTask={actions.completeTask}
                readOnly={viewingDisplay != null}
                hourPx={hourPx}
              />
                ) : null}
                {shownView === "month" ? (
              <CalendarMonthView
                focus={focus}
                onSelectDate={selectMonthDate}
                weekStartsOn={weekStartsOn}
                onOpen={openItem}
                onCreate={createAllDayOnDate}
                onCompleteTask={actions.completeTask}
                readOnly={viewingDisplay != null}
              />
                ) : null}
                {shownView === "year" ? (
              <CalendarYearView
                focus={focus}
                weekStartsOn={weekStartsOn}
                onSelectDay={selectDay}
              />
                ) : null}
              </DayBuilderProvider>
            ) : null}
          </div>
        </div>

        <PendingChatOpener onOpen={openChatForPending} />
        <ChatDockFromStore
          open={chatOpen}
          busy={busy}
          error={error}
          restriction={restriction}
          streamingAssistantId={streamingAssistantId}
          settlingAssistantId={settlingAssistantId}
          holdLabel={holdLabel}
          onSend={sendChat}
          onStop={stopChat}
          onError={setError}
          onResizingChange={setChatResizing}
          onClose={closeChat}
          onApprove={approvePending}
          onReject={rejectPending}
          onApproveAll={approveAllPending}
          onRejectAll={rejectAllPending}
          onInspectPending={inspectPending}
          attachRequest={attachRequest}
          ruleNames={ruleNames}
          onEditCalendarItem={editChatItem}
        />
      </div>

      <EventPeek
        ref={peekRef}
        labelFor={peekLabelFor}
        editFor={peekEditFor}
        deleteFor={peekDeleteFor}
      />

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
          onCommit={commitItemDelete}
          onConfirm={confirmItemDelete}
        />
      ) : null}

      {deletePrompt.value ? (
        <ConfirmDialog
          title={`Delete “${deletePrompt.value.title}”?`}
          message={`This deletes it from ${deletePrompt.value.calendarName || "your calendar"} in Google Calendar. If it repeats, only this occurrence is removed.`}
          open={deletePrompt.open}
          onCancel={() => setGoogleDelete(null)}
          onCommit={commitGoogleDelete}
          onConfirm={confirmGoogleDelete}
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
    </DerivedProvider>
    </EditorDraftProvider>
  );
}
