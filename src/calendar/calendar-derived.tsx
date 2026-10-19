"use client";

import {
  createContext,
  startTransition,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { afterMotion } from "@/shared/after-paint";
import type { MentionCalendar } from "@/agent/calendar-mention";
import type { PendingAiChange } from "@/calendar/approval-client";
import { bottomDeadlines, mergeTimeline } from "@/calendar/calendar-merge";
import type { SideExternalCalendar } from "@/calendar/calendar-side-panel";
import { itemOnMainCalendar, spaceOnlyFeedIds, type CalendarSpace, type SpaceCalendarChoice } from "@/calendar/calendar-spaces";
import { isExcludedGoogleCalendarName } from "@/calendar/calendar-lists";
import { useEventStore } from "@/calendar/event-store";
import { externalCalendarId, externalCalendarsOf } from "@/calendar/external-calendars";
import type { GoogleCalendarRef } from "@/calendar/google-calendar-client";
import { feedOfCalendarId, mergedByMember } from "@/calendar/imported-calendars";
import {
  deadlineTasksOf,
  dedupeSchoolAssignmentTasks,
  keywordTasksOf,
  smartTagTasksOf,
  withTaskTags,
  type KeywordTask,
  type KeywordTaskSource,
  type KeywordTasks,
} from "@/calendar/keyword-tasks";
import type { KeywordTaskCalendarOption } from "@/calendar/keyword-task-rules";
import { localCalendarIdOf, type LocalCalendar } from "@/calendar/local-calendars";
import { mergePendingIntoItems } from "@/calendar/merge-pending";
import {
  calendarSwatchColor,
  isAgentCalendarHidden,
  isCalendarReadOnly,
  type CalendarColors,
  type CalendarSourceFilter,
} from "@/calendar/preferences";
import { timelineItemCalendarId } from "@/calendar/calendar-ownership";
import type { SmartTag, SmartTagTarget } from "@/calendar/smart-tags";
import { overlayTimelineItemOf, timelineItemOf, type OverlayEvent } from "@/calendar/timeline";
import type { CalendarItemDoc, ImportedCalendar, MergedCalendar } from "@/calendar/types";

//columns read this. the map reference stays put until a listed due actually moves
export const EMPTY_TASK_DUES: ReadonlyMap<string, number> = new Map();
export const TaskDueContext = createContext<ReadonlyMap<string, number>>(EMPTY_TASK_DUES);

export type DerivedConfig = {
  pendingChanges: PendingAiChange[];
  googleCalendars: GoogleCalendarRef[];
  importedCalendars: ImportedCalendar[];
  campusCalendarFeeds: ImportedCalendar[];
  mergedCalendars: MergedCalendar[];
  feedsForMerge: ImportedCalendar[];
  calendarSpaces: CalendarSpace[];
  spaceOnlyFeeds: ReadonlySet<string>;
  shownCalendars: LocalCalendar[];
  colors: CalendarColors;
  colorOverrides: Record<string, string>;
  sources: CalendarSourceFilter;
  agentHiddenCalendarIds: string[];
  googleConnected: boolean | null;
  keywordTasks: KeywordTasks;
  taskSmartTags: SmartTag[];
};

export type SideDerived = {
  externalCalendars: SideExternalCalendar[];
  campusCalendars: SideExternalCalendar[];
  googleCalendars: GoogleCalendarRef[];
  localCalendarCounts: Record<string, number>;
  smartTagSamples: SmartTagTarget[];
  taskTagSamples: SmartTagTarget[];
};

export type ChatDerived = {
  mentions: MentionCalendar[];
  items: CalendarItemDoc[];
};

export type TaskDerived = {
  items: CalendarItemDoc[];
  listed: KeywordTask[];
  sources: KeywordTaskSource[];
  calendars: KeywordTaskCalendarOption[];
};

export type MapDerived = {
  items: CalendarItemDoc[];
  overlayEvents: OverlayEvent[];
};

export type DisplayDerived = {
  samples: SmartTagTarget[];
  choices: SpaceCalendarChoice[];
};

type Surfaces = {
  side: SideDerived;
  chat: ChatDerived;
  tasks: TaskDerived;
  map: MapDerived;
  events: CalendarItemDoc[];
  displays: DisplayDerived;
  taskDueById: ReadonlyMap<string, number>;
};

const EMPTY_SIDE: SideDerived = {
  externalCalendars: [],
  campusCalendars: [],
  googleCalendars: [],
  localCalendarCounts: {},
  smartTagSamples: [],
  taskTagSamples: [],
};
const EMPTY_CHAT: ChatDerived = { mentions: [], items: [] };
const EMPTY_TASKS: TaskDerived = { items: [], listed: [], sources: [], calendars: [] };
const EMPTY_MAP: MapDerived = { items: [], overlayEvents: [] };
const EMPTY_DISPLAYS: DisplayDerived = { samples: [], choices: [] };

const SideContext = createContext<SideDerived>(EMPTY_SIDE);
const ChatContext = createContext<ChatDerived>(EMPTY_CHAT);
const TaskContext = createContext<TaskDerived>(EMPTY_TASKS);
const MapContext = createContext<MapDerived>(EMPTY_MAP);
const EventItemsContext = createContext<CalendarItemDoc[]>([]);
const DisplayContext = createContext<DisplayDerived>(EMPTY_DISPLAYS);

function rowSignature(rows: unknown[][]): string {
  return JSON.stringify(rows);
}

function externalCalendarSignature(calendars: SideExternalCalendar[]): string {
  return rowSignature(calendars.map((calendar) => [
    calendar.id,
    calendar.name,
    calendar.source ?? "",
    calendar.merged ? 1 : 0,
    calendar.feeds.map((feed) => `${feed.id}:${feed.name}:${feed.url}`).join(","),
  ]));
}

function sampleSignature(samples: SmartTagTarget[]): string {
  return rowSignature(samples.map((sample) => [sample.calendarId, sample.title, sample.location ?? "", sample.description ?? ""]));
}

function dueSignature(tasks: readonly { key: string; dueUTC: number }[]): string {
  const parts = tasks.map((task) => `${task.key}:${task.dueUTC}`);
  parts.sort();
  return parts.join("|");
}

function dueMapOf(tasks: readonly { key: string; dueUTC: number }[]): ReadonlyMap<string, number> {
  if (tasks.length === 0) return EMPTY_TASK_DUES;
  const map = new Map<string, number>();
  for (const task of tasks) map.set(task.key, task.dueUTC);
  return map;
}

function sideSignature(side: SideDerived): string {
  const counts = Object.keys(side.localCalendarCounts).sort().map((id) => [id, side.localCalendarCounts[id]]);
  return [
    externalCalendarSignature(side.externalCalendars),
    externalCalendarSignature(side.campusCalendars),
    rowSignature(side.googleCalendars.map((calendar) => [calendar.id, calendar.name, calendar.color ?? "", calendar.group])),
    rowSignature(counts),
    sampleSignature(side.smartTagSamples),
    sampleSignature(side.taskTagSamples),
  ].join("\n");
}

function chatSignature(chat: ChatDerived): string {
  return [
    rowSignature(chat.mentions.map((calendar) => [calendar.id, calendar.name, calendar.kind, calendar.color, calendar.readOnly ? 1 : 0, (calendar.memberIds ?? []).join(",")])),
    rowSignature(chat.items.map((item) => [
      item.id,
      item.title,
      item.calendar.startUTC,
      item.calendar.endUTC,
      item.calendar.allDay ? 1 : 0,
      item.calendar.location ?? "",
      item.calendar.description ?? "",
    ])),
  ].join("\n");
}

function taskSignature(tasks: TaskDerived): string {
  return [
    rowSignature(tasks.items.map((item) => [
      item.id,
      item.title,
      item.updatedAt,
      item.calendar.completed ? 1 : 0,
      item.calendar.startUTC,
      item.calendar.endUTC,
      item.calendar.allDay ? 1 : 0,
      item.calendar.location ?? "",
      item.calendar.description ?? "",
      item.calendar.importSource ?? "",
      item.calendar.calendarId ?? "",
      item.pendingApproval ? 1 : 0,
      item.editorDraft ? 1 : 0,
    ])),
    rowSignature(tasks.listed.map((task) => [
      task.key,
      task.title,
      task.dueUTC,
      task.allDay ? 1 : 0,
      task.done ? 1 : 0,
      task.calendarId,
      task.keyword,
      task.ruleId,
      task.ruleName,
      task.tag?.id ?? "",
      task.tag?.name ?? "",
      task.tag?.color ?? "",
      task.tag?.cover ?? "",
    ])),
    rowSignature(tasks.sources.map((source) => [
      source.key,
      source.calendarId,
      source.mergedCalendarId ?? "",
      source.title,
      source.startUTC,
      source.endUTC,
      source.allDay ? 1 : 0,
      source.location ?? "",
      source.description ?? "",
    ])),
    rowSignature(tasks.calendars.map((calendar) => [calendar.id, calendar.name, calendar.group])),
  ].join("\n");
}

function mapSignature(map: MapDerived): string {
  return [
    rowSignature(map.items.map((item) => [item.id, item.title, item.updatedAt, item.calendar.startUTC, item.calendar.endUTC])),
    rowSignature(map.overlayEvents.map((event) => [event.id, event.title, event.startUTC, event.endUTC, event.calendarId])),
  ].join("\n");
}

function eventSignature(items: CalendarItemDoc[]): string {
  return rowSignature(items.map((item) => [item.id, item.title, item.updatedAt]));
}

function displaySignature(displays: DisplayDerived): string {
  return [
    sampleSignature(displays.samples),
    rowSignature(displays.choices.map((choice) => [choice.id, choice.name, choice.color, choice.group])),
  ].join("\n");
}

function patchCampusRows(rows: SideExternalCalendar[], feeds: readonly ImportedCalendar[]): SideExternalCalendar[] {
  const feedIds = new Set(feeds.map((feed) => feed.id));
  let changed = false;
  const kept = rows.flatMap((row) => {
    if (row.merged) {
      const members = row.feeds.filter((feed) => feedIds.has(feed.id));
      if (members.length === row.feeds.length) return [row];
      changed = true;
      if (members.length >= 2) return [{ ...row, feeds: members }];
      if (members.length === 1) {
        const feed = members[0];
        return [{ id: externalCalendarId(feed.id), name: feed.name, source: feed.id, feeds: [feed] }];
      }
      return [];
    }
    if (row.source && !feedIds.has(row.source)) {
      changed = true;
      return [];
    }
    return [row];
  });
  for (const feed of feeds) {
    const id = externalCalendarId(feed.id);
    if (kept.some((row) => row.id === id || row.feeds.some((item) => item.id === feed.id))) continue;
    changed = true;
    kept.push({ id, name: feed.name, source: feed.id, feeds: [feed] });
  }
  return changed ? kept : rows;
}

function isWatAgentMentionId(id: string): boolean {
  return id === "events" || id === "tasks" || id.startsWith("cal-");
}

function reuseList<T>(prev: readonly T[], next: T[], same: (a: T, b: T) => boolean): T[] {
  if (prev.length !== next.length) return next;
  for (let index = 0; index < prev.length; index += 1) {
    if (!same(prev[index], next[index])) return next;
  }
  return prev as T[];
}

function sameMention(a: MentionCalendar, b: MentionCalendar): boolean {
  if (a === b) return true;
  if (a.id !== b.id || a.name !== b.name || a.kind !== b.kind || a.color !== b.color || a.readOnly !== b.readOnly) return false;
  const left = a.memberIds ?? [];
  const right = b.memberIds ?? [];
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

//a recolor or a new calendar only retints rows. event lists stay as they are
function repaintCalendarSurfaces(prev: Surfaces, config: DerivedConfig): Surfaces {
  const swatch = (id: string) => calendarSwatchColor(id, config.colors, config.colorOverrides);
  const shownIds = new Set(config.shownCalendars.map((calendar) => calendar.id));
  const localMentions: MentionCalendar[] = [];
  for (const calendar of config.shownCalendars) {
    if (isAgentCalendarHidden(config.agentHiddenCalendarIds, calendar.id)) continue;
    localMentions.push({
      id: calendar.id,
      name: calendar.name,
      kind: calendar.kind,
      color: swatch(calendar.id),
      readOnly: isCalendarReadOnly(config.sources, calendar.id),
    });
  }
  const otherMentions: MentionCalendar[] = [];
  for (const mention of prev.chat.mentions) {
    if (shownIds.has(mention.id) || isWatAgentMentionId(mention.id)) continue;
    const color = mention.id === "google" ? config.colors.google : swatch(mention.id);
    otherMentions.push(mention.color === color ? mention : { ...mention, color });
  }
  const mentions = reuseList(prev.chat.mentions, [...localMentions, ...otherMentions], sameMention);

  const localChoices: SpaceCalendarChoice[] = config.shownCalendars.map((entry) => ({
    id: entry.id,
    name: entry.name,
    color: swatch(entry.id),
    group: "WatAgent",
  }));
  const otherChoices: SpaceCalendarChoice[] = [];
  for (const choice of prev.displays.choices) {
    if (choice.group === "WatAgent") continue;
    const color = choice.group === "Google"
      ? (config.colorOverrides[choice.id] || prev.side.googleCalendars.find((calendar) => calendar.id === choice.id)?.color || config.colors.google)
      : swatch(choice.id);
    otherChoices.push(choice.color === color ? choice : { ...choice, color });
  }
  const choices = reuseList(
    prev.displays.choices,
    [...localChoices, ...otherChoices],
    (a, b) => a.id === b.id && a.name === b.name && a.color === b.color && a.group === b.group,
  );

  const localTaskCalendars: KeywordTaskCalendarOption[] = config.shownCalendars
    .filter((calendar) => calendar.kind === "event")
    .map((calendar) => ({ id: calendar.id, name: calendar.name, group: "WatAgent" }));
  const taskCalendars = reuseList(
    prev.tasks.calendars,
    [...prev.tasks.calendars.filter((calendar) => calendar.group !== "WatAgent"), ...localTaskCalendars],
    (a, b) => a.id === b.id && a.name === b.name && a.group === b.group,
  );

  const chat = mentions === prev.chat.mentions ? prev.chat : { ...prev.chat, mentions };
  const displays = choices === prev.displays.choices ? prev.displays : { ...prev.displays, choices };
  const tasks = taskCalendars === prev.tasks.calendars ? prev.tasks : { ...prev.tasks, calendars: taskCalendars };
  if (chat === prev.chat && displays === prev.displays && tasks === prev.tasks) return prev;
  return { ...prev, chat, displays, tasks };
}

/**grid chips already track :root vars; skip slice work when only hex values moved*/
function recolorOnlyConfigChange(previous: DerivedConfig, config: DerivedConfig): boolean {
  if (previous.shownCalendars !== config.shownCalendars) return false;
  return previous.colors !== config.colors || previous.colorOverrides !== config.colorOverrides;
}

//shortcut colors and tags never change which events the main lists are built from
export function spaceImportedFeedsMatch(previous: readonly CalendarSpace[], next: readonly CalendarSpace[]): boolean {
  if (previous.length !== next.length) return false;
  for (let i = 0; i < previous.length; i++) {
    if (previous[i].id !== next[i].id) return false;
    const left = previous[i].importedCalendars;
    const right = next[i].importedCalendars;
    if (left.length !== right.length) return false;
    for (let j = 0; j < left.length; j++) {
      if (left[j].id !== right[j].id || left[j].url !== right[j].url || left[j].name !== right[j].name) return false;
    }
  }
  return true;
}

function sameIdSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left === right) return true;
  if (left.size !== right.size) return false;
  for (const id of left) if (!right.has(id)) return false;
  return true;
}

