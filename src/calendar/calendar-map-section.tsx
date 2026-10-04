"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
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
import { formatFeedSyncSummary, syncImportedFeed } from "@/calendar/calendar-sync";
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
import { CalendarMap, createLocalLayoutStore, type MapEdge, type MapFunction, type MapNode, type MapNodeDrop, type MapToggle } from "@/features/calendar-map";
import { ChatIcon, EyeIcon, EyeOffIcon, LockIcon, RouteIcon, ShieldCheckIcon, SyncIcon } from "@/shared/icons";
import { calendarItemVisible, externalCalendarId, externalCalendarShown, externalCalendarsOf } from "@/calendar/external-calendars";
import { feedOfCalendarId, mergedByMember, newMergedCalendarId } from "@/calendar/imported-calendars";
import { RenameCalendarDialog } from "@/calendar/imported-calendars-panel";
import { calendarIdField, isPrimaryEventCalendarId, type LocalCalendar } from "@/calendar/local-calendars";
import { boxesOf, commitBoxes, moveInBoxes, newBoxName, TRAY, type Boxes, type MergeBox } from "@/calendar/merge-board";
import { calendarGroupsOf, isCalendarReadOnly, readMergeDrafts, setCalendarReadOnly, withNewCalendar, writeMergeDrafts, type CalendarColors, type CalendarSourceFilter } from "@/calendar/preferences";
import { timelineItemOf, type OverlayEvent } from "@/calendar/timeline";
import type { CalendarItemDoc, ImportedCalendar, MergedCalendar } from "@/calendar/types";
import { ConfirmDialog } from "@/shared/confirm-dialog";
import { usePresence } from "@/shared/use-presence";

