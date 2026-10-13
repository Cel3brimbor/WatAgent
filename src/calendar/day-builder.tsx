"use client";

import { createContext, useCallback, useContext, useRef, useSyncExternalStore, type ReactNode } from "react";
import { allDayItems } from "@/calendar/all-day-bar";
import { mergeTimeline, pinBottomDeadlines, pinListedDues } from "@/calendar/calendar-merge";
import { itemInCalendarSpace, itemOnMainCalendar, overlayInCalendarSpace, type CalendarSpace } from "@/calendar/calendar-spaces";
import { calendarItemVisible, externalCalendarId } from "@/calendar/external-calendars";
import { TaskDueContext } from "@/calendar/calendar-derived";
import { useOptionalEventStore, type DayBucket } from "@/calendar/event-store";
import { mergePendingIntoItems } from "@/calendar/merge-pending";
import {
  calendarGroupsOf,
  calendarPaint,
  isSidebarHidden,
  type CalendarSourceFilter,
} from "@/calendar/preferences";
import type { SmartTagMatcher, SmartTagTarget } from "@/calendar/smart-tags";
import {
  aggregateTimeline,
  localDayKey,
  reuseStableItems,
  sameTimelineItem,
} from "@/calendar/timeline";
import type { ImportedCalendar, MergedCalendar, TimelineItem } from "@/calendar/types";

const EMPTY_TIMELINE: TimelineItem[] = [];
const EMPTY_BUCKET: DayBucket = { docs: [], google: [], busy: [], aiPending: [] };

export type DayBuildConfig = {
  sources: CalendarSourceFilter;
  mergedCalendars: MergedCalendar[];
  feedsForMerge: ImportedCalendar[];
  campusSources: ReadonlySet<string>;
  viewingDisplay: CalendarSpace | null;
  spaceOnlyFeeds: ReadonlySet<string>;
  displayTagMatcher: SmartTagMatcher;
  taskDueById: ReadonlyMap<string, number>;
  //true once any google event is loaded, so free/busy blocks stay hidden
  overlayCoversBusy: boolean;
};

export type BuildDay = (date: Date, bucket: DayBucket, filter?: CalendarSourceFilter) => TimelineItem[];

const DayBuilderContext = createContext<BuildDay | null>(null);
export const ColumnItemsContext = createContext<((date: Date) => TimelineItem[]) | null>(null);

export function DayBuilderProvider({ buildDay, children }: { buildDay: BuildDay; children: ReactNode }) {
  return <DayBuilderContext.Provider value={buildDay}>{children}</DayBuilderContext.Provider>;
}

