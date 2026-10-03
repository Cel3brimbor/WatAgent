"use client";

import { useId, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  CalendarMap,
  createLocalLayoutStore,
  type MapChange,
  type MapEdge,
  type MapFunction,
  type MapNode,
  type MapNodeDrop,
} from "@/features/calendar-map";
import { duplicateOverlaps } from "@/calendar/calendar-duplicates";
import { calendarIdForMeta } from "@/calendar/calendar-ownership";
import { outrankCalendarPriority } from "@/calendar/calendar-priority";
import { formatFeedSyncSummary, syncImportedFeed } from "@/calendar/calendar-sync";
import { calendarItemVisible, externalCalendarId, externalCalendarsOf } from "@/calendar/external-calendars";
import { calendarIdField, isPrimaryEventCalendarId, type LocalCalendar } from "@/calendar/local-calendars";
import { calendarGroupsOf, isCalendarReadOnly, setCalendarReadOnly, type CalendarColors, type CalendarSourceFilter } from "@/calendar/preferences";
import { overlayTimelineItemOf, timelineItemOf, type OverlayEvent } from "@/calendar/timeline";
import type {
  CalendarItemDoc,
  CalendarLinks,
  CalendarNames,
  CalendarPriorityOrder,
  CalendarPrioritySource,
  ImportedCalendarSource,
} from "@/calendar/types";
import { ChatIcon, EyeOffIcon, LockIcon, ShieldCheckIcon, SyncIcon, TrophyIcon } from "@/shared/icons";
import { Switch } from "@/shared/switch";

const layoutStore = createLocalLayoutStore("watagent.calendarMap.layout.v1");
const AGENT = "agent";
const GOOGLE = "google";

type Props = {
  items: CalendarItemDoc[];
  overlayEvents: OverlayEvent[];
  /** The active order: only linked, imported or connected sources. */
  priorityOrder: CalendarPriorityOrder;
  onPriorityOrder: Dispatch<SetStateAction<CalendarPriorityOrder>>;
  showDuplicateEvents: boolean;
  onShowDuplicateEvents: (value: boolean) => void;
  sources: CalendarSourceFilter;
  onSources: Dispatch<SetStateAction<CalendarSourceFilter>>;
  calendarNames: CalendarNames;
  calendarLinks: CalendarLinks;
  colors: CalendarColors;
  colorOverrides: Record<string, string>;
  localCalendars: LocalCalendar[];
  googleConnected: boolean | null;
  requireAiApproval: boolean;
  onRequireAiApproval: (value: boolean) => Promise<void>;
  onRefresh: () => Promise<void>;
  onSyncGoogle: () => Promise<number | null>;
  onAskAgent: (calendarId: string) => void;
};

//map nodes use the app's calendar ids: events, tasks, cal-<uuid>, ics:<feed>, plus the Google aggregate
function nodeIdOf(source: CalendarPrioritySource): string {
  return source === "google" ? GOOGLE : externalCalendarId(source);
}

function prioritySourceOf(id: string): CalendarPrioritySource | null {
  if (id === GOOGLE) return "google";
  if (id === "ics:learn") return "learn";
  if (id === "ics:portal") return "portal";
  return null;
}