function configExcept(previous: DerivedConfig, config: DerivedConfig, skip: Partial<Record<keyof DerivedConfig, true>>): boolean {
  const keys: (keyof DerivedConfig)[] = [
    "pendingChanges",
    "googleCalendars",
    "importedCalendars",
    "campusCalendarFeeds",
    "mergedCalendars",
    "feedsForMerge",
    "calendarSpaces",
    "spaceOnlyFeeds",
    "shownCalendars",
    "colors",
    "colorOverrides",
    "sources",
    "agentHiddenCalendarIds",
    "googleConnected",
    "keywordTasks",
    "taskSmartTags",
  ];
  for (const key of keys) {
    if (skip[key]) continue;
    if (previous[key] !== config[key]) return false;
  }
  return true;
}

function spacePresentationOnlyChange(previous: DerivedConfig, config: DerivedConfig): boolean {
  if (previous.calendarSpaces === config.calendarSpaces) return false;
  if (!configExcept(previous, config, { calendarSpaces: true, spaceOnlyFeeds: true })) return false;
  if (!spaceImportedFeedsMatch(previous.calendarSpaces, config.calendarSpaces)) return false;
  return sameIdSet(previous.spaceOnlyFeeds, config.spaceOnlyFeeds);
}

//dues follow event times and which events are tasks. a checked box does not move them
export function sameDueConfig(previous: DerivedConfig | null, config: DerivedConfig): boolean {
  if (!previous) return false;
  return previous.keywordTasks === config.keywordTasks
    && previous.taskSmartTags === config.taskSmartTags
    && previous.pendingChanges === config.pendingChanges
    && previous.mergedCalendars === config.mergedCalendars
    && previous.feedsForMerge === config.feedsForMerge
    && previous.importedCalendars === config.importedCalendars
    && previous.campusCalendarFeeds === config.campusCalendarFeeds
    && sameIdSet(previous.spaceOnlyFeeds, config.spaceOnlyFeeds)
    && previous.sources === config.sources
    && previous.googleCalendars === config.googleCalendars;
}

