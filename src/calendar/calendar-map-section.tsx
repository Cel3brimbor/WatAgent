"use client";

import { useEffect, useId, useMemo, useState, type Dispatch, type SetStateAction } from "react";
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
import { sharedEventCounts } from "@/calendar/calendar-merge";
import { calendarIdForMeta } from "@/calendar/calendar-ownership";
import { feedOfCalendarId, mergedByMember, newMergedCalendarId } from "@/calendar/imported-calendars";
import { RenameCalendarDialog } from "@/calendar/imported-calendars-panel";
import { boxesOf, commitBoxes, moveInBoxes, newBoxName, TRAY, type Boxes, type MergeBox } from "@/calendar/merge-board";
import { formatFeedSyncSummary, syncImportedFeed } from "@/calendar/calendar-sync";
import { calendarItemVisible, externalCalendarId, externalCalendarShown, externalCalendarsOf } from "@/calendar/external-calendars";
import { calendarIdField, isPrimaryEventCalendarId, type LocalCalendar } from "@/calendar/local-calendars";
import { calendarGroupsOf, isCalendarReadOnly, readMergeDrafts, setCalendarReadOnly, withNewCalendar, writeMergeDrafts, type CalendarColors, type CalendarSourceFilter } from "@/calendar/preferences";
import { timelineItemOf, type OverlayEvent } from "@/calendar/timeline";
import type { CalendarItemDoc, ImportedCalendar, MergedCalendar } from "@/calendar/types";
import { ConfirmDialog } from "@/shared/confirm-dialog";
import { ChatIcon, EyeIcon, EyeOffIcon, LockIcon, RouteIcon, ShieldCheckIcon, SyncIcon } from "@/shared/icons";
import { Switch } from "@/shared/switch";
import { usePresence } from "@/shared/use-presence";

const layoutStore = createLocalLayoutStore("watagent.calendarMap.layout.v1");
const AGENT = "agent";
const GOOGLE = "google";

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
  rules: AgentRule[];
  rulesStatus: AgentRulesState["status"];
  onRulesChanged: () => Promise<void>;
  onRefreshPending: () => Promise<void>;
  onNotice: (message: string) => void;
};