function feedSourceOf(id: string): ImportedCalendarSource | null {
  return id === "ics:learn" ? "learn" : id === "ics:portal" ? "portal" : id === "ics:other" ? "other" : null;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function CalendarMapSection({
  items,
  overlayEvents,
  priorityOrder,
  onPriorityOrder,
  showDuplicateEvents,
  onShowDuplicateEvents,
  sources,
  onSources,
  calendarNames,
  calendarLinks,
  colors,
  colorOverrides,
  localCalendars,
  googleConnected,
  requireAiApproval,
  onRequireAiApproval,
  onRefresh,
  onSyncGoogle,
  onAskAgent,
}: Props) {
  const toggleId = useId();
  const [syncing, setSyncing] = useState<string[]>([]);
  const groups = calendarGroupsOf(sources.groups);

  const feeds = useMemo(
    () => externalCalendarsOf(items, calendarNames, priorityOrder, calendarLinks),
    [items, calendarNames, priorityOrder, calendarLinks],
  );
  const showGoogle = priorityOrder.includes("google") || googleConnected === true;

  const names = useMemo(() => {
    const out = new Map<string, string>([[AGENT, "Agent"], [GOOGLE, "Google Calendar"]]);
    for (const calendar of localCalendars) out.set(calendar.id, calendar.name);
    for (const feed of feeds) out.set(feed.id, feed.name);
    return out;
  }, [localCalendars, feeds]);
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

  const overlaps = useMemo(
    () => duplicateOverlaps([...items.map(timelineItemOf), ...overlayEvents.map(overlayTimelineItemOf)], priorityOrder),
    [items, overlayEvents, priorityOrder],
  );
  const sharedWith = (a: CalendarPrioritySource, b: CalendarPrioritySource) =>
    overlaps.find((pair) => (pair.a === a && pair.b === b) || (pair.a === b && pair.b === a))?.count ?? 0;

  //the same test the calendar grid uses, so the map never disagrees with what's drawn
  function shownOnGrid(id: string): boolean {
    if (id === GOOGLE) return sources.google && groups.other;
    const feed = feedSourceOf(id);
    const calendar = feed
      ? { kind: "event" as const, importSource: feed }
      : { kind: id === "tasks" ? ("task" as const) : ("event" as const), calendarId: calendarIdField(id) };
    return calendarItemVisible(
      { id: "", title: "", createdAt: 0, updatedAt: 0, calendar: { ...calendar, startUTC: 1, endUTC: 2, allDay: false } },
      sources,
    );
  }

  //hidden by the Hidden section or by switching off a whole group, which Hide can't undo on its own
  function hiddenElsewhere(id: string): boolean {
    if (id === GOOGLE) return !groups.other;
    if (sources.hiddenIds.includes(id) && !groups.hidden) return true;
    return feedSourceOf(id) ? !groups.external : !groups.watagent;
  }

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
          "Reads every calendar on this map.",
          "Adds and changes events in WatAgent calendars, and edits imported events, except in read-only calendars.",
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
        caption: [locked ? "Read only" : isPrimaryEventCalendarId(calendar.id) ? "Default" : null, hidden ? "Hidden" : null, amount]
          .filter(Boolean)
          .join(" · "),
        locked,
        dimmed: hidden,
        details: [
          isPrimaryEventCalendarId(calendar.id) ? "New Agent events land here unless you name another calendar." : `A WatAgent calendar with ${amount}.`,
          locked ? "Read only: you and the Agent can't change its events." : "You and the Agent can change its events.",
          ...(hidden ? ["Hidden from the calendar."] : []),
        ],
      });
    }
    const ranked = priorityOrder.map(nodeIdOf).filter((id) => id === GOOGLE ? showGoogle : feeds.some((feed) => feed.id === id));
    const unranked = feeds.filter((feed) => !ranked.includes(feed.id)).map((feed) => feed.id);
    for (const id of [...ranked, ...unranked]) {
      const source = prioritySourceOf(id);
      const rank = source ? priorityOrder.indexOf(source) : -1;
      const hidden = !shownOnGrid(id);
      const locked = readOnly(id);
      const amount = id === GOOGLE ? `${overlayEvents.length} loaded` : plural(counts.saved.get(id) ?? 0, "event");
      const shares = source
        ? priorityOrder
            .filter((other) => other !== source)
            .map((other) => ({ other, count: sharedWith(source, other) }))
            .filter((pair) => pair.count > 0)
            .map((pair) => `Shares ${plural(pair.count, "event")} with ${nameOf(nodeIdOf(pair.other))}.`)
        : [];
      list.push({
        id,
        label: nameOf(id),
        color: id === GOOGLE ? colors.google : colorOverrides[id] ?? colors.event,
        group: "right",
        badge: rank >= 0 ? String(rank + 1) : undefined,
        caption: [id === GOOGLE || locked ? "Read only" : null, hidden ? "Hidden" : null, amount].filter(Boolean).join(" · "),
        locked: id === GOOGLE || locked,
        dimmed: hidden,
        busy: syncing.includes(id),
        details: [
          rank >= 0
            ? `Priority ${rank + 1} of ${priorityOrder.length}: when an event is in more than one calendar, the highest one's copy shows.`
            : "Not part of duplicate priority, so all of its events show.",
          ...shares,
          id === GOOGLE
            ? "The Agent reads Google events but never changes them."
            : locked
              ? "Read only: you and the Agent can't change its events."
              : "The Agent can edit its events; new ones always go to WatAgent calendars.",
          ...(hidden ? ["Hidden from the calendar, so its copies don't hide anyone else's."] : []),
        ],
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- every input the helpers read is listed
  }, [localCalendars, feeds, priorityOrder, counts, overlaps, overlayEvents.length, sources, colors, colorOverrides, requireAiApproval, syncing, showGoogle]);

  const edges = useMemo<MapEdge[]>(() => {
    const list: MapEdge[] = [];
    const ranked = priorityOrder.filter((source) => nodes.some((node) => node.id === nodeIdOf(source)));
    //neighbours in rank are enough to show the order; every pair's count is in the node details
    for (let index = 0; index + 1 < ranked.length; index += 1) {
      const winner = ranked[index];
      const loser = ranked[index + 1];
      const count = sharedWith(winner, loser);
      const [winnerName, loserName] = [nameOf(nodeIdOf(winner)), nameOf(nodeIdOf(loser))];
      list.push({
        id: `dup:${winner}:${loser}`,
        from: nodeIdOf(winner),
        to: nodeIdOf(loser),
        label: showDuplicateEvents ? "both shown" : `${count} shared`,
        weight: Math.min(1, Math.log10(count + 1) / 2),
        directed: !showDuplicateEvents,
        dash: showDuplicateEvents ? "dashed" : undefined,
        faint: count === 0,
        details: [
          showDuplicateEvents
            ? "Duplicate copies are showing, so both calendars' copies appear."
            : `${winnerName} wins over ${loserName}: when an event is in both, ${winnerName}'s copy shows.`,
          `${plural(count, "event")} ${count === 1 ? "is" : "are"} in both.`,
        ],
        actions: [
          {
            id: "swap",
            label: `Make ${loserName} win`,
            run: () => outrank(loser, winner),
          },
        ],
      });
    }
    for (const node of nodes) {
      if (node.id === AGENT) continue;
      const pending = counts.pending.get(node.id) ?? 0;
      if (node.id === GOOGLE || readOnly(node.id)) {
        list.push({
          id: `agent:${node.id}`,
          from: node.id,
          to: AGENT,
          label: "read only",
          directed: true,
          dash: "dashed",
          tone: "accent",
          details: [`The Agent can read ${node.label} but can't change it.`],
        });
        continue;
      }
      const verb = feedSourceOf(node.id) ? "edits" : "writes";
      list.push({
        id: `agent:${node.id}`,
        from: AGENT,
        to: node.id,
        label: pending > 0 ? `${verb} · ${pending} pending` : verb,
        directed: true,
        tone: "accent",
        details: [
          feedSourceOf(node.id)
            ? `The Agent can change or delete ${node.label} events, but adds new ones to WatAgent calendars.`
            : `The Agent can add, change and delete events in ${node.label}.`,
          ...(pending > 0 ? [`${plural(pending, "change")} ${pending === 1 ? "waits" : "wait"} for your approval.`] : []),
        ],
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- every input the helpers read is listed
  }, [nodes, priorityOrder, overlaps, showDuplicateEvents, counts, sources]);

  function outrank(winner: CalendarPrioritySource, loser: CalendarPrioritySource): MapChange {
    const [winnerName, loserName] = [nameOf(nodeIdOf(winner)), nameOf(nodeIdOf(loser))];
    const before = priorityOrder;
    const after = outrankCalendarPriority(before, winner, loser);
    if (after === before) return { message: `${winnerName} already wins over ${loserName}` };
    onPriorityOrder(after);
    return { message: `${winnerName} now wins over ${loserName}`, undo: () => onPriorityOrder(before) };
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

  function setLocked(id: string, locked: boolean) {
    onSources((current) => setCalendarReadOnly(current, id, locked));
  }

  async function sync(id: string): Promise<MapChange> {
    setSyncing((current) => [...current, id]);
    try {
      if (id === GOOGLE) {
        //null means a newer pull took over, not that it failed
        await onSyncGoogle();
        return { message: "Google Calendar synced" };
      }
      const source = feedSourceOf(id);
      const url = source ? calendarLinks[source] : undefined;
      if (!source || !url) throw new Error(`${nameOf(id)} has no calendar link to sync.`);
      const result = await syncImportedFeed(source, url);
      await onRefresh();
      return { message: formatFeedSyncSummary(nameOf(id), result) };
    } finally {
      setSyncing((current) => current.filter((entry) => entry !== id));
    }
  }

  const functions: MapFunction[] = [
    {
      id: "wins",
      kind: "link",
      label: "Wins over",
      group: "Calendars",
      icon: <TrophyIcon />,
      prompt: "choose the calendar whose copy should show, then the one it beats",
      drawable: true,
      acceptsFrom: (id) => (prioritySourceOf(id) ? true : "Only LEARN, Portal and Google compete over duplicate events."),
      accepts: (from, to) => {
        if (from === to) return "Choose a different calendar.";
        return prioritySourceOf(from) && prioritySourceOf(to) ? true : "Only LEARN, Portal and Google compete over duplicate events.";
      },
      apply: (from, to) => outrank(prioritySourceOf(from)!, prioritySourceOf(to)!),
    },
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
      id: "hide",
      kind: "node",
      label: "Hide",
      group: "Calendars",
      icon: <EyeOffIcon />,
      prompt: "choose a calendar to hide or show",
      accepts: (id) => {
        if (!isCalendar(id)) return "The Agent isn't a calendar.";
        if (!shownOnGrid(id) && hiddenElsewhere(id)) return `${nameOf(id)} is hidden from the side panel. Show it there.`;
        return true;
      },
      apply: (id) => {
        const shown = shownOnGrid(id);
        setShown(id, !shown);
        return {
          message: shown ? `${nameOf(id)} hidden from the calendar` : `${nameOf(id)} shown on the calendar`,
          undo: () => setShown(id, shown),
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
        const source = feedSourceOf(id);
        if (source) return calendarLinks[source] ? true : `${nameOf(id)} has no calendar link to sync.`;
        return "Only imported and Google calendars sync.";
      },
      apply: (id) => sync(id),
    },
    {
      id: "ask",
      kind: "node",
      label: "Ask Agent",
      group: "Agent",
      icon: <ChatIcon />,
      prompt: "choose a WatAgent calendar to attach to a message",
      accepts: (id) => (isLocal(id) ? true : id === AGENT ? "Drop it on a WatAgent calendar." : "Only WatAgent calendars can be attached to a message."),
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
  ];

  //dragging a WatAgent calendar onto the Agent asks about it
  const nodeDrop: MapNodeDrop = {
    accepts: (dragged, target) => (target === AGENT && isLocal(dragged) ? true : "Only WatAgent calendars can be attached to a message."),
    apply: (dragged) => {
      onAskAgent(dragged);
      return { message: `Chat opened with @${nameOf(dragged)} attached` };
    },
  };

  return (
    <CalendarMap
      label="Calendar map"
      nodes={nodes}
      edges={edges}
      functions={functions}
      nodeDrop={nodeDrop}
      layoutStore={layoutStore}
      hint="Drag a function onto a calendar. To choose whose copy of a shared event shows, drag from LEARN, Portal or Google's handle onto another."
      toolbar={
        <div className="settings-toggle calendar-map-toggle">
          <label htmlFor={toggleId}>Hide duplicate copies</label>
          <Switch id={toggleId} checked={!showDuplicateEvents} onChange={(checked) => onShowDuplicateEvents(!checked)} />
        </div>
      }
    />
  );
}