function taskListOnlyChange(previous: DerivedConfig, config: DerivedConfig): boolean {
  if (previous.keywordTasks === config.keywordTasks && previous.taskSmartTags === config.taskSmartTags) return false;
  return configExcept(previous, config, { keywordTasks: true, taskSmartTags: true });
}

function keywordDoneOnly(previous: KeywordTasks, next: KeywordTasks): boolean {
  return previous.rules === next.rules && previous.includeDeadlines === next.includeDeadlines && previous.doneKeys !== next.doneKeys;
}

function completionSwap(before: CalendarItemDoc, after: CalendarItemDoc): boolean {
  if (before.id !== after.id || before.title !== after.title) return false;
  if (before.pendingApproval !== after.pendingApproval || before.editorDraft !== after.editorDraft) return false;
  const left = before.calendar;
  const right = after.calendar;
  if (left.kind !== "task" || right.kind !== "task" || left.completed === right.completed) return false;
  return left.startUTC === right.startUTC
    && left.endUTC === right.endUTC
    && left.allDay === right.allDay
    && left.location === right.location
    && left.description === right.description
    && left.calendarId === right.calendarId
    && left.importSource === right.importSource
    && left.icsImportId === right.icsImportId
    && left.googleEventId === right.googleEventId;
}

//null when the edit is more than checking tasks off, so the caller still derives
export function taskCompletionDocs(
  previous: readonly CalendarItemDoc[] | null,
  next: readonly CalendarItemDoc[],
): Map<string, CalendarItemDoc> | null {
  if (!previous || previous.length !== next.length) return null;
  const changed = new Map<string, CalendarItemDoc>();
  for (let i = 0; i < next.length; i++) {
    if (previous[i] === next[i]) continue;
    if (!completionSwap(previous[i], next[i])) return null;
    changed.set(next[i].id, next[i]);
  }
  return changed;
}