//map nodes use the app's calendar ids: events, tasks, cal-<uuid>, ics:<feed>, merge-<uuid>, plus the Google aggregate
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
  rules,
  rulesStatus,
  onRulesChanged,
  onRefreshPending,
  onNotice,
}: Props) {
  const [syncing, setSyncing] = useState<string[]>([]);
  const [editor, setEditor] = useState<{ rule?: AgentRule; initial?: Partial<AgentRuleDraft> } | null>(null);
  const [deleting, setDeleting] = useState<AgentRule | null>(null);
  const newShownId = useId();
  const [renamingBox, setRenamingBox] = useState<MergeBox | null>(null);
  //merge boxes with fewer than two calendars; they stay on this device until they fill.
  //read after mount so the server and browser renders match
  const [drafts, setDrafts] = useState<MergeBox[]>([]);
  useEffect(() => {
    setDrafts(readMergeDrafts());
  }, []);
  const editorPresence = usePresence(editor);
  const deletePresence = usePresence(deleting);
  const groups = calendarGroupsOf(sources.groups);

  const feeds = useMemo(() => externalCalendarsOf(items, importedCalendars), [items, importedCalendars]);
  const showGoogle = googleConnected === true || overlayEvents.length > 0;
  const memberOf = useMemo(() => mergedByMember(mergedCalendars), [mergedCalendars]);
  const isMerged = (id: string) => mergedCalendars.some((calendar) => calendar.id === id);
  //a draft filled from elsewhere is a merged calendar now
  const openDrafts = useMemo(() => drafts.filter((box) => !mergedCalendars.some((calendar) => calendar.id === box.id)), [drafts, mergedCalendars]);
  const boxList = useMemo<MergeBox[]>(() => [...mergedCalendars, ...openDrafts], [mergedCalendars, openDrafts]);
  const isBox = (id: string) => boxList.some((box) => box.id === id);
  //every imported calendar's box, with the rest in TRAY
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

  //saved and waiting-for-approval items per calendar
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

  //per member: how many of its events another member of its merged calendar also has
  const shared = useMemo(() => sharedEventCounts(items.map(timelineItemOf), mergedCalendars), [items, mergedCalendars]);

  //the same test the calendar grid uses, so the map never disagrees with what's drawn
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

  //hidden by the Hidden section or by switching off a whole group, which Hide can't undo on its own
  function hiddenElsewhere(id: string): boolean {
    if (id === GOOGLE) return !groups.other;
    if (sources.hiddenIds.includes(id) && !groups.hidden) return true;
    return feedSourceOf(id) || isMerged(id) ? !groups.external : !groups.watagent;
  }

  const agentHidden = (id: string) => agentHiddenIds.includes(id);
  //merged calendars have no Agent link of their own; the Agent sees their members
  const hasAgentLink = (id: string) => id !== AGENT && !isBox(id) && names.has(id);

  const readOnly = (id: string) => id !== AGENT && id !== GOOGLE && isCalendarReadOnly(sources, id);
  const isLocal = (id: string) => localCalendars.some((calendar) => calendar.id === id);
  const isCalendar = (id: string) => id !== AGENT && names.has(id);

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
          "New events go to Agent Main unless you name another calendar.",
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
        color:
          calendar.id === "events" ? colors.event : calendar.id === "tasks" ? colors.task : colorOverrides[calendar.id] || colors.event,
        group: "left",
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
          isPrimaryEventCalendarId(calendar.id) ? "New Agent events land here unless you name another calendar." : `A WatAgent calendar with ${amount}.`,
          locked ? "Read only: you and the Agent can't change its events." : "You and the Agent can change its events.",
          ...(hidden ? ["Hidden from the calendar."] : []),
          ...(agentHidden(calendar.id) ? ["The Agent can't see it. Draw a line from the Agent to give it access again."] : []),
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
      list.push({
        id,
        label: feed.name,
        color: colorOverrides[id] ?? colors.event,
        group: "right",
        caption: [
          "Imported",
          merged ? `In ${merged.name}` : waiting ? `Waiting in ${waiting.name}` : hidden ? "Hidden" : null,
          agentHidden(id) ? "No Agent" : null,
          amount,
        ]
          .filter(Boolean)
          .join(" · "),
        locked,
        dimmed: hidden,
        busy: syncing.includes(id),
        details: [
          merged
            ? `Shows on the calendar as part of ${merged.name}, which keeps one copy of each shared event.`
            : "An imported calendar. All of its events show.",
          "Read only: its events change only when it syncs.",
          ...(hidden && !merged ? ["Hidden from the calendar."] : []),
          ...(agentHidden(id) ? ["The Agent can't see it. Draw a line from the Agent to give it access again."] : []),
        ],
      });
    }
    //each merge box: its calendars in priority order, with a dropdown to change the order
    for (const box of boxList) {
      const members = savedBoxes[box.id] ?? [];
      const merged = members.length >= 2;
      const hidden = merged && !shownOnGrid(box.id);
      list.push({
        id: box.id,
        label: box.name,
        color: colorOverrides[box.id] ?? colors.event,
        group: "right",
        caption: merged
          ? [`Merged · top copy wins`, hidden ? "Hidden" : null].filter(Boolean).join(" · ")
          : members.length === 1
            ? "Drop one more to merge"
            : "Drop 2+ imported calendars",
        locked: merged,
        dimmed: hidden,
        busy: members.some((member) => syncing.includes(member)),
        box: {
          empty: "Drag imported calendars here",
          rows: members.map((member, index) => ({
            id: member,
            label: nameOf(member),
            color: colorOverrides[member] ?? colors.event,
            choice:
              members.length > 1
                ? {
                    label: "Priority",
                    value: String(index),
                    options: members.map((_, rank) => ({ value: String(rank), label: ordinal(rank + 1) })),
                    onChange: (value: string) => setRank(box.id, member, Number(value)),
                  }
                : undefined,
            remove: { label: "Take out", run: () => takeOut(member) },
          })),
        },
        actions: [
          { id: "rename", label: "Rename", run: () => setRenamingBox(box) },
          { id: "delete", label: "Delete box", run: () => deleteBox(box) },
        ],
        details: merged
          ? [
              `Shows ${members.map(nameOf).join(", ")} as one calendar.`,
              `When an event is in more than one, the copy from the calendar ranked 1st shows, then 2nd, and so on. Change a calendar's rank with its dropdown.`,
              ...members.map((member) => `${nameOf(member)}: ${plural(shared.get(member) ?? 0, "event")} also in another of its calendars.`),
              ...(hidden ? ["Hidden from the calendar."] : []),
            ]
          : [
              "A merge box. Drag imported calendars onto it; it merges them once it holds two.",
              "Until then it's saved on this device only.",
            ],
      });
    }
    if (showGoogle) {
      const hidden = !shownOnGrid(GOOGLE);
      list.push({
        id: GOOGLE,
        label: nameOf(GOOGLE),
        color: colors.google,
        group: "right",
        caption: ["Read only", hidden ? "Hidden" : null, agentHidden(GOOGLE) ? "No Agent" : null, `${overlayEvents.length} loaded`]
          .filter(Boolean)
          .join(" · "),
        locked: true,
        dimmed: hidden,
        busy: syncing.includes(GOOGLE),
        details: [
          "The Agent reads Google events but never changes them.",
          "When the same event is also on another calendar, that copy shows and the Google one is hidden.",
          ...(agentHidden(GOOGLE) ? ["The Agent can't see it. Draw a line from the Agent to give it access again."] : []),
          ...(hidden ? ["Hidden from the calendar."] : []),
        ],
      });
    }
    //members show through their merged calendar, so only it gets the switch
    //boxes still filling aren't on the calendar yet, so they get no switch either
    return list.map((node) =>
      node.id === AGENT || memberOf.has(node.id) || (isBox(node.id) && !isMerged(node.id))
        ? node
        : { ...node, toggle: gridToggle(node.id, node.label) },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- every input the helpers read is listed
  }, [localCalendars, feeds, mergedCalendars, boxList, savedBoxes, shared, memberOf, counts, overlayEvents.length, sources, colors, colorOverrides, requireAiApproval, syncing, showGoogle, agentHiddenIds]);

  const edges = useMemo<MapEdge[]>(() => {
    const list: MapEdge[] = [];
    for (const node of nodes) {
      if (!hasAgentLink(node.id) || agentHidden(node.id)) continue;
      const pending = counts.pending.get(node.id) ?? 0;
      const revoke = { label: "Remove Agent access", run: () => setAgentAccess(node.id, false) };
      if (node.id === GOOGLE || readOnly(node.id)) {
        list.push({
          id: `agent:${node.id}`,
          from: node.id,
          to: AGENT,
          label: "read only",
          directed: true,
          dash: "dashed",
          tone: "accent",
          details: [`The Agent can read ${node.label} but can't change it.`, "Delete this link to hide it from the Agent."],
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
          `The Agent can add, change and delete events in ${node.label}.`,
          ...(pending > 0 ? [`${plural(pending, "change")} ${pending === 1 ? "waits" : "wait"} for your approval.`] : []),
          "Delete this link to hide it from the Agent.",
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
  }, [nodes, counts, sources, rules, agentHiddenIds]);

  function setAgentAccess(id: string, access: boolean): MapChange {
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

  //every box change saves boxes with two or more as merged calendars and keeps the rest as drafts; undo puts both back
  function applyBoxes(next: Boxes): MapChange {
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
        (waiting.length ? `. Drop one more calendar on ${waiting.join(" and ")} to merge it` : "") +
        (result.created.length && !newCalendarsShown ? ". New calendars start hidden, so use its eye to show it" : ""),
      undo: () => {
        onMergedCalendars(before.merged);
        saveDrafts(before.drafts);
      },
    };
  }

  function dropInto(boxId: string, feed: string): MapChange {
    return applyBoxes(moveInBoxes(savedBoxes, feed, boxId));
  }

  function takeOut(feed: string): MapChange {
    return applyBoxes(moveInBoxes(savedBoxes, feed, TRAY));
  }

  //rank is 0-based: 0 means its copy wins
  function setRank(boxId: string, feed: string, rank: number): MapChange {
    const members = (savedBoxes[boxId] ?? []).filter((member) => member !== feed);
    members.splice(Math.max(0, Math.min(rank, members.length)), 0, feed);
    return applyBoxes({ ...savedBoxes, [boxId]: members });
  }

  function addBox(): MapChange {
    const box: MergeBox = { id: newMergedCalendarId(), name: newBoxName(boxList.map((entry) => entry.name)), members: [] };
    const before = openDrafts;
    saveDrafts([...openDrafts, box]);
    return { message: `${box.name} added. Drag imported calendars onto it`, undo: () => saveDrafts(before) };
  }

  //its calendars show on their own again
  function deleteBox(box: MergeBox): MapChange {
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

  //the eye on each node: shows or hides that calendar on the calendar grid
  function gridToggle(id: string, label: string): MapToggle {
    const shown = shownOnGrid(id);
    return {
      on: shown,
      label: shown ? `Hide ${label} on the calendar` : `Show ${label} on the calendar`,
      icon: shown ? <EyeIcon /> : <EyeOffIcon />,
      run: () => {
        if (!shown && hiddenElsewhere(id)) throw new Error(`${label} is hidden from the side panel. Show it there.`);
        setShown(id, !shown);
        return {
          message: shown ? `${label} hidden from the calendar` : `${label} shown on the calendar`,
          undo: () => setShown(id, shown),
        };
      },
    };
  }

  function setLocked(id: string, locked: boolean) {
    onSources((current) => setCalendarReadOnly(current, id, locked));
  }

  const linkOf = (id: string) => importedCalendars.find((calendar) => externalCalendarId(calendar.id) === id);

  async function sync(id: string): Promise<MapChange> {
    setSyncing((current) => [...current, id]);
    try {
      if (id === GOOGLE) {
        //null means a newer pull took over, not that it failed
        await onSyncGoogle();
        return { message: "Google Calendar synced" };
      }
      //a merged calendar syncs each of its links in turn
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
    const run = rule.lastRun;
    const did = run
      ? run.status === "failed"
        ? `Last run ${ago(run.startedAt)} didn't finish${run.error ? `: ${run.error}` : "."}`
        : `Last ran ${ago(run.startedAt)}: ${[`${run.added} added`, run.updated ? `${run.updated} updated` : null, run.removed ? `${run.removed} removed` : null, `${run.skipped} skipped`].filter(Boolean).join(", ")}.`
      : "Hasn't run yet. It runs whenever the feed syncs, or use Run now.";
    return [
      `“${rule.instruction}”`,
      `Watches ${nameOf(externalCalendarId(rule.sourceFeed))}${rule.titleContains ? ` for titles containing “${rule.titleContains}”` : ""} up to ${rule.lookaheadDays} days ahead, and adds to ${nameOf(rule.targetCalendarId)}.`,
      rule.requireApproval ? "Asks before adding." : "Adds without asking.",
      did,
      ...(rule.enabled ? [] : ["Paused: it won't run when the feed syncs."]),
    ];
  }

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

  const functions: MapFunction[] = [
    {
      id: "read-only",
      kind: "node",
      label: "Read-only",
      group: "Calendars",
      icon: <LockIcon />,
      prompt: "choose a calendar to lock or unlock",
      accepts: (id) => {
        if (id === AGENT) return "The Agent isn't a calendar.";
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
      prompt: "choose a WatAgent calendar to attach to a message",
      accepts: (id) => {
        if (id === AGENT) return "Drop it on a WatAgent calendar.";
        if (!isLocal(id)) return "Only WatAgent calendars can be attached to a message.";
        return agentHidden(id) ? `The Agent can't see ${nameOf(id)}. Link it to the Agent first.` : true;
      },
      apply: (id) => {
        onAskAgent(id);
        return { message: `Chat opened with @${nameOf(id)} attached` };
      },
    },
    {
      id: "approval",
      kind: "node",
      label: "Require approval",
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
      if (isBox(target)) {
        if (!feedSourceOf(dragged)) return "Only imported calendars go in merge boxes.";
        return savedBoxes[target]?.includes(dragged) ? `${nameOf(dragged)} is already in ${nameOf(target)}.` : true;
      }
      if (target !== AGENT) return "Drop it on the Agent or a merge box.";
      if (hasAgentLink(dragged) && agentHidden(dragged)) return true;
      return isLocal(dragged) ? true : "Only WatAgent calendars can be attached to a message.";
    },
    apply: (dragged, target) => {
      if (isBox(target)) return dropInto(target, dragged);
      if (agentHidden(dragged)) return setAgentAccess(dragged, true);
      onAskAgent(dragged);
      return { message: `Chat opened with @${nameOf(dragged)} attached` };
    },
  };

  const shownEditor = editorPresence.value;
  const shownDeleting = deletePresence.value;

  return (
    <>
      <CalendarMap
        label="Calendar map"
        toolbar={
          <div className="calendar-map-tools">
            <button type="button" className="calendar-map-add" onClick={() => onNotice(addBox().message)}>
              + Add merge box
            </button>
            <div className="settings-toggle calendar-map-toggle">
              <label htmlFor={newShownId}>New calendars start shown</label>
              <Switch id={newShownId} checked={newCalendarsShown} onChange={onNewCalendarsShown} />
            </div>
          </div>
        }
        nodes={nodes}
        edges={edges}
        functions={functions}
        nodeDrop={nodeDrop}
        layoutStore={layoutStore}
        hint="Use the eye on a calendar to show or hide it on the calendar. Drag a function onto a calendar. To merge imported calendars, add a merge box and drag them onto it; each calendar's dropdown in the box sets its priority. Draw from an imported calendar's handle to a WatAgent calendar to make an Agent rule. Select a link to delete it; deleting a calendar's link to the Agent hides it from the Agent."
      />
      {renamingBox ? (
        <RenameCalendarDialog
          name={renamingBox.name}
          onCancel={() => setRenamingBox(null)}
          onSave={(name) => {
            const box = renamingBox;
            setRenamingBox(null);
            renameBox(box, name);
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
          open={editorPresence.open}
          onCancel={() => setEditor(null)}
          onSaved={(saved) => {
            setEditor(null);
            void onRulesChanged();
            onNotice(
              shownEditor.rule
                ? `${saved.name} saved`
                : `${saved.name} saved. It runs the next time ${nameOf(externalCalendarId(saved.sourceFeed))} syncs, or use Run now on its line.`,
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
                onNotice(`${doomed.name} deleted`);
                return onRulesChanged();
              })
              .catch((err: unknown) => onNotice(err instanceof Error ? err.message : "The rule wasn't deleted. Try again."));
          }}
        />
      ) : null}
    </>
  );
}