//product preview draws sample rows without the event store
export function DayItemsOverride({
  itemsForDay,
  children,
}: {
  itemsForDay: ((date: Date) => TimelineItem[]) | null;
  children: ReactNode;
}) {
  return <ColumnItemsContext.Provider value={itemsForDay}>{children}</ColumnItemsContext.Provider>;
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

export function buildDayTimeline(date: Date, bucket: DayBucket, config: DayBuildConfig, filter?: CalendarSourceFilter): TimelineItem[] {
  const sourceFilter = filter ?? config.sources;
  const filterGroups = calendarGroupsOf(sourceFilter.groups);
  const googleShown = sourceFilter.google && filterGroups.other;
  const docs = mergePendingIntoItems(bucket.docs, bucket.aiPending);
  const events = docs.filter((item) => {
    if (config.viewingDisplay) return itemInCalendarSpace(item.calendar, config.viewingDisplay, config.mergedCalendars);
    return itemOnMainCalendar(item.calendar.importSource, config.spaceOnlyFeeds)
      && calendarItemVisible(item, sourceFilter, config.mergedCalendars, config.campusSources);
  });
  const overlayEvents = bucket.google.filter((event) => {
    if (config.viewingDisplay) return overlayInCalendarSpace(event.calendarId, config.viewingDisplay);
    if (filterGroups.hidden && sourceFilter.hiddenIds.includes(event.calendarId)) return true;
    return googleShown && !isSidebarHidden(sourceFilter, event.calendarId) && !sourceFilter.mutedGoogleIds.includes(event.calendarId);
  });
  const hideBusy = config.viewingDisplay != null || !googleShown || config.overlayCoversBusy;
  const busySource = hideBusy ? [] : bucket.busy;
  const painted = pinListedDues(
    pinBottomDeadlines(
      mergeTimeline(
        aggregateTimeline({ focus: date, events, busyBlocks: busySource, overlayEvents }),
        config.mergedCalendars,
        config.feedsForMerge,
      ),
      date,
      config.feedsForMerge,
    ),
    config.taskDueById,
    date,
  ).map((item) => {
    if (item.kind === "gcal_busy") return item;
    //the hex lives on :root. this string stays put when the swatch changes
    if (item.kind === "gcal_event") {
      const id = item.google?.calendarId;
      if (!id) return item;
      const calendarColor = calendarPaint(id, item.google?.calendarColor);
      if (item.calendarColor === calendarColor) return item;
      return { ...item, calendarColor };
    }
    const calendarId = item.importSource
      ? (item.mergedCalendarId ?? externalCalendarId(item.importSource))
      : (item.calendarId ?? "events");
    const calendarColor = calendarPaint(calendarId);
    if (item.calendarColor === calendarColor) return item;
    return { ...item, calendarColor };
  });
  return applySmartTags(painted, config.displayTagMatcher);
}

export function useDayTimeline(date: Date): TimelineItem[] {
  const override = useContext(ColumnItemsContext);
  const store = useOptionalEventStore();
  const buildDay = useContext(DayBuilderContext);
  const taskDueById = useContext(TaskDueContext);
  const key = localDayKey(date.getTime());
  const held = useRef<TimelineItem[]>(EMPTY_TIMELINE);
  const subscribe = useCallback((onStoreChange: () => void) => {
    if (override || !store) return () => {};
    return store.subscribeDay(key, onStoreChange);
  }, [override, store, key]);
  const getSnapshot = useCallback(() => {
    //dues live on the ref buildDay reads; this dep is what wakes the column when a pin moves
    void taskDueById;
    const built = override
      ? override(date)
      : buildDay
        ? buildDay(date, store ? store.getDayBucket(key) : EMPTY_BUCKET)
        : EMPTY_TIMELINE;
    //same array when a visibility note does not change this day, so the cell bails out
    const next = reuseStableItems(held.current, built);
    held.current = next;
    return next;
  }, [override, date, buildDay, store, key, taskDueById]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function timedCards(items: TimelineItem[]): TimelineItem[] {
  return items.filter((item) => !item.allDay && !item.pinned);
}

//one slice of a day. the cached array stays put when the other slice is what changed
function useDaySlice(date: Date, select: (items: TimelineItem[]) => TimelineItem[]): TimelineItem[] {
  const override = useContext(ColumnItemsContext);
  const store = useOptionalEventStore();
  const buildDay = useContext(DayBuilderContext);
  const taskDueById = useContext(TaskDueContext);
  const key = localDayKey(date.getTime());
  const held = useRef<TimelineItem[]>(EMPTY_TIMELINE);
  const subscribe = useCallback((onStoreChange: () => void) => {
    if (override || !store) return () => {};
    return store.subscribeDay(key, onStoreChange);
  }, [override, store, key]);
  const getSnapshot = useCallback(() => {
    //same ref buildDay closes over; listed here so a due-only change rebuilds the slice
    void taskDueById;
    const built = override
      ? override(date)
      : buildDay
        ? buildDay(date, store ? store.getDayBucket(key) : EMPTY_BUCKET)
        : EMPTY_TIMELINE;
    const next = select(built);
    const prev = held.current;
    if (prev.length === next.length && next.every((item, index) => sameTimelineItem(prev[index], item))) {
      return prev;
    }
    held.current = next;
    return next;
  }, [override, date, buildDay, store, key, select, taskDueById]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useTimedTimeline(date: Date): TimelineItem[] {
  return useDaySlice(date, timedCards);
}

export function useAllDayTimeline(date: Date): TimelineItem[] {
  return useDaySlice(date, allDayItems);
}

//true when any of these days has an all-day or pinned chip. one subscription, not one hook per day
export function useHasAllDay(days: readonly Date[]): boolean {
  const store = useOptionalEventStore();
  const buildDay = useContext(DayBuilderContext);
  const taskDueById = useContext(TaskDueContext);
  const keys = days.map((date) => localDayKey(date.getTime())).join("|");
  const subscribe = useCallback((onStoreChange: () => void) => {
    if (!store || !buildDay || !keys) return () => {};
    const unsubs = keys.split("|").map((key) => store.subscribeDay(key, onStoreChange));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [store, buildDay, keys]);
  const getSnapshot = useCallback(() => {
    void taskDueById;
    if (!store || !buildDay || !keys) return false;
    for (const key of keys.split("|")) {
      const [year, month, day] = key.split("-").map(Number);
      const date = new Date(year, (month ?? 1) - 1, day);
      if (allDayItems(buildDay(date, store.getDayBucket(key))).length > 0) return true;
    }
    return false;
  }, [store, buildDay, keys, taskDueById]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

//year dots only need a boolean. the snapshot stays a primitive so untouched days do not re-render
export function useHasItemsOnDay(date: Date): boolean {
  const override = useContext(ColumnItemsContext);
  const store = useOptionalEventStore();
  const buildDay = useContext(DayBuilderContext);
  const taskDueById = useContext(TaskDueContext);
  const key = localDayKey(date.getTime());
  const subscribe = useCallback((onStoreChange: () => void) => {
    if (override || !store) return () => {};
    return store.subscribeDay(key, onStoreChange);
  }, [override, store, key]);
  const getSnapshot = useCallback(() => {
    void taskDueById;
    if (override) return override(date).length > 0;
    if (!store || !buildDay) return false;
    const [year, month, day] = key.split("-").map(Number);
    const dayDate = new Date(year, (month ?? 1) - 1, day);
    return buildDay(dayDate, store.getDayBucket(key)).length > 0;
  }, [override, store, buildDay, date, key, taskDueById]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
