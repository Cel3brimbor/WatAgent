"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { flushSync } from "react-dom";
import { configureMerge } from "./merge-function";
import { MergeFunctionDialog } from "./merge-function-dialog";
import { RuleEditor } from "@/agent/rules/rule-editor";
import {
  deleteAgentRule,
  runAgentRules,
  ruleRunSummary,
  updateAgentRule,
  type AgentRule,
  type AgentRuleDraft,
  type RuleFeed,
} from "@/agent/rules/rules-client";
import type { AgentRulesState } from "@/agent/rules/use-agent-rules";
import { sharedEventCounts } from "@/calendar/calendar-merge";
import { feedSyncProgressLabel, formatFeedSyncSummary, syncImportedFeed } from "@/calendar/calendar-sync";
import { calendarIdForMeta } from "@/calendar/calendar-ownership";
import {
  CalendarsBoard,
  type CalGroup,
  type CalPresentation,
  type CalSegment,
  type CalendarRowModel,
  type MergeModel,
  type RuleModel,
} from "@/calendar/calendars-board";
import {
  CalendarMap,
  createLocalLayoutStore,
  type MapChange,
  type MapEdge,
  type MapFunction,
  type MapNode,
  type MapNodeDrop,
  type MapToggle,
} from "@/features/calendar-map";
import { ChatIcon, EyeIcon, EyeOffIcon, LockIcon, RouteIcon, ShieldCheckIcon, SyncIcon } from "@/shared/icons";
import { calendarItemVisible, externalCalendarId, externalCalendarShown, externalCalendarsOf } from "@/calendar/external-calendars";
import { feedOfCalendarId, mergedByMember, newMergedCalendarId } from "@/calendar/imported-calendars";
import { RenameCalendarDialog } from "@/calendar/imported-calendars-panel";
import {
  calendarIdField,
  isBuiltinLocalCalendarId,
  isPrimaryEventCalendarId,
  type LocalCalendar,
} from "@/calendar/local-calendars";
import { boxesOf, commitBoxes, moveInBoxes, newBoxName, TRAY, type Boxes, type MergeBox } from "@/calendar/merge-board";
import {
  calendarGroupsOf,
  calendarSwatchColor,
  isCalendarReadOnly,
  isAgentCalendarHidden,
  protectAgentHiddenIds,
  readMergeDrafts,
  setCalendarReadOnly,
  withNewCalendar,
  writeMergeDrafts,
  type CalendarColors,
  type CalendarSourceFilter,
} from "@/calendar/preferences";
import { timelineItemOf, type OverlayEvent } from "@/calendar/timeline";
import type { CalendarItemDoc, ImportedCalendar, MergedCalendar } from "@/calendar/types";
import { ConfirmDialog } from "@/shared/confirm-dialog";
import { usePresence } from "@/shared/use-presence";

const AGENT = "agent";
const GOOGLE = "google";
const mergeFunctionId = (id: string) => `merge-function:${id}`;
const VIEW_KEY = "watagent.calendars.view.v1";
const layoutStore = createLocalLayoutStore("watagent.calendarMap.layout.v2");
const UNDO_DEPTH = 10;
const TOAST_MS = 6000;
const GROUP_KEYS: CalGroup[] = ["watagent", "imported", "campus", "google"];

type Change = { message: string; undo?: () => void };
type Toast = { key: number; message: string; change?: Change };

type Props = {
  items: CalendarItemDoc[];
  overlayEvents: OverlayEvent[];
  mergedCalendars: MergedCalendar[];
  onMergedCalendars: Dispatch<SetStateAction<MergedCalendar[]>>;
  /** Calendars whose link to the Agent was deleted, so the Agent can't see them. */
  agentHiddenIds: string[];
  onAgentHiddenIds: Dispatch<SetStateAction<string[]>>;
  /** Whether a calendar you add, including a new merged calendar, starts shown on the calendar. */
  newCalendarsShown: boolean;
  onNewCalendarsShown: (shown: boolean) => void;
  sources: CalendarSourceFilter;
  onSources: Dispatch<SetStateAction<CalendarSourceFilter>>;
  importedCalendars: ImportedCalendar[];
  /** UWaterloo event feeds. Kept off the external list so they can't flash as an imported calendar. */
  campusCalendars: ImportedCalendar[];
  colors: CalendarColors;
  colorOverrides: Record<string, string>;
  localCalendars: LocalCalendar[];
  googleConnected: boolean | null;
  requireAiApproval: boolean;
  onRequireAiApproval: (value: boolean) => Promise<void>;
  onRefresh: () => Promise<void>;
  onSyncGoogle: () => Promise<number | null>;
  onAskAgent: (calendarId: string) => void;
  onReviewPending: () => void;
  rules: AgentRule[];
  rulesStatus: AgentRulesState["status"];
  onRulesChanged: () => Promise<void>;
  onRefreshPending: () => Promise<void>;
};

const feedSourceOf = feedOfCalendarId;

function ordinal(rank: number): string {
  const tens = rank % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[rank % 10] ?? "th");
  return `${rank}${suffix}`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function ago(at: number): string {
  const minutes = Math.round((at - Date.now()) / 60000);
  if (Math.abs(minutes) < 60) return RELATIVE.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return RELATIVE.format(hours, "hour");
  return RELATIVE.format(Math.round(hours / 24), "day");
}

function readView(): { segment: CalSegment; groups: Record<CalGroup, boolean>; presentation: CalPresentation } {
  const groups: Record<CalGroup, boolean> = { watagent: true, imported: true, campus: true, google: true };
  const presentation: CalPresentation = "list";
  try {
    const raw = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "");
    const segment: CalSegment = raw?.segment === "merged" || raw?.segment === "rules" ? raw.segment : "calendars";
    if (raw?.groups && typeof raw.groups === "object") {
      for (const key of GROUP_KEYS) if (typeof raw.groups[key] === "boolean") groups[key] = raw.groups[key];
    }
    return { segment, groups, presentation: raw?.presentation === "graph" ? "graph" : "list" };
  } catch {
    return { segment: "calendars", groups, presentation };
  }
}