export function patchListedDone(listed: readonly KeywordTask[], doneKeys: readonly string[]): KeywordTask[] {
  const done = new Set(doneKeys);
  let changed = false;
  const next = listed.map((task) => {
    const isDone = done.has(task.key);
    if (isDone === task.done) return task;
    changed = true;
    return { ...task, done: isDone };
  });
  return changed ? next : listed as KeywordTask[];
}

function swapDocs(items: CalendarItemDoc[], changed: Map<string, CalendarItemDoc>): CalendarItemDoc[] {
  let next: CalendarItemDoc[] | null = null;
  for (let i = 0; i < items.length; i++) {
    const doc = changed.get(items[i].id);
    if (!doc || doc === items[i]) continue;
    next ??= items.slice();
    next[i] = doc;
  }
  return next ?? items;
}

function applyCompletion(surfaces: Surfaces, changed: Map<string, CalendarItemDoc>): Surfaces {
  if (changed.size === 0) return surfaces;
  const taskItems = swapDocs(surfaces.tasks.items, changed);
  const chatItems = swapDocs(surfaces.chat.items, changed);
  const mapItems = swapDocs(surfaces.map.items, changed);
  const events = swapDocs(surfaces.events, changed);
  if (
    taskItems === surfaces.tasks.items
    && chatItems === surfaces.chat.items
    && mapItems === surfaces.map.items
    && events === surfaces.events
  ) return surfaces;
  return {
    ...surfaces,
    tasks: taskItems === surfaces.tasks.items ? surfaces.tasks : { ...surfaces.tasks, items: taskItems },
    chat: chatItems === surfaces.chat.items ? surfaces.chat : { ...surfaces.chat, items: chatItems },
    map: mapItems === surfaces.map.items ? surfaces.map : { ...surfaces.map, items: mapItems },
    events,
  };
}