const AGENT = "agent";
const GOOGLE = "google";
const VIEW_KEY = "watagent.calendars.view.v1";
const layoutStore = createLocalLayoutStore("watagent.calendarMap.layout.v1");
const UNDO_DEPTH = 10;
const TOAST_MS = 6000;
const GROUP_KEYS: CalGroup[] = ["watagent", "imported", "google"];

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
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[rank % 10] ?? "th";
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
  const groups: Record<CalGroup, boolean> = { watagent: true, imported: true, google: true };
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
  const [syncing, setSyncing] = useState<string[]>([]);
  const [editor, setEditor] = useState<{ rule?: AgentRule; initial?: Partial<AgentRuleDraft> } | null>(null);
  const [deleting, setDeleting] = useState<AgentRule | null>(null);
  const [deletingBox, setDeletingBox] = useState<MergeBox | null>(null);
  const [renamingBox, setRenamingBox] = useState<MergeBox | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [runningRuleId, setRunningRuleId] = useState<string | null>(null);
  const [segment, setSegment] = useState<CalSegment>("calendars");
  const [presentation, setPresentation] = useState<CalPresentation>("list");
  const [groupsOpen, setGroupsOpen] = useState<Record<CalGroup, boolean>>({ watagent: true, imported: true, google: true });
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
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      event.preventDefault();
      undoRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = calendarGroupsOf(sources.groups);
  const feeds = useMemo(() => externalCalendarsOf(items, importedCalendars), [items, importedCalendars]);
  const showGoogle = googleConnected === true || overlayEvents.length > 0;
  const memberOf = useMemo(() => mergedByMember(mergedCalendars), [mergedCalendars]);
  const isMerged = (id: string) => mergedCalendars.some((calendar) => calendar.id === id);
  const openDrafts = useMemo(() => drafts.filter((box) => !mergedCalendars.some((calendar) => calendar.id === box.id)), [drafts, mergedCalendars]);
  const boxList = useMemo<MergeBox[]>(() => [...mergedCalendars, ...openDrafts], [mergedCalendars, openDrafts]);
  const isBox = (id: string) => boxList.some((box) => box.id === id);
  const savedBoxes = useMemo(() => boxesOf(feeds.map((feed) => feed.id), boxList), [feeds, boxList]);
  const boxHolding = (feed: string) => boxList.find((box) => savedBoxes[box.id]?.includes(feed));

  const names = useMemo(() => {
    const out = new Map<string, string>([[AGENT, "Agent"], [GOOGLE, "Google Calendar"]]);
    for (const calendar of localCalendars) out.set(calendar.id, calendar.name);
    for (const feed of feeds) out.set(feed.id, feed.name);
    for (const box of boxList) out.set(box.id, box.name);
    return out;
  }, [localCalendars, feeds, boxList]);
  const nameOf = (id: string) => names.get(id) ?? id;

  const counts = useMemo(() => {
    const saved = new Map<string, number>();
    const pending = new Map<string, number>();
    for (const item of items) {
      const id = calendarIdForMeta(item.calendar);
      if (!id || item.editorDraft) continue;
      const bucket = item.pendingApproval ? pending : saved;
      bucket.set(id, (bucket.get(id) ?? 0) + 1);
    }
    return { saved, pending };
  }, [items]);

  const shared = useMemo(() => sharedEventCounts(items.map(timelineItemOf), mergedCalendars), [items, mergedCalendars]);

  function shownOnGrid(id: string): boolean {
    if (id === GOOGLE) return sources.google && groups.other;
    if (isMerged(id)) return externalCalendarShown(id, sources);
    const feed = feedSourceOf(id);
    const calendar = feed
      ? { kind: "event" as const, importSource: feed }
      : { kind: id === "tasks" ? ("task" as const) : ("event" as const), calendarId: calendarIdField(id) };
    return calendarItemVisible(
      { id: "", title: "", createdAt: 0, updatedAt: 0, calendar: { ...calendar, startUTC: 1, endUTC: 2, allDay: false } },
      sources,
      mergedCalendars,
    );
  }

  function hiddenElsewhere(id: string): boolean {
    if (id === GOOGLE) return !groups.other;
    if (sources.hiddenIds.includes(id) && !groups.hidden) return true;
    return feedSourceOf(id) || isMerged(id) ? !groups.external : !groups.watagent;
  }

  const agentHidden = (id: string) => agentHiddenIds.includes(id);
  const readOnly = (id: string) => id !== AGENT && id !== GOOGLE && isCalendarReadOnly(sources, id);
  const linkOf = (id: string) => importedCalendars.find((calendar) => externalCalendarId(calendar.id) === id);

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
    const before = agentHiddenIds;
    onAgentHiddenIds((current) => (access ? current.filter((entry) => entry !== id) : [...new Set([...current, id])]));
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

  function addBox(): Change {
    const box: MergeBox = { id: newMergedCalendarId(), name: newBoxName(boxList.map((entry) => entry.name)), members: [] };
    const before = openDrafts;
    saveDrafts([...openDrafts, box]);
    return { message: `${box.name} added. Add imported calendars to it`, undo: () => saveDrafts(before) };
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
      if (id === "tasks") return { ...current, tasks: shown };
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

  async function sync(id: string): Promise<Change> {
    setSyncing((current) => [...current, id]);
    try {
      if (id === GOOGLE) {
        await onSyncGoogle();
        return { message: "Google Calendar synced" };
      }
      const targets = (isBox(id) ? savedBoxes[id] ?? [] : [id]).map(linkOf);
      if (targets.length === 0) throw new Error(`${nameOf(id)} has no calendars to sync yet.`);
      if (targets.some((target) => !target)) throw new Error(`${nameOf(id)} has no calendar link to sync.`);
      const lines: string[] = [];
      for (const target of targets as ImportedCalendar[]) lines.push(formatFeedSyncSummary(target.name, await syncImportedFeed(target)));
      await onRefresh();
      return { message: lines.join(" ") };
    } finally {
      setSyncing((current) => current.filter((entry) => entry !== id));
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
    return { shown, showBlocked: !shown && hiddenElsewhere(id) ? `${nameOf(id)} is hidden from the side panel. Show it there.` : undefined };
  }

  function syncState(id: string): Pick<CalendarRowModel, "sync" | "syncBlocked" | "connection"> {
    const linked = id === GOOGLE
      ? googleConnected === true
        ? { sync: "ready" as const, connection: "Connected" }
        : { sync: "blocked" as const, connection: googleConnected === false ? "Not connected" : "Checking connection", syncBlocked: "Link Google Calendar in Settings first." }
      : linkOf(id)
        ? { sync: "ready" as const, connection: "Linked" }
        : { sync: "blocked" as const, connection: "No link", syncBlocked: `${nameOf(id)} has no calendar link to sync.` };
    return syncing.includes(id) ? { ...linked, sync: "busy" } : linked;
  }

  const rows = useMemo<CalendarRowModel[]>(() => {
    const list: CalendarRowModel[] = [];
    for (const calendar of localCalendars) {
      const saved = counts.saved.get(calendar.id) ?? 0;
      const locked = readOnly(calendar.id);
      const unseen = agentHidden(calendar.id);
      const visibility = showState(calendar.id);
      const amount = calendar.kind === "task" ? plural(saved, "to-do") : plural(saved, "event");
      list.push({
        id: calendar.id,
        name: calendar.name,
        color: calendar.id === "events" ? colors.event : calendar.id === "tasks" ? colors.task : colorOverrides[calendar.id] || colors.event,
        group: "watagent",
        caption: [locked ? "Read only" : isPrimaryEventCalendarId(calendar.id) ? "Default" : null, visibility.shown === false ? "Hidden" : null, unseen ? "Agent can’t see" : null, amount].filter(Boolean).join(" · "),
        ...visibility,
        agent: !unseen,
        agentSentence: accessSentence(unseen, locked),
        lock: locked,
        lockEditable: true,
        lockSentence: locked ? "You and the Agent can’t change its events." : "You and the Agent can change its events.",
        pending: !unseen && !locked ? counts.pending.get(calendar.id) ?? 0 : 0,
        approvalOn: requireAiApproval,
        canAsk: true,
        askBlocked: unseen ? `The Agent can’t see ${calendar.name}. Turn on Agent can see this first.` : undefined,
        sync: "hidden",
        landing: isPrimaryEventCalendarId(calendar.id) ? "New Agent events land here unless you name another calendar." : undefined,
      });
    }
    for (const feed of feeds) {
      const merged = memberOf.get(feed.id);
      const waiting = merged ? undefined : boxHolding(feed.id);
      const locked = true;
      const unseen = agentHidden(feed.id);
      const visibility = showState(feed.id);
      const amount = plural(counts.saved.get(feed.id) ?? 0, "event");
      list.push({
        id: feed.id,
        name: feed.name,
        color: colorOverrides[feed.id] ?? colors.event,
        group: "imported",
        caption: ["Imported", merged ? `In ${merged.name}` : waiting ? `Waiting in ${waiting.name}` : visibility.shown === false ? "Hidden" : null, unseen ? "Agent can’t see" : null, syncing.includes(feed.id) ? "Syncing…" : null, amount].filter(Boolean).join(" · "),
        ...visibility,
        agent: !unseen,
        agentSentence: accessSentence(unseen, locked),
        lock: true,
        lockEditable: false,
        lockSentence: "Read only. Its events change only when it syncs.",
        pending: 0,
        approvalOn: requireAiApproval,
        canAsk: false,
        ...syncState(feed.id),
        mergeLink: merged ? { id: merged.id, name: merged.name, waiting: false } : waiting ? { id: waiting.id, name: waiting.name, waiting: true } : undefined,
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
        caption: ["Read only", visibility.shown === false ? "Hidden" : null, unseen ? "Agent can’t see" : null, syncing.includes(GOOGLE) ? "Syncing…" : null, `${overlayEvents.length} loaded`].filter(Boolean).join(" · "),
        ...visibility,
        agent: !unseen,
        agentSentence: accessSentence(unseen, true),
        lock: true,
        lockEditable: false,
        lockSentence: "Read only. The Agent reads Google events and never changes them. When the same event is also on another calendar, that copy shows.",
        pending: 0,
        approvalOn: requireAiApproval,
        canAsk: false,
        ...syncState(GOOGLE),
      });
    }
    return list;
    //helpers read the same inputs listed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localCalendars, feeds, boxList, savedBoxes, memberOf, counts, sources, colors, colorOverrides, requireAiApproval, syncing, showGoogle, agentHiddenIds, googleConnected, overlayEvents.length, mergedCalendars]);

  useEffect(() => {
    if (selectedId && rows.some((row) => row.id === selectedId)) return;
    setSelectedId(rows[0]?.id ?? null);
  }, [rows, selectedId]);

  const merges = useMemo<MergeModel[]>(() => {
    return boxList.map((box) => {
      const members = savedBoxes[box.id] ?? [];
      const merged = members.length >= 2;
      const hidden = merged && !shownOnGrid(box.id);
      const ranks = members.length > 1 ? members.map((_, rank) => ({ value: String(rank), label: ordinal(rank + 1) })) : [];
      const missingLink = members.some((member) => !linkOf(member));
      return {
        id: box.id,
        name: box.name,
        draft: !merged,
        shown: merged ? !hidden : false,
        showBlocked: merged && hidden && hiddenElsewhere(box.id) ? `${box.name} is hidden from the side panel. Show it there.` : undefined,
        busy: syncing.includes(box.id) || members.some((member) => syncing.includes(member)),
        canSync: members.length > 0 && !missingLink && !(syncing.includes(box.id)),
        syncBlocked: members.length === 0 ? `${box.name} has no calendars yet.` : missingLink ? `${box.name} has no calendar link to sync.` : undefined,
        members: members.map((member, index) => ({
          id: member,
          name: nameOf(member),
          color: colorOverrides[member] ?? colors.event,
          sharedLabel: `${plural(shared.get(member) ?? 0, "event")} also on another calendar in this merge`,
          rank: index,
          ranks,
        })),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxList, savedBoxes, sources, syncing, shared, colorOverrides, colors, mergedCalendars]);

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

  const graph = useMemo(() => {
    const isCalendar = (id: string) => id !== AGENT && names.has(id);
    const list: MapNode[] = [
      {
        id: AGENT,
        label: "Agent",
        color: "var(--accent)",
        group: "hub",
        caption: requireAiApproval ? "Asks before changing events" : "Changes events right away",
        details: [
          "It reads every calendar linked to it. Delete a line to hide that calendar from the Agent.",
          "It can change WatAgent calendars that aren't locked. Imported calendars and Google are always read only.",
          "New events go to the default calendar unless you name another one.",
          requireAiApproval ? "Its changes wait for your approval." : "Its changes apply right away.",
        ],
      },
    ];
    for (const calendar of localCalendars) {
      const saved = counts.saved.get(calendar.id) ?? 0;
      const locked = readOnly(calendar.id);
      const hidden = !shownOnGrid(calendar.id);
      const amount = calendar.kind === "task" ? plural(saved, "to-do") : plural(saved, "event");
      list.push({
        id: calendar.id,
        label: calendar.name,
        color: calendar.id === "events" ? colors.event : calendar.id === "tasks" ? colors.task : colorOverrides[calendar.id] || colors.event,
        group: "left",
        caption: [locked ? "Read only" : isPrimaryEventCalendarId(calendar.id) ? "Default" : null, hidden ? "Hidden" : null, agentHidden(calendar.id) ? "No Agent" : null, amount].filter(Boolean).join(" · "),
        locked,
        dimmed: hidden,
        details: [
          isPrimaryEventCalendarId(calendar.id) ? "New Agent events land here unless you name another calendar." : `A WatAgent calendar with ${amount}.`,
          locked ? "Read only: you and the Agent can't change its events." : "You and the Agent can change its events.",
          ...(hidden ? ["Hidden from the calendar."] : []),
          ...(agentHidden(calendar.id) ? ["The Agent can't see it. Use Agent access, or drag it onto the Agent."] : []),
        ],
      });
    }
    for (const feed of feeds) {
      const hidden = !shownOnGrid(feed.id);
      const merged = memberOf.get(feed.id);
      const waiting = merged ? undefined : boxHolding(feed.id);
      list.push({
        id: feed.id,
        label: feed.name,
        color: colorOverrides[feed.id] ?? colors.event,
        group: "right",
        caption: ["Imported", merged ? `In ${merged.name}` : waiting ? `Waiting in ${waiting.name}` : hidden ? "Hidden" : null, agentHidden(feed.id) ? "No Agent" : null, plural(counts.saved.get(feed.id) ?? 0, "event")].filter(Boolean).join(" · "),
        locked: true,
        dimmed: hidden,
        busy: syncing.includes(feed.id),
        details: [
          merged ? `Shows on the calendar as part of ${merged.name}, which keeps one copy of each shared event.` : "An imported calendar. All of its events show.",
          "Read only: its events change only when it syncs.",
          ...(hidden && !merged ? ["Hidden from the calendar."] : []),
          ...(agentHidden(feed.id) ? ["The Agent can't see it. Use Agent access, or drag it onto the Agent."] : []),
        ],
      });
    }
    for (const box of boxList) {
      const members = savedBoxes[box.id] ?? [];
      const merged = members.length >= 2;
      const hidden = merged && !shownOnGrid(box.id);
      list.push({
        id: box.id,
        label: box.name,
        color: colorOverrides[box.id] ?? colors.event,
        group: "right",
        caption: merged ? ["Merged · Rank 1 wins", hidden ? "Hidden" : null].filter(Boolean).join(" · ") : members.length === 1 ? "Add one more to merge" : "Add 2 or more imported calendars",
        locked: merged,
        dimmed: hidden,
        busy: members.some((member) => syncing.includes(member)),
        box: {
          empty: "Add imported calendars",
          rows: members.map((member, index) => ({
            id: member,
            label: nameOf(member),
            color: colorOverrides[member] ?? colors.event,
            choice: members.length > 1 ? { label: "Rank", value: String(index), options: members.map((_, rank) => ({ value: String(rank), label: ordinal(rank + 1) })), onChange: (value: string) => setRank(box.id, member, Number(value)) } : undefined,
            remove: { label: "Remove", run: () => takeOut(member) },
          })),
        },
        actions: [
          { id: "rename", label: "Rename", run: () => setRenamingBox(box) },
          { id: "delete", label: "Delete", run: () => setDeletingBox(box) },
        ],
        details: merged
          ? [`Shows ${members.map(nameOf).join(", ")} as one calendar.`, "When an event is in more than one, Rank 1 is the copy you see, then Rank 2, and so on.", ...members.map((member) => `${nameOf(member)}: ${plural(shared.get(member) ?? 0, "event")} also in another of its calendars.`), ...(hidden ? ["Hidden from the calendar."] : [])]
          : ["A merge. Add imported calendars; it merges them once it holds two.", "Until then it's saved on this device only."],
      });
    }
    if (showGoogle) {
      const hidden = !shownOnGrid(GOOGLE);
      list.push({
        id: GOOGLE,
        label: nameOf(GOOGLE),
        color: colors.google,
        group: "right",
        caption: ["Read only", hidden ? "Hidden" : null, agentHidden(GOOGLE) ? "No Agent" : null, `${overlayEvents.length} loaded`].filter(Boolean).join(" · "),
        locked: true,
        dimmed: hidden,
        busy: syncing.includes(GOOGLE),
        details: [
          "The Agent reads Google events but never changes them.",
          "When the same event is also on another calendar, that copy shows and the Google one is hidden.",
          ...(agentHidden(GOOGLE) ? ["The Agent can't see it. Use Agent access, or drag it onto the Agent."] : []),
          ...(hidden ? ["Hidden from the calendar."] : []),
        ],
      });
    }
    const nodes = list.map((node) =>
      node.id === AGENT || memberOf.has(node.id) || (isBox(node.id) && !isMerged(node.id)) ? node : { ...node, toggle: eyeToggle(node.id, node.label) },
    );
    const edgeList: MapEdge[] = [];
    for (const node of nodes) {
      if (!hasAgentLink(node.id) || agentHidden(node.id)) continue;
      const pending = counts.pending.get(node.id) ?? 0;
      const revoke = { label: "Remove Agent access", run: () => setAgentAccess(node.id, false) };
      if (node.id === GOOGLE || readOnly(node.id)) {
        edgeList.push({
          id: `agent:${node.id}`,
          from: node.id,
          to: AGENT,
          label: "read only",
          directed: true,
          dash: "dashed",
          tone: "accent",
          details: [`The Agent can read ${node.label} but can't change it.`, "Delete this line to hide it from the Agent."],
          remove: revoke,
        });
        continue;
      }
      edgeList.push({
        id: `agent:${node.id}`,
        from: AGENT,
        to: node.id,
        label: pending > 0 ? `can change · ${pending} waiting` : "can change",
        directed: true,
        tone: "accent",
        details: [`The Agent can add, change, and delete events in ${node.label}.`, ...(pending > 0 ? [`${plural(pending, "change")} ${pending === 1 ? "is" : "are"} waiting for your approval.`] : []), "Delete this line to hide it from the Agent."],
        remove: revoke,
      });
    }
    for (const rule of rules) {
      const from = externalCalendarId(rule.sourceFeed);
      const to = rule.targetCalendarId;
      if (!nodes.some((node) => node.id === from) || !nodes.some((node) => node.id === to)) continue;
      const lines = ruleDetails(rule);
      edgeList.push({
        id: `rule:${rule.id}`,
        from,
        to,
        via: { label: rule.name },
        directed: true,
        dash: "dotted",
        tone: "accent",
        faint: !rule.enabled,
        details: lines,
        actions: [
          { id: "run", label: "Run now", run: async () => { const [line] = await runAgentRules({ id: rule.id }); await Promise.all([onRulesChanged(), onRefresh(), onRefreshPending()]); return { message: (line && ruleRunSummary(line)) ?? `${rule.name}: nothing new to add` }; } },
          { id: "pause", label: rule.enabled ? "Pause" : "Resume", run: async () => { await updateAgentRule(rule.id, { enabled: !rule.enabled }); await onRulesChanged(); return { message: rule.enabled ? `${rule.name} paused` : `${rule.name} resumed`, undo: () => void updateAgentRule(rule.id, { enabled: rule.enabled }).then(onRulesChanged, () => undefined) }; } },
          { id: "edit", label: "Edit", run: () => setEditor({ rule }) },
        ],
        remove: { label: "Delete rule", run: () => setDeleting(rule) },
      });
    }
    const fns: MapFunction[] = [
      { id: "read-only", kind: "node", label: "Read only", group: "Calendars", icon: <LockIcon />, prompt: "Choose a WatAgent calendar to lock or unlock", accepts: (id) => { if (id === AGENT) return "The Agent isn't a calendar."; if (id === GOOGLE) return "Google calendars keep their own permissions."; if (feedSourceOf(id) || isBox(id)) return "Imported calendars are always read only."; return isCalendar(id) ? true : "Choose a calendar."; }, apply: (id) => toggleLock(id, !readOnly(id)) },
      { id: "sync", kind: "node", label: "Sync", group: "Calendars", icon: <SyncIcon />, prompt: "Choose an imported or Google calendar", accepts: (id) => { if (syncing.includes(id)) return `${nameOf(id)} is already syncing.`; if (id === GOOGLE) return googleConnected === true ? true : "Link Google Calendar in Settings first."; if (isBox(id)) return (savedBoxes[id] ?? []).length ? true : `${nameOf(id)} has no calendars yet.`; if (feedSourceOf(id)) return linkOf(id) ? true : `${nameOf(id)} has no calendar link to sync.`; return "Only imported and Google calendars sync."; }, apply: (id) => sync(id) },
      { id: "access", kind: "link", label: "Agent access", group: "Agent", icon: <ShieldCheckIcon />, prompt: "Choose the Agent, then the calendar it should see again", drawable: true, acceptsFrom: (id) => (id === AGENT || (hasAgentLink(id) && agentHidden(id)) ? true : "Start from the Agent."), accepts: (from, to) => { const calendar = from === AGENT ? to : to === AGENT ? from : null; if (!calendar || calendar === AGENT) return "Connect the Agent and a calendar."; if (!hasAgentLink(calendar)) return "The Agent sees merged calendars through their members."; return agentHidden(calendar) ? true : `The Agent can already see ${nameOf(calendar)}.`; }, apply: (from, to) => setAgentAccess(from === AGENT ? to : from, true) },
      { id: "ask", kind: "node", label: "Ask Agent", group: "Agent", icon: <ChatIcon />, prompt: "Choose a WatAgent calendar to attach to a message", accepts: (id) => { if (id === AGENT) return "Drop it on a WatAgent calendar."; if (!localCalendars.some((calendar) => calendar.id === id)) return "Only WatAgent calendars can be attached to a message."; return agentHidden(id) ? `The Agent can't see ${nameOf(id)}. Link it to the Agent first.` : true; }, apply: (id) => { onAskAgent(id); return { message: `Chat opened with @${nameOf(id)} attached` }; } },
      { id: "approval", kind: "node", label: "Ask before changes", group: "Agent", icon: <ShieldCheckIcon />, prompt: "Drop it on the Agent", accepts: (id) => (id === AGENT ? true : "Drop it on the Agent."), apply: async () => { const was = requireAiApproval; await onRequireAiApproval(!was); return { message: was ? "Agent changes apply right away" : "Agent changes now wait for your approval", undo: () => void onRequireAiApproval(was).catch(() => undefined) }; } },
      ...(rulesStatus === "unavailable" ? [] : [{ id: "rule", kind: "link" as const, label: "Rule", group: "Agent", icon: <RouteIcon />, prompt: "Choose the imported calendar to watch, then the WatAgent calendar to add to", drawable: true, acceptsFrom: (id: string) => { const feed = feedSourceOf(id); if (!feed) return "Rules watch an imported calendar."; if (!linkOf(id)) return `${nameOf(id)} has no calendar link to watch.`; return rules.length >= 10 ? "You can have up to 10 rules." : true; }, accepts: (from: string, to: string) => { if (!feedSourceOf(from)) return "Rules watch an imported calendar."; if (!localCalendars.some((calendar) => calendar.id === to)) return "Rules add to WatAgent calendars."; if (readOnly(to)) return `${nameOf(to)} is read only.`; const unseen = [from, to].find(agentHidden); if (unseen) return `The Agent can't see ${nameOf(unseen)}. Link it to the Agent first.`; return rules.length >= 10 ? "You can have up to 10 rules." : true; }, apply: (from: string, to: string) => { setEditor({ initial: { sourceFeed: feedSourceOf(from)!, targetCalendarId: to } }); } }]),
    ];
    const nodeDrop: MapNodeDrop = {
      accepts: (dragged, target) => {
        if (isBox(target)) {
          if (!feedSourceOf(dragged)) return "Only imported calendars go in a merge.";
          return savedBoxes[target]?.includes(dragged) ? `${nameOf(dragged)} is already in ${nameOf(target)}.` : true;
        }
        if (target !== AGENT) return "Drop it on the Agent or a merge.";
        if (hasAgentLink(dragged) && agentHidden(dragged)) return true;
        return localCalendars.some((calendar) => calendar.id === dragged) ? true : "Only WatAgent calendars can be attached to a message.";
      },
      apply: (dragged, target) => {
        if (isBox(target)) return dropInto(target, dragged);
        if (agentHidden(dragged)) return setAgentAccess(dragged, true);
        onAskAgent(dragged);
        return { message: `Chat opened with @${nameOf(dragged)} attached` };
      },
    };
    return { nodes, edges: edgeList, functions: fns, nodeDrop };
    //the helpers close over the same inputs listed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localCalendars, feeds, boxList, savedBoxes, memberOf, counts, sources, colors, colorOverrides, requireAiApproval, syncing, showGoogle, agentHiddenIds, googleConnected, overlayEvents.length, mergedCalendars, rules, rulesStatus, names, shared]);

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
              nodes={graph.nodes}
              edges={graph.edges}
              functions={graph.functions}
              nodeDrop={graph.nodeDrop}
              layoutStore={layoutStore}
              onResult={commit}
              onUndo={() => undo()}
              toolbar={
                <>
                  <p className="calendars-graph-note">WatAgent calendars start on the left, imported ones on the right, and the Agent is in the middle.</p>
                  <button type="button" className="ghost-btn" onClick={() => commit(addBox())}>
                    New merge
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
        onNewMerge={() => commit(addBox())}
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