export function CalendarMapSection({
  items,
  overlayEvents,
  mergedCalendars,
  onMergedCalendars,
  agentHiddenIds,
  onAgentHiddenIds,
  newCalendarsShown,
  onNewCalendarsShown,
  sources,
  onSources,
  importedCalendars,
  campusCalendars,
  colors,
  colorOverrides,
  localCalendars,
  googleConnected,
  requireAiApproval,
  onRequireAiApproval,
  onRefresh,
  onSyncGoogle,
  onAskAgent,
  onReviewPending,
  rules,
  rulesStatus,
  onRulesChanged,
  onRefreshPending,
}: Props) {
  const [mergeEditor, setMergeEditor] = useState<{ id?: string; source?: string } | null>(null);
  const [syncing, setSyncing] = useState<string[]>([]);
  const [syncProgress, setSyncProgress] = useState<Record<string, { done: number; total: number | null; label: string }>>({});
  const [editor, setEditor] = useState<{ rule?: AgentRule; initial?: Partial<AgentRuleDraft> } | null>(null);
  const [deleting, setDeleting] = useState<AgentRule | null>(null);
  const [deletingBox, setDeletingBox] = useState<MergeBox | null>(null);
  const [renamingBox, setRenamingBox] = useState<MergeBox | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [runningRuleId, setRunningRuleId] = useState<string | null>(null);
  const [segment, setSegment] = useState<CalSegment>("calendars");
  const [presentation, setPresentation] = useState<CalPresentation>("list");
  const [groupsOpen, setGroupsOpen] = useState<Record<CalGroup, boolean>>({ watagent: true, imported: true, campus: true, google: true });
  const [viewReady, setViewReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [drafts, setDrafts] = useState<MergeBox[]>([]);
  const undoStack = useRef<Change[]>([]);
  const undoRef = useRef<() => void>(() => undefined);
  const toastKey = useRef(0);
  const editorPresence = usePresence(editor);
  const deletePresence = usePresence(deleting);
  const deleteBoxPresence = usePresence(deletingBox);

  useEffect(() => {
    setDrafts(readMergeDrafts());
    const saved = readView();
    setSegment(saved.segment);
    setPresentation(saved.presentation);
    setGroupsOpen(saved.groups);
    setViewReady(true);
  }, []);

  useEffect(() => {
    if (!viewReady) return;
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify({ segment, groups: groupsOpen, presentation }));
    } catch {
      return;
    }
  }, [segment, groupsOpen, presentation, viewReady]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast((current) => (current?.key === toast.key ? null : current)), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.key.toLowerCase() !== "z") return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
        return;
      event.preventDefault();
      undoRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = calendarGroupsOf(sources.groups);
  const campusSources = useMemo(() => new Set(campusCalendars.map((calendar) => calendar.id)), [campusCalendars]);
  const feeds = useMemo(() => {
    const external = externalCalendarsOf(items, importedCalendars, campusSources);
    const seen = new Set(external.map((feed) => feed.id));
    const campus = campusCalendars.flatMap((calendar) => {
      const id = externalCalendarId(calendar.id);
      if (seen.has(id)) return [];
      return [{ id, name: calendar.name, source: calendar.id, url: calendar.url }];
    });
    return [...external, ...campus];
  }, [items, importedCalendars, campusCalendars, campusSources]);
  const showGoogle = googleConnected === true || overlayEvents.length > 0;
  const memberOf = useMemo(() => mergedByMember(mergedCalendars), [mergedCalendars]);
  const isMerged = (id: string) => mergedCalendars.some((calendar) => calendar.id === id);
  const openDrafts = useMemo(
    () => drafts.filter((box) => !mergedCalendars.some((calendar) => calendar.id === box.id)),
    [drafts, mergedCalendars],
  );
  const boxList = useMemo<MergeBox[]>(() => [...mergedCalendars, ...openDrafts], [mergedCalendars, openDrafts]);
  const isBox = (id: string) => boxList.some((box) => box.id === id);
  const savedBoxes = useMemo(
    () =>
      boxesOf(
        feeds.map((feed) => feed.id),
        boxList,
      ),
    [feeds, boxList],
  );
  const boxHolding = (feed: string) => boxList.find((box) => savedBoxes[box.id]?.includes(feed));

  const names = useMemo(() => {
    const out = new Map<string, string>([
      [AGENT, "Agent"],
      [GOOGLE, "Google Calendar"],
    ]);
    for (const calendar of localCalendars) out.set(calendar.id, calendar.name);
    for (const feed of feeds) out.set(feed.id, feed.name);
    for (const box of boxList) out.set(box.id, box.name);
    return out;
  }, [localCalendars, feeds, boxList]);
  const nameOf = (id: string) => names.get(id) ?? id;

  const counts = useMemo(() => {
    const saved = new Map<string, number>();
    const savedTasks = new Map<string, number>();
    const pending = new Map<string, number>();
    for (const item of items) {
      const id = calendarIdForMeta(item.calendar);
      if (!id || item.editorDraft) continue;
      if (item.pendingApproval) {
        pending.set(id, (pending.get(id) ?? 0) + 1);
        continue;
      }
      saved.set(id, (saved.get(id) ?? 0) + 1);
      if (item.calendar.kind === "task") savedTasks.set(id, (savedTasks.get(id) ?? 0) + 1);
    }
    return { saved, savedTasks, pending };
  }, [items]);

  function savedAmount(id: string): string {
    const total = counts.saved.get(id) ?? 0;
    const tasks = counts.savedTasks.get(id) ?? 0;
    const events = total - tasks;
    const parts = [events ? plural(events, "event") : "", tasks ? plural(tasks, "task") : ""].filter(Boolean);
    return parts.join(", ") || "0 events";
  }

  const shared = useMemo(
    () => sharedEventCounts(items.map(timelineItemOf), mergedCalendars, importedCalendars),
    [items, mergedCalendars, importedCalendars],
  );

  function shownOnGrid(id: string): boolean {
    if (id === GOOGLE) return sources.google && groups.other;
    if (isMerged(id)) return externalCalendarShown(id, sources);
    const feed = feedSourceOf(id);
    const calendar = feed
      ? { kind: "event" as const, importSource: feed }
      : { kind: "event" as const, calendarId: calendarIdField(id) };
    return calendarItemVisible(
      { id: "", title: "", createdAt: 0, updatedAt: 0, calendar: { ...calendar, startUTC: 1, endUTC: 2, allDay: false } },
      sources,
      mergedCalendars,
      campusSources,
    );
  }

  function hiddenElsewhere(id: string): boolean {
    if (id === GOOGLE) return !groups.other;
    if (sources.hiddenIds.includes(id) && !groups.hidden) return true;
    const feed = feedSourceOf(id);
    if (feed && campusSources.has(feed)) return !groups.campus;
    return feed || isMerged(id) ? !groups.external : !groups.watagent;
  }

  const agentHidden = (id: string) => isAgentCalendarHidden(agentHiddenIds, id);
  const readOnly = (id: string) => id !== AGENT && id !== GOOGLE && isCalendarReadOnly(sources, id);
  const linkOf = (id: string) =>
    importedCalendars.find((calendar) => externalCalendarId(calendar.id) === id)
    ?? campusCalendars.find((calendar) => externalCalendarId(calendar.id) === id);

  function tell(message: string, change?: Change) {
    toastKey.current += 1;
    setToast({ key: toastKey.current, message, change });
  }

  function commit(change: Change) {
    if (change.undo && change.message !== "Nothing changed") undoStack.current = [...undoStack.current, change].slice(-UNDO_DEPTH);
    tell(change.message, change.undo && change.message !== "Nothing changed" ? change : undefined);
  }

  function undo(change?: Change) {
    const target = change ?? undoStack.current[undoStack.current.length - 1];
    if (!target?.undo || !undoStack.current.includes(target)) return;
    undoStack.current = undoStack.current.filter((entry) => entry !== target);
    target.undo();
    tell(`Undone: ${target.message}`);
  }
  undoRef.current = () => undo();

  async function run(action: () => Change | void | Promise<Change | void>) {
    try {
      const change = await action();
      if (change) commit(change);
    } catch (err) {
      tell(err instanceof Error && err.message ? err.message : "That didn't work. Try again.");
    }
  }

  function setAgentAccess(id: string, access: boolean): Change {
    if (!access && isBuiltinLocalCalendarId(id)) return { message: "Nothing changed" };
    const before = agentHiddenIds;
    onAgentHiddenIds((current) =>
      protectAgentHiddenIds(access ? current.filter((entry) => entry !== id) : [...new Set([...current, id])]),
    );
    return {
      message: access ? `The Agent can see ${nameOf(id)} again` : `The Agent can no longer see ${nameOf(id)}`,
      undo: () => onAgentHiddenIds(before),
    };
  }

  function saveDrafts(next: MergeBox[]) {
    setDrafts(next);
    writeMergeDrafts(next);
  }

  function applyBoxes(next: Boxes): Change {
    if (next === savedBoxes) return { message: "Nothing changed" };
    const result = commitBoxes(next, mergedCalendars, openDrafts, nameOf);
    if (result.changes.length === 0) return { message: "Nothing changed" };
    const before = { merged: mergedCalendars, drafts: openDrafts };
    onMergedCalendars(result.merged);
    saveDrafts(result.drafts);
    for (const created of result.created) onSources((current) => withNewCalendar(current, created.id, newCalendarsShown));
    const waiting = result.drafts.filter((box) => box.members.length === 1).map((box) => box.name);
    return {
      message:
        result.changes.join(". ") +
        (waiting.length ? `. Add one more calendar to ${waiting.join(" and ")} to merge it` : "") +
        (result.created.length && !newCalendarsShown ? ". New calendars start hidden. Turn on Show on calendar." : ""),
      undo: () => {
        onMergedCalendars(before.merged);
        saveDrafts(before.drafts);
      },
    };
  }

  function dropInto(boxId: string, feed: string): Change {
    return applyBoxes(moveInBoxes(savedBoxes, feed, boxId));
  }

  function takeOut(feed: string): Change {
    return applyBoxes(moveInBoxes(savedBoxes, feed, TRAY));
  }

  function setRank(boxId: string, feed: string, rank: number): Change {
    const members = (savedBoxes[boxId] ?? []).filter((member) => member !== feed);
    members.splice(Math.max(0, Math.min(rank, members.length)), 0, feed);
    return applyBoxes({ ...savedBoxes, [boxId]: members });
  }

  function saveMerge(name: string, members: string[]) {
    const id = mergeEditor?.id ?? newMergedCalendarId();
    const existing = boxList.find((box) => box.id === id);
    const before = { merged: mergedCalendars, drafts: openDrafts, sources };
    const result = configureMerge(
      { id, name, members },
      feeds.map((feed) => feed.id),
      mergedCalendars,
      openDrafts,
      nameOf,
    );
    onMergedCalendars(result.merged);
    saveDrafts(result.drafts);
    if (!isMerged(id)) onSources((current) => withNewCalendar(current, id, newCalendarsShown));
    setMergeEditor(null);
    commit({
      message: `${name} ${existing ? "updated" : "created"} with Merge`,
      undo: () => {
        onMergedCalendars(before.merged);
        saveDrafts(before.drafts);
        onSources(before.sources);
      },
    });
  }

  function deleteBox(box: MergeBox): Change {
    const members = savedBoxes[box.id] ?? [];
    const before = { merged: mergedCalendars, drafts: openDrafts };
    if (isMerged(box.id)) onMergedCalendars(mergedCalendars.filter((calendar) => calendar.id !== box.id));
    saveDrafts(openDrafts.filter((entry) => entry.id !== box.id));
    return {
      message: members.length
        ? `${box.name} deleted. ${members.map(nameOf).join(" and ")} ${members.length === 1 ? "shows on its own" : "show on their own"} again`
        : `${box.name} deleted`,
      undo: () => {
        onMergedCalendars(before.merged);
        saveDrafts(before.drafts);
      },
    };
  }

  function renameBox(box: MergeBox, name: string) {
    if (isMerged(box.id)) onMergedCalendars(mergedCalendars.map((calendar) => (calendar.id === box.id ? { ...calendar, name } : calendar)));
    else saveDrafts(openDrafts.map((entry) => (entry.id === box.id ? { ...entry, name } : entry)));
  }

  function setShown(id: string, shown: boolean) {
    onSources((current) => {
      if (id === GOOGLE) return { ...current, google: shown };
      if (id === "events") return { ...current, events: shown };
      const muted = current.mutedGoogleIds.filter((item) => item !== id);
      return { ...current, mutedGoogleIds: shown ? muted : [...muted, id] };
    });
  }

  function toggleShown(id: string, shown: boolean): Change {
    const was = shownOnGrid(id);
    if (shown === was) return { message: "Nothing changed" };
    if (shown && hiddenElsewhere(id)) throw new Error(`${nameOf(id)} is hidden from the side panel. Show it there.`);
    setShown(id, shown);
    return {
      message: shown ? `${nameOf(id)} shown on the calendar` : `${nameOf(id)} hidden from the calendar`,
      undo: () => setShown(id, was),
    };
  }

  function setLocked(id: string, locked: boolean) {
    if (isBuiltinLocalCalendarId(id)) return;
    onSources((current) => setCalendarReadOnly(current, id, locked));
  }

  function toggleLock(id: string, locked: boolean): Change {
    const was = readOnly(id);
    if (was === locked) return { message: "Nothing changed" };
    setLocked(id, locked);
    return {
      message: locked ? `${nameOf(id)} is read only for you and the Agent` : `${nameOf(id)} can be changed again`,
      undo: () => setLocked(id, was),
    };
  }

  function meter(id: string, progress: { done: number; total: number | null; label: string } | null) {
    //ndjson can deliver many progress lines in one read; flush so the graph and merge panes paint between them
    flushSync(() => {
      setSyncProgress((current) => {
        if (!progress) {
          if (!(id in current)) return current;
          const next = { ...current };
          delete next[id];
          return next;
        }
        return { ...current, [id]: progress };
      });
    });
  }

  async function sync(id: string): Promise<Change> {
    setSyncing((current) => [...current, id]);
    meter(id, { done: 0, total: null, label: `Syncing ${nameOf(id)}…` });
    try {
      if (id === GOOGLE) {
        await onSyncGoogle();
        return { message: "Google Calendar synced" };
      }
      const targets = (isBox(id) ? (savedBoxes[id] ?? []) : [id]).map(linkOf);
      if (targets.length === 0) throw new Error(`${nameOf(id)} has no calendars to sync yet.`);
      if (targets.some((target) => !target)) throw new Error(`${nameOf(id)} has no calendar link to sync.`);
      const lines: string[] = [];
      for (const target of targets as ImportedCalendar[]) {
        meter(id, { done: 0, total: null, label: `Opening ${target.name}…` });
        const result = await syncImportedFeed(target, (progress) => meter(id, { ...progress, label: feedSyncProgressLabel(target.name, progress) }));
        lines.push(formatFeedSyncSummary(target.name, result));
      }
      await onRefresh();
      return { message: lines.join(" ") };
    } finally {
      setSyncing((current) => current.filter((entry) => entry !== id));
      meter(id, null);
    }
  }

  function ruleDetails(rule: AgentRule): string[] {
    const runAt = rule.lastRun;
    const did = runAt
      ? runAt.status === "failed"
        ? `Last run ${ago(runAt.startedAt)} didn't finish${runAt.error ? `: ${runAt.error}` : "."}`
        : `Last ran ${ago(runAt.startedAt)}: ${[`${runAt.added} added`, runAt.updated ? `${runAt.updated} updated` : null, runAt.removed ? `${runAt.removed} removed` : null, `${runAt.skipped} skipped`].filter(Boolean).join(", ")}.`
      : "Hasn't run yet. It runs whenever the feed syncs, or use Run now.";
    return [
      `“${rule.instruction}”`,
      `Watches ${nameOf(externalCalendarId(rule.sourceFeed))}${rule.titleContains ? ` for titles containing “${rule.titleContains}”` : ""} up to ${rule.lookaheadDays} days ahead, and adds to ${nameOf(rule.targetCalendarId)}.`,
      rule.requireApproval ? "Asks before adding." : "Adds without asking.",
      did,
      ...(rule.enabled ? [] : ["Paused. It won't run when the feed syncs."]),
    ];
  }

  function accessSentence(unseen: boolean, locked: boolean): string {
    if (unseen) return "The Agent can’t see this.";
    if (locked) return "The Agent can read this, and can’t change it.";
    return "The Agent can add, change, and delete events here.";
  }

  function showState(id: string): { shown: boolean | null; showBlocked?: string } {
    if (memberOf.has(id)) return { shown: null };
    const shown = shownOnGrid(id);
    return {
      shown,
      showBlocked: !shown && hiddenElsewhere(id) ? `${nameOf(id)} is hidden from the side panel. Show it there.` : undefined,
    };
  }

  function syncState(id: string): Pick<CalendarRowModel, "sync" | "syncBlocked" | "connection"> {
    const linked =
      id === GOOGLE
        ? googleConnected === true
          ? { sync: "ready" as const, connection: "Connected" }
          : {
              sync: "blocked" as const,
              connection: googleConnected === false ? "Not connected" : "Checking connection",
              syncBlocked: "Link Google Calendar in Settings first.",
            }
        : linkOf(id)
          ? { sync: "ready" as const, connection: "Linked" }
          : { sync: "blocked" as const, connection: "No link", syncBlocked: `${nameOf(id)} has no calendar link to sync.` };
    return syncing.includes(id) ? { ...linked, sync: "busy" } : linked;
  }

  const rows = useMemo<CalendarRowModel[]>(() => {
    const list: CalendarRowModel[] = [];
    for (const calendar of localCalendars) {
      const locked = readOnly(calendar.id);
      const unseen = agentHidden(calendar.id);
      const visibility = showState(calendar.id);
      const amount = savedAmount(calendar.id);
      list.push({
        id: calendar.id,
        name: calendar.name,
        color: calendarSwatchColor(calendar.id, colors, colorOverrides),
        group: "watagent",
        caption: [
          locked ? "Read only" : isPrimaryEventCalendarId(calendar.id) ? "Default" : null,
          visibility.shown === false ? "Hidden" : null,
          unseen ? "Agent can’t see" : null,
          amount,
        ]
          .filter(Boolean)
          .join(" · "),
        ...visibility,
        agent: !unseen,
        agentEditable: !isBuiltinLocalCalendarId(calendar.id),
        agentSentence: isBuiltinLocalCalendarId(calendar.id)
          ? "The Agent always sees this calendar."
          : accessSentence(unseen, locked),
        lock: locked,
        lockEditable: !isBuiltinLocalCalendarId(calendar.id),
        lockSentence: locked ? "You and the Agent can’t change its events." : "You and the Agent can change its events.",
        pending: !unseen && !locked ? (counts.pending.get(calendar.id) ?? 0) : 0,
        approvalOn: requireAiApproval,
        canAsk: true,
        askBlocked: unseen ? `The Agent can’t see ${calendar.name}. Turn on Agent can see this first.` : undefined,
        sync: "hidden",
        landing: isPrimaryEventCalendarId(calendar.id)
          ? "New events and tasks land here unless you name another calendar."
          : undefined,
      });
    }
    for (const feed of feeds) {
      const merged = memberOf.get(feed.id);
      const waiting = merged ? undefined : boxHolding(feed.id);
      const locked = true;
      const unseen = agentHidden(feed.id);
      const visibility = showState(feed.id);
      const amount = plural(counts.saved.get(feed.id) ?? 0, "event");
      const campus = campusSources.has(feed.source);
      list.push({
        id: feed.id,
        name: feed.name,
        color: calendarSwatchColor(feed.id, colors, colorOverrides),
        group: campus ? "campus" : "imported",
        caption: [
          campus ? "UWaterloo Events" : "Imported",
          merged ? `In ${merged.name}` : waiting ? `Waiting in ${waiting.name}` : visibility.shown === false ? "Hidden" : null,
          unseen ? "Agent can’t see" : null,
          syncing.includes(feed.id) ? "Syncing…" : null,
          amount,
        ]
          .filter(Boolean)
          .join(" · "),
        ...visibility,
        agent: !unseen,
        agentEditable: true,
        agentSentence: accessSentence(unseen, locked),
        lock: true,
        lockEditable: false,
        lockSentence: "Read only. Its events change only when it syncs.",
        pending: 0,
        approvalOn: requireAiApproval,
        canAsk: true,
        askBlocked: unseen ? `The Agent can’t see ${feed.name}. Turn on Agent can see this first.` : undefined,
        ...syncState(feed.id),
        ...(syncProgress[feed.id] ? { syncProgress: syncProgress[feed.id] } : {}),
        mergeLink: merged
          ? { id: merged.id, name: merged.name, waiting: false }
          : waiting
            ? { id: waiting.id, name: waiting.name, waiting: true }
            : undefined,
      });
    }
    if (showGoogle) {
      const unseen = agentHidden(GOOGLE);
      const visibility = showState(GOOGLE);
      list.push({
        id: GOOGLE,
        name: nameOf(GOOGLE),
        color: colors.google,
        group: "google",
        caption: [
          "Read only",
          visibility.shown === false ? "Hidden" : null,
          unseen ? "Agent can’t see" : null,
          syncing.includes(GOOGLE) ? "Syncing…" : null,
          `${overlayEvents.length} loaded`,
        ]
          .filter(Boolean)
          .join(" · "),
        ...visibility,
        agent: !unseen,
        agentEditable: true,
        agentSentence: accessSentence(unseen, true),
        lock: true,
        lockEditable: false,
        lockSentence:
          "Read only. The Agent reads Google events and never changes them. When the same event is also on another calendar, that copy shows.",
        pending: 0,
        approvalOn: requireAiApproval,
        canAsk: true,
        askBlocked: unseen ? `The Agent can’t see ${nameOf(GOOGLE)}. Turn on Agent can see this first.` : undefined,
        ...syncState(GOOGLE),
        ...(syncProgress[GOOGLE] ? { syncProgress: syncProgress[GOOGLE] } : {}),
      });
    }
    return list;
    //helpers read the same inputs listed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    localCalendars,
    feeds,
    boxList,
    savedBoxes,
    memberOf,
    counts,
    sources,
    colors,
    colorOverrides,
    requireAiApproval,
    syncing,
    showGoogle,
    agentHiddenIds,
    googleConnected,
    overlayEvents.length,
    mergedCalendars,
    syncProgress,
  ]);

  useEffect(() => {
    if (selectedId && rows.some((row) => row.id === selectedId)) return;
    setSelectedId(rows[0]?.id ?? null);
  }, [rows, selectedId]);

  const merges = useMemo<MergeModel[]>(() => {
    return boxList.map((box) => {
      const members = savedBoxes[box.id] ?? [];
      const merged = members.length >= 2;
      const hidden = merged && !shownOnGrid(box.id);
      const missingLink = members.some((member) => !linkOf(member));
      return {
        id: box.id,
        name: box.name,
        draft: !merged,
        shown: merged ? !hidden : false,
        showBlocked: merged && hidden && hiddenElsewhere(box.id) ? `${box.name} is hidden from the side panel. Show it there.` : undefined,
        busy: syncing.includes(box.id) || members.some((member) => syncing.includes(member)),
        canSync: members.length > 0 && !missingLink && !syncing.includes(box.id),
        syncBlocked:
          members.length === 0
            ? `${box.name} has no calendars yet.`
            : missingLink
              ? `${box.name} has no calendar link to sync.`
              : undefined,
        sync: syncProgress[box.id],
        members: members.map((member) => ({
          id: member,
          name: nameOf(member),
          color: calendarSwatchColor(member, colors, colorOverrides),
          sharedLabel: `${plural(shared.get(member) ?? 0, "event")} also on another calendar in this merge`,
        })),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxList, savedBoxes, sources, syncing, shared, colorOverrides, colors, mergedCalendars, syncProgress]);

  const hasAgentLink = (id: string) => id !== AGENT && !isBox(id) && names.has(id);

  function eyeToggle(id: string, label: string): MapToggle {
    const shown = shownOnGrid(id);
    return {
      on: shown,
      label: shown ? `Hide ${label} on the calendar` : `Show ${label} on the calendar`,
      icon: shown ? <EyeIcon /> : <EyeOffIcon />,
      run: () => toggleShown(id, !shown),
    };
  }

  const isLocal = (id: string) => localCalendars.some((calendar) => calendar.id === id);
  const isCalendar = (id: string) => id !== AGENT && names.has(id);
  function canAskNode(id: string): true | string {
    if (id === AGENT || !names.has(id)) return "Drop it on a calendar.";
    if (isBox(id) && !isMerged(id)) return "Finish the merge before asking about it.";
    if (agentHidden(id)) return `The Agent can't see ${nameOf(id)}. Link it to the Agent first.`;
    return true;
  }
  const nodes = useMemo<MapNode[]>(() => {
    const list: MapNode[] = [
      {
        id: AGENT,
        label: "Agent",
        color: "var(--accent)",
        group: "hub",
        caption: requireAiApproval ? "Approval on" : "Approval off",
        details: [
          "Reads every calendar linked to it. Delete a link to hide that calendar from the Agent.",
          "Adds and changes events in WatAgent calendars, except read-only ones. Imported calendars are always read only.",
          "New events and tasks go to Agent Main unless you name another calendar.",
          requireAiApproval ? "Its changes wait for your approval." : "Its changes apply right away.",
        ],
      },
    ];
    for (const calendar of localCalendars) {
      const locked = readOnly(calendar.id);
      const hidden = !shownOnGrid(calendar.id);
      const amount = savedAmount(calendar.id);
      list.push({
        id: calendar.id,
        label: calendar.name,
        color: calendarSwatchColor(calendar.id, colors, colorOverrides),
        group: "right",
        caption: [
          locked ? "Read only" : isPrimaryEventCalendarId(calendar.id) ? "Default" : null,
          hidden ? "Hidden" : null,
          agentHidden(calendar.id) ? "No Agent" : null,
          amount,
        ]
          .filter(Boolean)
          .join(" · "),
        locked,
        dimmed: hidden,
        details: [
          isPrimaryEventCalendarId(calendar.id)
            ? "New events and tasks land here unless you name another calendar."
            : `A WatAgent calendar with ${amount}.`,
          locked ? "Read only: you and the Agent can't change its events." : "You and the Agent can change its events.",
          ...(hidden ? ["Hidden from the calendar."] : []),
          ...(agentHidden(calendar.id) ? ["The Agent can't see it. Draw a line from the Agent to give it access again."] : []),
          ...(isBuiltinLocalCalendarId(calendar.id) ? ["The Agent always sees this calendar."] : []),
        ],
      });
    }
    for (const feed of feeds) {
      const id = feed.id;
      const hidden = !shownOnGrid(id);
      const locked = readOnly(id);
      const amount = plural(counts.saved.get(id) ?? 0, "event");
      const merged = memberOf.get(id);
      const waiting = merged ? undefined : boxHolding(id);
      const campus = campusSources.has(feed.source);
      list.push({
        id,
        label: feed.name,
        color: calendarSwatchColor(id, colors, colorOverrides),
        group: "left",
        caption: [
          campus ? "UWaterloo Events" : "Imported",
          merged ? `In ${merged.name}` : waiting ? `Waiting in ${waiting.name}` : hidden ? "Hidden" : null,
          agentHidden(id) ? "No Agent" : null,
          amount,
        ]
          .filter(Boolean)
          .join(" · "),
        locked,
        dimmed: hidden,
        busy: syncing.includes(id),
        sync: syncProgress[id],
        ...(syncProgress[id] ? { caption: syncProgress[id].label } : {}),
        details: [
          merged
            ? `Shows on the calendar as part of ${merged.name}, which keeps one copy of each shared event.`
            : campus
              ? "A UWaterloo Events calendar. When LEARN or Portal has the same event, that copy shows."
              : "An imported calendar. All of its events show.",
          "Read only: its events change only when it syncs.",
          ...(hidden && !merged ? ["Hidden from the calendar."] : []),
          ...(agentHidden(id) ? ["The Agent can't see it. Draw a line from the Agent to give it access again."] : []),
        ],
      });
    }
    //A merge is a function between sources and its calendar output.
    for (const box of boxList) {
      const members = savedBoxes[box.id] ?? [];
      const merged = members.length >= 2;
      const hidden = merged && !shownOnGrid(box.id);
      list.push({
        id: box.id,
        label: box.name,
        color: calendarSwatchColor(box.id, colors, colorOverrides),
        group: "right",
        caption: merged ? `${members.length} sources · Merged` : "Merge not configured",
        locked: merged,
        dimmed: hidden,
        busy: syncing.includes(box.id) || members.some((member) => syncing.includes(member)),
        sync: syncProgress[box.id],
        ...(syncProgress[box.id] ? { caption: syncProgress[box.id].label } : {}),
        actions: [
          { id: "rename", label: "Rename", run: () => setRenamingBox(box) },
          { id: "delete", label: "Remove calendar", run: () => setDeletingBox(box) },
        ],
        details: merged
          ? [
              `Shows ${members.map(nameOf).join(", ")} as one calendar.`,
              `Shared events appear once, using the first source’s copy. Edit Merge to change sources or priority.`,
              ...members
                .filter((member) => (shared.get(member) ?? 0) > 0)
                .map((member) => `${nameOf(member)}: ${plural(shared.get(member) ?? 0, "event")} also in another of its calendars.`),
              ...(hidden ? ["Hidden from the calendar."] : []),
            ]
          : ["Apply the Merge function to choose at least two source calendars.", "Until then it's saved on this device only."],
      });
      list.push({
        id: mergeFunctionId(box.id),
        label: "Merge",
        color: "var(--ink-soft)",
        group: "hub",
        variant: "function",
        caption: `${members.length} sources → ${box.name}`,
        details: [`Combines sources into ${box.name}. Shared events use the highest-priority source.`],
        actions: [{ id: "configure", label: "Configure merge", run: () => setMergeEditor({ id: box.id }) }],
        box: {
          rows: members.map((member, index) => ({
            id: member,
            label: nameOf(member),
            color: calendarSwatchColor(member, colors, colorOverrides),
            choice:
              members.length > 1
                ? {
                    label: "Priority",
                    value: String(index),
                    options: members.map((_, rank) => ({ value: String(rank), label: ordinal(rank + 1) })),
                    onChange: (value: string) => setRank(box.id, member, Number(value)),
                  }
                : undefined,
            remove: { label: "Remove", run: () => takeOut(member) },
          })),
        },
      });
    }
    if (showGoogle) {
      const hidden = !shownOnGrid(GOOGLE);
      list.push({
        id: GOOGLE,
        label: nameOf(GOOGLE),
        color: colors.google,
        group: "left",
        caption: ["Read only", hidden ? "Hidden" : null, agentHidden(GOOGLE) ? "No Agent" : null, `${overlayEvents.length} loaded`]
          .filter(Boolean)
          .join(" · "),
        locked: true,
        dimmed: hidden,
        busy: syncing.includes(GOOGLE),
        sync: syncProgress[GOOGLE],
        ...(syncProgress[GOOGLE] ? { caption: syncProgress[GOOGLE].label } : {}),
        details: [
          "The Agent reads Google events but never changes them.",
          "Google calendars aren't merged; all of their events show.",
          ...(agentHidden(GOOGLE) ? ["The Agent can't see it. Draw a line from the Agent to give it access again."] : []),
          ...(hidden ? ["Hidden from the calendar."] : []),
        ],
      });
    }
    //members show through their merged calendar, so only it gets the switch
    //boxes still filling aren't on the calendar yet, so they get no switch either
    //agent main always stays visible
    return list.map((node) =>
      node.variant === "function" ||
      node.id === AGENT ||
      memberOf.has(node.id) ||
      isBuiltinLocalCalendarId(node.id) ||
      (isBox(node.id) && !isMerged(node.id))
        ? node
        : { ...node, toggle: eyeToggle(node.id, node.label) },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- every input the helpers read is listed
  }, [
    localCalendars,
    feeds,
    mergedCalendars,
    boxList,
    savedBoxes,
    shared,
    memberOf,
    counts,
    syncProgress,
    overlayEvents.length,
    sources,
    colors,
    colorOverrides,
    requireAiApproval,
    syncing,
    showGoogle,
    agentHiddenIds,
  ]);

  const edges = useMemo<MapEdge[]>(() => {
    const list: MapEdge[] = [];
    for (const box of boxList) {
      const fn = mergeFunctionId(box.id);
      for (const [index, member] of (savedBoxes[box.id] ?? []).entries())
        list.push({
          id: `merge-input:${box.id}:${member}`,
          from: member,
          to: fn,
          label: `${ordinal(index + 1)} priority`,
          directed: true,
          details: [`${nameOf(member)} is source ${index + 1} for ${box.name}.`],
          actions: [{ id: "configure", label: "Configure merge", run: () => setMergeEditor({ id: box.id }) }],
        });
      list.push({
        id: `merge-output:${box.id}`,
        from: fn,
        to: box.id,
        directed: true,
        label: "Merged events",
        details: [`Merge produces ${box.name}. Source calendars stay synced; duplicate events appear once.`],
        actions: [{ id: "configure", label: "Configure merge", run: () => setMergeEditor({ id: box.id }) }],
      });
    }
    for (const node of nodes) {
      if (!hasAgentLink(node.id) || agentHidden(node.id)) continue;
      const pending = counts.pending.get(node.id) ?? 0;
      const revoke = isBuiltinLocalCalendarId(node.id)
        ? undefined
        : { label: "Remove Agent access", run: () => setAgentAccess(node.id, false) };
      if (node.id === GOOGLE || readOnly(node.id)) {
        list.push({
          id: `agent:${node.id}`,
          from: node.id,
          to: AGENT,
          label: "read only",
          directed: true,
          dash: "dashed",
          tone: "accent",
          details: [
            `The Agent can read ${node.label} but can't change it.`,
            ...(revoke ? ["Delete this link to hide it from the Agent."] : []),
          ],
          remove: revoke,
        });
        continue;
      }
      list.push({
        id: `agent:${node.id}`,
        from: AGENT,
        to: node.id,
        label: pending > 0 ? `writes · ${pending} pending` : "writes",
        directed: true,
        tone: "accent",
        details: [
          `The Agent can add, change, and delete events and tasks in ${node.label}.`,
          ...(pending > 0 ? [`${plural(pending, "change")} ${pending === 1 ? "waits" : "wait"} for your approval.`] : []),
          ...(revoke ? ["Delete this link to hide it from the Agent."] : []),
        ],
        remove: revoke,
      });
    }
    //an Agent rule: from the feed it watches to the calendar it adds to, with its name on the line
    for (const rule of rules) {
      const from = externalCalendarId(rule.sourceFeed);
      const to = rule.targetCalendarId;
      if (!nodes.some((node) => node.id === from) || !nodes.some((node) => node.id === to)) continue;
      list.push({
        id: `rule:${rule.id}`,
        from,
        to,
        via: { label: rule.name },
        directed: true,
        dash: "dotted",
        tone: "accent",
        faint: !rule.enabled,
        details: ruleDetails(rule),
        actions: ruleActions(rule),
        remove: { label: "Delete rule", run: () => setDeleting(rule) },
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- every input the helpers read is listed
  }, [nodes, counts, sources, rules, agentHiddenIds, boxList, savedBoxes]);

  function ruleActions(rule: AgentRule) {
    return [
      {
        id: "run",
        label: "Run now",
        run: async (): Promise<MapChange> => {
          const [line] = await runAgentRules({ id: rule.id });
          await Promise.all([onRulesChanged(), onRefresh(), onRefreshPending()]);
          return { message: (line && ruleRunSummary(line)) ?? `${rule.name}: nothing new to add` };
        },
      },
      {
        id: "pause",
        label: rule.enabled ? "Pause" : "Resume",
        run: async (): Promise<MapChange> => {
          await updateAgentRule(rule.id, { enabled: !rule.enabled });
          await onRulesChanged();
          return {
            message: rule.enabled ? `${rule.name} paused` : `${rule.name} resumed`,
            undo: () => void updateAgentRule(rule.id, { enabled: rule.enabled }).then(onRulesChanged, () => undefined),
          };
        },
      },
      { id: "edit", label: "Edit", run: () => setEditor({ rule }) },
    ];
  }

  const functions: MapFunction[] = [
    {
      id: "merge",
      kind: "node",
      label: "Merge calendars",
      actionLabel: (id) => (isBox(id) ? "Edit merge" : "New calendar with Merge"),
      group: "Calendars",
      icon: <RouteIcon />,
      prompt: "choose an imported calendar or a calendar produced by Merge",
      accepts: (id) => (feedSourceOf(id) || isBox(id) ? true : "Choose an imported calendar or a merged calendar."),
      apply: (id) => setMergeEditor(isBox(id) ? { id } : { source: id }),
    },
    {
      id: "read-only",
      kind: "node",
      label: "Read-only",
      actionLabel: (id) => (readOnly(id) ? "Allow editing" : "Make read-only"),
      group: "Calendars",
      icon: <LockIcon />,
      prompt: "choose a calendar to lock or unlock",
      accepts: (id) => {
        if (id === AGENT) return "The Agent isn't a calendar.";
        if (isBuiltinLocalCalendarId(id)) return "Agent Main can't be locked.";
        if (id === GOOGLE) return "Google calendars keep their own permissions.";
        if (feedSourceOf(id) || isBox(id)) return "Imported calendars are always read only.";
        return isCalendar(id) ? true : "Choose a calendar.";
      },
      apply: (id) => {
        const was = readOnly(id);
        setLocked(id, !was);
        return {
          message: was ? `${nameOf(id)} can be changed again` : `${nameOf(id)} is read only for you and the Agent`,
          undo: () => setLocked(id, was),
        };
      },
    },
    {
      id: "sync",
      kind: "node",
      label: "Sync",
      group: "Calendars",
      icon: <SyncIcon />,
      prompt: "choose an imported or Google calendar",
      accepts: (id) => {
        if (syncing.includes(id)) return `${nameOf(id)} is already syncing.`;
        if (id === GOOGLE) return googleConnected === true ? true : "Link Google Calendar in Settings first.";
        if (isBox(id)) return (savedBoxes[id] ?? []).length ? true : `${nameOf(id)} has no calendars yet.`;
        if (feedSourceOf(id)) return linkOf(id) ? true : `${nameOf(id)} has no calendar link to sync.`;
        return "Only imported and Google calendars sync.";
      },
      apply: (id) => sync(id),
    },
    {
      id: "access",
      kind: "link",
      label: "Agent access",
      group: "Agent",
      icon: <ShieldCheckIcon />,
      prompt: "choose the Agent, then the calendar it should see again",
      drawable: true,
      acceptsFrom: (id) => (id === AGENT || (hasAgentLink(id) && agentHidden(id)) ? true : "Start from the Agent."),
      accepts: (from, to) => {
        const calendar = from === AGENT ? to : to === AGENT ? from : null;
        if (!calendar || calendar === AGENT) return "Connect the Agent and a calendar.";
        if (!hasAgentLink(calendar)) return "The Agent sees merged calendars through their members.";
        return agentHidden(calendar) ? true : `The Agent can already see ${nameOf(calendar)}.`;
      },
      apply: (from, to) => setAgentAccess(from === AGENT ? to : from, true),
    },
    {
      id: "ask",
      kind: "node",
      label: "Ask Agent",
      group: "Agent",
      icon: <ChatIcon />,
      prompt: "choose a calendar to attach to a message",
      accepts: (id) => canAskNode(id),
      apply: (id) => {
        onAskAgent(id);
        return { message: `Chat opened with @${nameOf(id)} attached` };
      },
    },
    {
      id: "approval",
      kind: "node",
      label: "Require approval",
      actionLabel: () => (requireAiApproval ? "Turn off approval" : "Require approval"),
      group: "Agent",
      icon: <ShieldCheckIcon />,
      prompt: "choose the Agent",
      accepts: (id) => (id === AGENT ? true : "Drop it on the Agent."),
      apply: async () => {
        const was = requireAiApproval;
        await onRequireAiApproval(!was);
        return {
          message: was ? "Agent changes apply right away" : "Agent changes now wait for your approval",
          undo: () => void onRequireAiApproval(was).catch(() => undefined),
        };
      },
    },
    ...(rulesStatus === "unavailable"
      ? []
      : [
          {
            id: "rule",
            kind: "link" as const,
            label: "Agent rule",
            group: "Agent",
            icon: <RouteIcon />,
            prompt: "choose the imported calendar to watch, then the WatAgent calendar to add to",
            drawable: true,
            acceptsFrom: (id: string) => {
              const feed = feedSourceOf(id);
              if (!feed) return "Agent rules watch an imported calendar, like LEARN or Portal.";
              if (!linkOf(id)) return `${nameOf(id)} has no calendar link to watch.`;
              return rules.length >= 10 ? "You can have up to 10 Agent rules." : true;
            },
            accepts: (from: string, to: string) => {
              if (!feedSourceOf(from)) return "Agent rules watch an imported calendar, like LEARN or Portal.";
              if (!isLocal(to)) return "Agent rules add to WatAgent calendars.";
              if (readOnly(to)) return `${nameOf(to)} is read only.`;
              const unseen = [from, to].find(agentHidden);
              if (unseen) return `The Agent can't see ${nameOf(unseen)}. Link it to the Agent first.`;
              return rules.length >= 10 ? "You can have up to 10 Agent rules." : true;
            },
            apply: (from: string, to: string) => {
              setEditor({ initial: { sourceFeed: feedSourceOf(from)!, targetCalendarId: to } });
            },
          },
        ]),
  ];

  //dragging a WatAgent calendar onto the Agent asks about it
  //dragging a calendar onto the Agent gives it access again if it was taken away, and otherwise asks about it
  //onto a merge box, an imported calendar joins it last (moving out of any other box); onto the Agent, see dragged's comment
  const nodeDrop: MapNodeDrop = {
    accepts: (dragged, target) => {
      const box = boxList.find((entry) => mergeFunctionId(entry.id) === target);
      if (box) {
        if (!feedSourceOf(dragged)) return "Merge accepts imported calendars.";
        return savedBoxes[box.id]?.includes(dragged) ? `${nameOf(dragged)} is already a source.` : true;
      }
      if (target !== AGENT) return "Drop it on the Agent or a Merge function.";
      if (hasAgentLink(dragged) && agentHidden(dragged)) return true;
      return canAskNode(dragged);
    },
    apply: (dragged, target) => {
      const box = boxList.find((entry) => mergeFunctionId(entry.id) === target);
      if (box) return dropInto(box.id, dragged);
      if (hasAgentLink(dragged) && agentHidden(dragged)) return setAgentAccess(dragged, true);
      onAskAgent(dragged);
      return { message: `Chat opened with @${nameOf(dragged)} attached` };
    },
  };

  const ruleCards = useMemo<RuleModel[]>(
    () =>
      rules.map((rule) => {
        const lines = ruleDetails(rule);
        return {
          id: rule.id,
          name: rule.name,
          enabled: rule.enabled,
          summary: lines[1] ?? "",
          approval: lines[2] ?? "",
          lastRun: lines.slice(3).join(" "),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rules, names],
  );

  const ruleFeeds = feeds
    .map((feed) => feedSourceOf(feed.id))
    .filter((feed): feed is RuleFeed => feed != null && Boolean(linkOf(externalCalendarId(feed))))
    .map((feed) => ({ feed, name: nameOf(externalCalendarId(feed)) }));
  const ruleCalendars = localCalendars.map((calendar) => ({
    id: calendar.id,
    name: calendar.name,
    kind: calendar.kind,
    readOnly: readOnly(calendar.id),
  }));
  const writable = ruleCalendars.some((calendar) => !calendar.readOnly);
  const atRuleLimit = rules.length >= 10;
  const canCreateRule = rulesStatus === "ready" && !atRuleLimit && ruleFeeds.length > 0 && writable;
  const createRuleReason =
    rulesStatus === "ready" && ruleFeeds.length === 0
      ? "Agent rules watch an imported calendar that has a link."
      : rulesStatus === "ready" && !writable
        ? "Agent rules add to a WatAgent calendar that isn’t read only."
        : undefined;

  const adding = boxList.find((box) => box.id === addingTo) ?? null;
  const picker = adding
    ? {
        name: adding.name,
        rows: feeds.map((feed) => {
          const holding = boxHolding(feed.id);
          const here = holding?.id === adding.id;
          return {
            id: feed.id,
            name: feed.name,
            disabled: here,
            note: here ? "Already here" : holding ? `Moves out of ${holding.name}` : undefined,
          };
        }),
      }
    : null;

  const shownEditor = editorPresence.value;
  const shownDeleting = deletePresence.value;
  const shownDeletingBox = deleteBoxPresence.value;

  return (
    <>
      <CalendarsBoard
        segment={segment}
        onSegment={setSegment}
        presentation={presentation}
        onPresentation={setPresentation}
        graph={
          presentation === "graph" ? (
            <CalendarMap
              label="Calendar map"
              preferencesKey="watagent.calendarMap.view.v1"
              groupLabels={{ left: "Sources", hub: "Functions", right: "Calendars" }}
              nodes={nodes}
              edges={edges}
              functions={functions}
              nodeDrop={nodeDrop}
              layoutStore={layoutStore}
              onResult={commit}
              onUndo={() => undo()}
              toolbar={
                <>
                  <button type="button" className="ghost-btn" onClick={() => setMergeEditor({})}>
                    + New calendar
                  </button>
                </>
              }
            />
          ) : null
        }
        groupsOpen={groupsOpen}
        onToggleGroup={(group) => setGroupsOpen((current) => ({ ...current, [group]: !current[group] }))}
        newCalendarsShown={newCalendarsShown}
        onNewCalendarsShown={(shown) => {
          onNewCalendarsShown(shown);
          tell(shown ? "New calendars start shown" : "New calendars start hidden");
        }}
        approval={requireAiApproval}
        googleEmpty={googleConnected === null ? "Checking Google Calendar…" : "Google Calendar isn’t linked. Link it in Settings."}
        onApproval={(value) =>
          void run(async () => {
            const was = requireAiApproval;
            await onRequireAiApproval(value);
            return {
              message: value ? "Agent changes now wait for your approval" : "Agent changes apply right away",
              undo: () => void onRequireAiApproval(was).catch(() => undefined),
            };
          })
        }
        rows={rows}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onShown={(id, shown) => void run(() => toggleShown(id, shown))}
        onAgent={(id, access) => commit(setAgentAccess(id, access))}
        onLock={(id, locked) => commit(toggleLock(id, locked))}
        onSync={(id) => void run(() => sync(id))}
        onAsk={(id) => {
          onAskAgent(id);
          tell(`Chat opened with @${nameOf(id)} attached`);
        }}
        onReview={onReviewPending}
        onOpenMerge={() => setSegment("merged")}
        merges={merges}
        onNewMerge={() => setMergeEditor({})}
        onRenameMerge={(id) => {
          const box = boxList.find((entry) => entry.id === id);
          if (box) setRenamingBox(box);
        }}
        onDeleteMerge={(id) => {
          const box = boxList.find((entry) => entry.id === id);
          if (box) setDeletingBox(box);
        }}
        onShowMerge={(id, shown) => void run(() => toggleShown(id, shown))}
        onSyncMerge={(id) => void run(() => sync(id))}
        onRank={(boxId, memberId, rank) => commit(setRank(boxId, memberId, rank))}
        onRemoveMember={(memberId) => commit(takeOut(memberId))}
        onAddToMerge={setAddingTo}
        picker={picker}
        onPick={(feedId) => {
          if (!addingTo) return;
          commit(dropInto(addingTo, feedId));
          setAddingTo(null);
        }}
        onClosePicker={() => setAddingTo(null)}
        rulesStatus={rulesStatus}
        rules={ruleCards}
        atRuleLimit={atRuleLimit}
        canCreateRule={canCreateRule}
        createRuleReason={createRuleReason}
        runningRuleId={runningRuleId}
        onNewRule={() => setEditor({})}
        onRunRule={(id) => {
          const rule = rules.find((entry) => entry.id === id);
          if (!rule) return;
          void run(async () => {
            setRunningRuleId(rule.id);
            try {
              const [line] = await runAgentRules({ id: rule.id });
              await Promise.all([onRulesChanged(), onRefresh(), onRefreshPending()]);
              return { message: (line && ruleRunSummary(line)) ?? `${rule.name}: nothing new to add` };
            } finally {
              setRunningRuleId(null);
            }
          });
        }}
        onToggleRule={(id) => {
          const rule = rules.find((entry) => entry.id === id);
          if (!rule) return;
          void run(async () => {
            await updateAgentRule(rule.id, { enabled: !rule.enabled });
            await onRulesChanged();
            return {
              message: rule.enabled ? `${rule.name} paused` : `${rule.name} resumed`,
              undo: () => void updateAgentRule(rule.id, { enabled: rule.enabled }).then(onRulesChanged, () => undefined),
            };
          });
        }}
        onEditRule={(id) => {
          const rule = rules.find((entry) => entry.id === id);
          if (rule) setEditor({ rule });
        }}
        onDeleteRule={(id) => {
          const rule = rules.find((entry) => entry.id === id);
          if (rule) setDeleting(rule);
        }}
        onRetryRules={() => void onRulesChanged()}
        toast={toast ? { key: toast.key, message: toast.message, undo: Boolean(toast.change?.undo) } : null}
        onUndo={() => undo(toast?.change)}
      />
      {mergeEditor ? (
        <MergeFunctionDialog
          name={boxList.find((box) => box.id === mergeEditor.id)?.name ?? newBoxName(boxList.map((box) => box.name))}
          members={mergeEditor.id ? (savedBoxes[mergeEditor.id] ?? []) : mergeEditor.source ? [mergeEditor.source] : []}
          sources={feeds.map((feed) => ({
            id: feed.id,
            name: feed.name,
            color: colorOverrides[feed.id] ?? colors.event,
            usedBy: boxHolding(feed.id)?.id !== mergeEditor.id ? boxHolding(feed.id)?.name : undefined,
          }))}
          editing={Boolean(mergeEditor.id)}
          onCancel={() => setMergeEditor(null)}
          onSave={saveMerge}
        />
      ) : null}
      {renamingBox ? (
        <RenameCalendarDialog
          name={renamingBox.name}
          title="Rename merge"
          fieldLabel="Merge name"
          onCancel={() => setRenamingBox(null)}
          onSave={(name) => {
            const box = renamingBox;
            setRenamingBox(null);
            renameBox(box, name);
            tell(`Renamed to ${name}`);
          }}
        />
      ) : null}
      {shownEditor ? (
        <RuleEditor
          key={shownEditor.rule?.id ?? "new"}
          rule={shownEditor.rule}
          initial={shownEditor.initial}
          feeds={ruleFeeds}
          calendars={ruleCalendars}
          agentCanSee={(id) => !agentHidden(id)}
          onAllowAccess={(id) => commit(setAgentAccess(id, true))}
          open={editorPresence.open}
          onCancel={() => setEditor(null)}
          onSaved={(saved) => {
            setEditor(null);
            void onRulesChanged();
            tell(
              shownEditor.rule
                ? `${saved.name} saved`
                : `${saved.name} saved. It runs the next time ${nameOf(externalCalendarId(saved.sourceFeed))} syncs, or use Run now.`,
            );
          }}
        />
      ) : null}
      {shownDeleting ? (
        <ConfirmDialog
          title={`Delete ${shownDeleting.name}?`}
          message="It stops running. Anything it already added stays on your calendar."
          confirmLabel="Delete rule"
          open={deletePresence.open}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const doomed = shownDeleting;
            setDeleting(null);
            void deleteAgentRule(doomed.id)
              .then(() => {
                tell(`${doomed.name} deleted`);
                return onRulesChanged();
              })
              .catch((err: unknown) => tell(err instanceof Error ? err.message : "The rule wasn't deleted. Try again."));
          }}
        />
      ) : null}
      {shownDeletingBox ? (
        <ConfirmDialog
          title={`Delete ${shownDeletingBox.name}?`}
          message="Its calendars show on their own again."
          confirmLabel="Delete merge"
          open={deleteBoxPresence.open}
          onCancel={() => setDeletingBox(null)}
          onConfirm={() => {
            const box = shownDeletingBox;
            setDeletingBox(null);
            commit(deleteBox(box));
          }}
        />
      ) : null}
    </>
  );
}