//tag and keyword edits reuse the event list already on the slice. they do not rebuild the grid
function relistTasks(tasks: TaskDerived, config: DerivedConfig): KeywordTask[] {
  const keyword = keywordTasksOf(config.keywordTasks, tasks.sources);
  const seen = new Set(keyword.map((task) => task.key));
  const done = new Set(config.keywordTasks.doneKeys);
  const deadlines = config.keywordTasks.includeDeadlines === false
    ? []
    : tasks.listed.flatMap((task) => {
      if (task.ruleId !== "deadline" || seen.has(task.key)) return [];
      return [done.has(task.key) === task.done ? task : { ...task, done: done.has(task.key) }];
    });
  const claimed = new Set(seen);
  for (const task of deadlines) claimed.add(task.key);
  const fromTags = smartTagTasksOf(config.taskSmartTags, tasks.sources, config.keywordTasks.doneKeys, claimed);
  return withTaskTags(
    dedupeSchoolAssignmentTasks(
      [...keyword, ...deadlines, ...fromTags].sort((a, b) => a.dueUTC - b.dueUTC || a.title.localeCompare(b.title)),
    ),
    config.taskSmartTags,
  );
}

function duesFromListed(previous: ReadonlyMap<string, number>, listed: readonly KeywordTask[]): ReadonlyMap<string, number> {
  const next = dueMapOf(listed);
  return dueSignatureOf(previous) === dueSignatureOf(next) ? previous : next;
}

function paintOnlyConfig(previous: DerivedConfig, config: DerivedConfig): boolean {
  if (
    previous.pendingChanges !== config.pendingChanges
    || previous.googleCalendars !== config.googleCalendars
    || previous.importedCalendars !== config.importedCalendars
    || previous.campusCalendarFeeds !== config.campusCalendarFeeds
    || previous.mergedCalendars !== config.mergedCalendars
    || previous.feedsForMerge !== config.feedsForMerge
    || previous.calendarSpaces !== config.calendarSpaces
    || previous.spaceOnlyFeeds !== config.spaceOnlyFeeds
    || previous.sources !== config.sources
    || previous.agentHiddenCalendarIds !== config.agentHiddenCalendarIds
    || previous.googleConnected !== config.googleConnected
    || previous.keywordTasks !== config.keywordTasks
    || previous.taskSmartTags !== config.taskSmartTags
  ) return false;
  return previous.colors !== config.colors
    || previous.colorOverrides !== config.colorOverrides
    || previous.shownCalendars !== config.shownCalendars;
}

function configWithCampusFeeds(config: DerivedConfig, feeds: ImportedCalendar[] | undefined): DerivedConfig {
  if (!feeds || feeds === config.campusCalendarFeeds) return config;
  return { ...config, campusCalendarFeeds: feeds, feedsForMerge: [...config.importedCalendars, ...feeds] };
}
//reuse the previous slice when the visible fields match, so context consumers stay quiet
function stabilize(prev: Surfaces | null, fresh: Surfaces): Surfaces {
  if (!prev) return fresh;
  const side = sideSignature(prev.side) === sideSignature(fresh.side) ? prev.side : fresh.side;
  const chat = chatSignature(prev.chat) === chatSignature(fresh.chat) ? prev.chat : fresh.chat;
  const tasks = taskSignature(prev.tasks) === taskSignature(fresh.tasks) ? prev.tasks : fresh.tasks;
  const map = mapSignature(prev.map) === mapSignature(fresh.map) ? prev.map : fresh.map;
  const events = eventSignature(prev.events) === eventSignature(fresh.events) ? prev.events : fresh.events;
  const displays = displaySignature(prev.displays) === displaySignature(fresh.displays) ? prev.displays : fresh.displays;
  const taskDueById = dueSignature([...prev.taskDueById].map(([key, dueUTC]) => ({ key, dueUTC })))
    === dueSignature([...fresh.taskDueById].map(([key, dueUTC]) => ({ key, dueUTC })))
    ? prev.taskDueById
    : fresh.taskDueById;
  if (
    side === prev.side
    && chat === prev.chat
    && tasks === prev.tasks
    && map === prev.map
    && events === prev.events
    && displays === prev.displays
    && taskDueById === prev.taskDueById
  ) return prev;
  return { side, chat, tasks, map, events, displays, taskDueById };
}

let derivedHold: {
  items: CalendarItemDoc[] | null;
  google: OverlayEvent[] | null;
  config: DerivedConfig | null;
  value: Surfaces | null;
} = { items: null, google: null, config: null, value: null };

let dueHold: { items: CalendarItemDoc[] | null; google: OverlayEvent[] | null; config: DerivedConfig | null; due: ReadonlyMap<string, number> } = {
  items: null,
  google: null,
  config: null,
  due: EMPTY_TASK_DUES,
};

function dueSignatureOf(map: ReadonlyMap<string, number>): string {
  return dueSignature([...map].map(([key, dueUTC]) => ({ key, dueUTC })));
}

//one derive per store snapshot, shared by the grid and the deferred panels
function deriveCalendarSurfaces(
  items: CalendarItemDoc[],
  google: OverlayEvent[],
  config: DerivedConfig,
): Surfaces {
  const held = derivedHold;
  if (held.items === items && held.google === google && held.config === config && held.value) return held.value;
  const value = computeCalendarSurfaces(items, google, config);
  derivedHold = { items, google, config, value };
  return value;
}

function rememberDues(
  items: CalendarItemDoc[],
  google: OverlayEvent[],
  config: DerivedConfig,
  due: ReadonlyMap<string, number>,
) {
  dueHold = { items, google, config, due };
}

//stable map for the sync column paint. a checked task keeps the previous map
export function currentTaskDues(
  items: CalendarItemDoc[],
  google: OverlayEvent[],
  config: DerivedConfig,
): ReadonlyMap<string, number> {
  const held = dueHold;
  if (held.items === items && held.google === google && held.config === config) return held.due;
  if (held.google === google && sameDueConfig(held.config, config) && taskCompletionDocs(held.items, items)) {
    rememberDues(items, google, config, held.due);
    return held.due;
  }
  const due = deriveCalendarSurfaces(items, google, config).taskDueById;
  const stable = dueSignatureOf(held.due) === dueSignatureOf(due) ? held.due : due;
  rememberDues(items, google, config, stable);
  return stable;
}

function computeCalendarSurfaces(
  items: CalendarItemDoc[],
  google: OverlayEvent[],
  config: DerivedConfig,
): Surfaces {
  const displayItems = mergePendingIntoItems(items, config.pendingChanges);
  const counts: Record<string, number> = {};
  for (const item of items) {
    const id = localCalendarIdOf(item.calendar);
    if (id) counts[id] = (counts[id] ?? 0) + 1;
  }

  const byMember = mergedByMember(config.mergedCalendars);
  const feedOf = (id: string) => config.feedsForMerge.find((calendar) => externalCalendarId(calendar.id) === id);
  const campusSourceIds = new Set(config.campusCalendarFeeds.map((calendar) => calendar.id));
  const external: SideExternalCalendar[] = [];
  const campus: SideExternalCalendar[] = [];
  for (const calendar of config.mergedCalendars) {
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
  const spaceFeeds = spaceOnlyFeedIds(config.calendarSpaces, config.feedsForMerge.map((feed) => feed.id));
  for (const row of externalCalendarsOf(displayItems, config.importedCalendars, new Set([...campusSourceIds, ...spaceFeeds]))) {
    if (byMember.has(row.id)) continue;
    const feed = feedOf(row.id);
    external.push({ id: row.id, name: row.name, source: row.source, feeds: feed ? [feed] : [] });
  }
  for (const calendar of config.campusCalendarFeeds) {
    const id = externalCalendarId(calendar.id);
    if (byMember.has(id)) continue;
    campus.push({ id, name: calendar.name, source: calendar.id, feeds: [calendar] });
  }

  let sidebar = config.googleCalendars;
  if (sidebar.length === 0) {
    const byId = new Map<string, GoogleCalendarRef>();
    for (const event of google) {
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
    sidebar = [...byId.values()].filter((calendar) => !isExcludedGoogleCalendarName(calendar.name));
  }

  const smartTagSamples: SmartTagTarget[] = [
    ...displayItems.map((item) => ({
      calendarId: item.calendar.importSource
        ? externalCalendarId(item.calendar.importSource)
        : localCalendarIdOf(item.calendar) ?? "events",
      title: item.title,
      location: item.calendar.location,
      description: item.calendar.description,
    })),
    ...google.map((event) => ({
      calendarId: event.calendarId,
      title: event.title,
      location: event.location,
      description: event.description,
    })),
  ];

  const mentions: MentionCalendar[] = config.shownCalendars
    .filter((calendar) => !isAgentCalendarHidden(config.agentHiddenCalendarIds, calendar.id))
    .map((calendar) => ({
      id: calendar.id,
      name: calendar.name,
      kind: calendar.kind,
      color: calendarSwatchColor(calendar.id, config.colors, config.colorOverrides),
      readOnly: isCalendarReadOnly(config.sources, calendar.id),
    }));
  for (const calendar of [...external, ...campus]) {
    if (isAgentCalendarHidden(config.agentHiddenCalendarIds, calendar.id)) continue;
    mentions.push({
      id: calendar.id,
      name: calendar.name,
      kind: "event",
      color: calendarSwatchColor(calendar.id, config.colors, config.colorOverrides),
      readOnly: true,
      ...(calendar.merged ? { memberIds: calendar.feeds.map((feed) => externalCalendarId(feed.id)) } : {}),
    });
  }
  if ((config.googleConnected || google.length > 0) && !isAgentCalendarHidden(config.agentHiddenCalendarIds, "google")) {
    mentions.push({
      id: "google",
      name: "Google Calendar",
      kind: "event",
      color: config.colors.google,
      readOnly: true,
    });
  }

  const chatItems: CalendarItemDoc[] = [
    ...displayItems,
    ...google.map((event) => ({
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
    })),
  ];

  const mergedTaskItems = mergeTimeline(
    [
      ...displayItems
        .filter((item) => item.calendar.kind === "event" && !item.pendingApproval && !item.editorDraft && itemOnMainCalendar(item.calendar.importSource, config.spaceOnlyFeeds))
        .map(timelineItemOf),
      ...google.map(overlayTimelineItemOf),
    ],
    config.mergedCalendars,
    config.feedsForMerge,
  );
  const sources: KeywordTaskSource[] = mergedTaskItems.flatMap((item): KeywordTaskSource[] => {
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
  });
  const derivedKeywordTasks = keywordTasksOf(config.keywordTasks, sources);
  const deadlineSources = config.keywordTasks.includeDeadlines === false
    ? []
    : bottomDeadlines(mergedTaskItems, config.feedsForMerge).flatMap((item): KeywordTaskSource[] => {
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
    });
  const seenDeadlines = new Set(derivedKeywordTasks.map((task) => task.key));
  const deadlineTasks = deadlineTasksOf(deadlineSources, config.keywordTasks.doneKeys).filter((task) => !seenDeadlines.has(task.key));
  const claimed = new Set([...derivedKeywordTasks, ...deadlineTasks].map((task) => task.key));
  const fromTags = smartTagTasksOf(config.taskSmartTags, sources, config.keywordTasks.doneKeys, claimed);
  const listed = withTaskTags(
    dedupeSchoolAssignmentTasks([...derivedKeywordTasks, ...deadlineTasks, ...fromTags].sort((a, b) => a.dueUTC - b.dueUTC || a.title.localeCompare(b.title))),
    config.taskSmartTags,
  );
  const taskItems = displayItems.filter((item) => item.calendar.kind === "task");
  const taskTagSamples: SmartTagTarget[] = [
    ...sources.map((source) => ({
      calendarId: source.calendarId,
      title: source.title,
      location: source.location,
      description: source.description,
    })),
    ...displayItems
      .filter((item) => item.calendar.kind === "task" && !item.editorDraft)
      .map((item) => ({
        calendarId: item.calendar.importSource
          ? externalCalendarId(item.calendar.importSource)
          : localCalendarIdOf(item.calendar) ?? "events",
        title: item.title,
        location: item.calendar.location,
        description: item.calendar.description,
      })),
  ];
  const taskCalendars: KeywordTaskCalendarOption[] = [
    ...external.map((calendar) => ({ id: calendar.id, name: calendar.name, group: "Imported" as const })),
    ...campus.map((calendar) => ({ id: calendar.id, name: calendar.name, group: "UWaterloo Events" as const })),
    ...sidebar
      .filter((calendar) => !isExcludedGoogleCalendarName(calendar.name))
      .map((calendar) => ({ id: calendar.id, name: calendar.name, group: "Google" as const })),
    ...config.shownCalendars
      .filter((calendar) => calendar.kind === "event")
      .map((calendar) => ({ id: calendar.id, name: calendar.name, group: "WatAgent" as const })),
  ];

  const choices: SpaceCalendarChoice[] = [
    ...config.shownCalendars.map((entry) => ({
      id: entry.id,
      name: entry.name,
      color: calendarSwatchColor(entry.id, config.colors, config.colorOverrides),
      group: "WatAgent" as const,
    })),
    ...external.map((entry) => ({
      id: entry.id,
      name: entry.name,
      color: calendarSwatchColor(entry.id, config.colors, config.colorOverrides),
      group: "Imported" as const,
    })),
    ...campus.map((entry) => ({
      id: entry.id,
      name: entry.name,
      color: calendarSwatchColor(entry.id, config.colors, config.colorOverrides),
      group: "UWaterloo Events" as const,
    })),
    ...sidebar
      .filter((entry) => !isExcludedGoogleCalendarName(entry.name))
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        color: config.colorOverrides[entry.id] || entry.color || config.colors.google,
        group: "Google" as const,
      })),
  ];

  return {
    side: {
      externalCalendars: external,
      campusCalendars: campus,
      googleCalendars: sidebar,
      localCalendarCounts: counts,
      smartTagSamples,
      taskTagSamples,
    },
    chat: { mentions, items: chatItems },
    tasks: { items: taskItems, listed, sources, calendars: taskCalendars },
    map: {
      items: displayItems.filter((item) => itemOnMainCalendar(item.calendar.importSource, config.spaceOnlyFeeds)),
      overlayEvents: google,
    },
    events: items,
    displays: { samples: smartTagSamples, choices },
    taskDueById: dueMapOf(listed),
  };
}

export function DerivedProvider({
  config,
  mentionsRef,
  campusFeedsRef,
  children,
}: {
  config: DerivedConfig;
  mentionsRef: MutableRefObject<MentionCalendar[]>;
  campusFeedsRef?: MutableRefObject<ImportedCalendar[]>;
  children: ReactNode;
}) {
  const store = useEventStore();
  const configRef = useRef(config);
  const [slices, setSlices] = useState<Surfaces>(() => deriveCalendarSurfaces(store.getAllItems(), store.getAllGoogle(), config));
  const slicesRef = useRef(slices);
  slicesRef.current = slices;
  const liveConfig = () => configWithCampusFeeds(configRef.current, campusFeedsRef?.current);

  //filters and rules changed. fold that in before children read the context
  let shown = slices;
  if (configRef.current !== config) {
    const previous = configRef.current;
    configRef.current = config;
    const live = liveConfig();
    if (live === config && recolorOnlyConfigChange(previous, config)) {
      shown = slices;
    } else if (live === config && spacePresentationOnlyChange(previous, config)) {
      //quick display tags and colors paint through the day matcher, same as the main calendar
      shown = slices;
      rememberDues(store.getAllItems(), store.getAllGoogle(), live, slices.taskDueById);
    } else if (live === config && taskListOnlyChange(previous, config)) {
      const doneOnly = previous.taskSmartTags === config.taskSmartTags
        && keywordDoneOnly(previous.keywordTasks, config.keywordTasks);
      if (doneOnly) {
        const listed = patchListedDone(slices.tasks.listed, config.keywordTasks.doneKeys);
        rememberDues(store.getAllItems(), store.getAllGoogle(), live, slices.taskDueById);
        if (listed !== slices.tasks.listed) {
          shown = { ...slices, tasks: { ...slices.tasks, listed } };
          setSlices(shown);
        }
      } else if (previous.keywordTasks.rules === config.keywordTasks.rules && previous.keywordTasks.includeDeadlines === config.keywordTasks.includeDeadlines) {
        //the editor paints now. matching events join the list after that frame, same as calendar tags
        rememberDues(store.getAllItems(), store.getAllGoogle(), live, slices.taskDueById);
        const snapshot = live;
        startTransition(() => {
          setSlices((current) => {
            const listed = relistTasks(current.tasks, snapshot);
            const taskDueById = duesFromListed(current.taskDueById, listed);
            rememberDues(store.getAllItems(), store.getAllGoogle(), snapshot, taskDueById);
            if (listed === current.tasks.listed && taskDueById === current.taskDueById) return current;
            return { ...current, tasks: { ...current.tasks, listed }, taskDueById };
          });
        });
      } else {
        const snapshot = live;
        startTransition(() => {
          setSlices((current) => stabilize(current, deriveCalendarSurfaces(store.getAllItems(), store.getAllGoogle(), snapshot)));
        });
      }
    } else if (live === config && paintOnlyConfig(previous, config)) {
      const snapshot = live;
      startTransition(() => {
        setSlices((current) => {
          const next = stabilize(current, repaintCalendarSurfaces(current, snapshot));
          return next === current ? current : next;
        });
      });
    } else {
      const onlyCampusFeeds = previous.campusCalendarFeeds !== config.campusCalendarFeeds
        && previous.importedCalendars === config.importedCalendars
        && previous.mergedCalendars === config.mergedCalendars
        && previous.sources === config.sources
        && previous.colorOverrides === config.colorOverrides
        && previous.colors === config.colors
        && previous.pendingChanges === config.pendingChanges
        && previous.googleCalendars === config.googleCalendars
        && previous.shownCalendars === config.shownCalendars
        && previous.keywordTasks === config.keywordTasks
        && previous.taskSmartTags === config.taskSmartTags
        && previous.calendarSpaces === config.calendarSpaces
        && previous.agentHiddenCalendarIds === config.agentHiddenCalendarIds
        && previous.googleConnected === config.googleConnected;
      //a subscription toggle only adds or removes a campus row. patch that now; the full surfaces follow the switch spring
      if (onlyCampusFeeds) {
        const campusCalendars = patchCampusRows(slices.side.campusCalendars, live.campusCalendarFeeds);
        if (campusCalendars !== slices.side.campusCalendars) {
          shown = { ...slices, side: { ...slices.side, campusCalendars } };
          setSlices(shown);
        }
        afterMotion(() => {
          startTransition(() => {
            setSlices((current) => stabilize(current, deriveCalendarSurfaces(store.getAllItems(), store.getAllGoogle(), liveConfig())));
          });
        });
      } else {
        const next = stabilize(slices, deriveCalendarSurfaces(store.getAllItems(), store.getAllGoogle(), live));
        if (next !== slices) {
          shown = next;
          setSlices(next);
        }
      }
    }
  }
  mentionsRef.current = shown.chat.mentions;

  useLayoutEffect(() => {
    const pull = () => {
      const items = store.getAllItems();
      const google = store.getAllGoogle();
      const config = liveConfig();
      const changed = taskCompletionDocs(derivedHold.items, items);
      //checking a task off flips that row. it does not rebuild mentions, tags, or the other days
      if (changed && derivedHold.value && derivedHold.google === google && sameDueConfig(derivedHold.config, config)) {
        if (changed.size === 0) return;
        const next = applyCompletion(slicesRef.current, changed);
        //the row is already on the list. otherwise fall through and derive it in
        if (next !== slicesRef.current) {
          derivedHold = { items, google, config, value: next };
          rememberDues(items, google, config, next.taskDueById);
          mentionsRef.current = next.chat.mentions;
          setSlices(next);
          return;
        }
      }
      startTransition(() => {
        setSlices((current) => {
          const next = stabilize(current, deriveCalendarSurfaces(store.getAllItems(), store.getAllGoogle(), liveConfig()));
          mentionsRef.current = next.chat.mentions;
          return next;
        });
      });
    };
    const unsubItems = store.subscribeAll(pull);
    const unsubGoogle = store.subscribeGoogle(pull);
    return () => {
      unsubItems();
      unsubGoogle();
    };
  }, [store, mentionsRef]);

  return (
    <TaskDueContext.Provider value={shown.taskDueById}>
      <SideContext.Provider value={shown.side}>
        <ChatContext.Provider value={shown.chat}>
          <TaskContext.Provider value={shown.tasks}>
            <MapContext.Provider value={shown.map}>
              <EventItemsContext.Provider value={shown.events}>
                <DisplayContext.Provider value={shown.displays}>
                  {children}
                </DisplayContext.Provider>
              </EventItemsContext.Provider>
            </MapContext.Provider>
          </TaskContext.Provider>
        </ChatContext.Provider>
      </SideContext.Provider>
    </TaskDueContext.Provider>
  );
}

export function useSideDerived(): SideDerived {
  return useContext(SideContext);
}

export function useChatDerived(): ChatDerived {
  return useContext(ChatContext);
}

export function useTaskDerived(): TaskDerived {
  return useContext(TaskContext);
}

export function useMapDerived(): MapDerived {
  return useContext(MapContext);
}

export function useEventItems(): CalendarItemDoc[] {
  return useContext(EventItemsContext);
}

export function useDisplayDerived(): DisplayDerived {
  return useContext(DisplayContext);
}
