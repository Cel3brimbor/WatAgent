"use client";

import { useCallback, useId, useRef, useState } from "react";
import { ContextMenu, menuStateFromElement, type ContextMenuState } from "@/shared/context-menu";
import { useDialog } from "@/shared/use-dialog";
import { ConfirmDialog } from "@/shared/confirm-dialog";
import { DotsIcon } from "@/calendar/sidebar-icons";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Switch } from "@/shared/switch";
import { reorderCalendarPriority } from "@/calendar/calendar-priority";
import {
  feedSyncProgressLabel,
  formatFeedSyncSummary,
  syncImportedFeed,
} from "@/calendar/calendar-sync";
import type { CalendarImportProgress } from "@/calendar/client";
import type { CalendarFeedSource, CalendarLinks, CalendarNames, CalendarPriorityOrder, CalendarPrioritySource } from "@/calendar/types";

const LABELS: Record<CalendarPrioritySource, string> = {
  learn: "LEARN / Brightspace",
  portal: "Portal",
  google: "Google Calendar",
};

export function CalendarPriorityPanel({ names, calendarLinks, googleConnected, onRename, order, onReorder, showDuplicates, onShowDuplicatesChange, onRemove, onRefresh, onSyncGoogle }: {
  names: CalendarNames;
  calendarLinks: CalendarLinks;
  googleConnected: boolean;
  onRename: (source: CalendarFeedSource, name: string) => void;
  order: CalendarPriorityOrder;
  onReorder: (order: CalendarPriorityOrder) => void;
  showDuplicates: boolean;
  onShowDuplicatesChange: (show: boolean) => void;
  onRemove: (source: CalendarFeedSource) => Promise<void>;
  onRefresh: () => Promise<void>;
  onSyncGoogle: () => Promise<number | null>;
}) {
  const [menu, setMenu] = useState<(NonNullable<ContextMenuState> & { source: CalendarFeedSource }) | null>(null);
  const labels = { ...LABELS, ...names };
  const [renaming, setRenaming] = useState<CalendarFeedSource | null>(null);
  const [pendingRemove, setPendingRemove] = useState<CalendarFeedSource | null>(null);
  const [removing, setRemoving] = useState<CalendarFeedSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<CalendarPrioritySource | null>(null);
  const [syncProgress, setSyncProgress] = useState<CalendarImportProgress | null>(null);
  const [syncResults, setSyncResults] = useState<Partial<Record<CalendarPrioritySource, string>>>({});
  const closeMenu = useCallback(() => setMenu(null), []);

  function canSync(source: CalendarPrioritySource): boolean {
    if (source === "google") return googleConnected;
    return Boolean(calendarLinks[source]);
  }

  async function syncSource(source: CalendarPrioritySource) {
    if (syncing || removing) return;
    if (!canSync(source)) {
      setError(source === "google" ? "Link Google Calendar first." : "Import this calendar link above first.");
      return;
    }
    setError(null);
    setSyncResults((current) => {
      const next = { ...current };
      delete next[source];
      return next;
    });
    setSyncing(source);
    setSyncProgress({ done: 0, total: null });
    const name = labels[source];
    try {
      if (source === "google") {
        await onSyncGoogle();
        await onRefresh();
        setSyncResults((current) => ({ ...current, google: "Google Calendar synced." }));
        return;
      }
      const url = calendarLinks[source];
      if (!url) return;
      const result = await syncImportedFeed(source, url, setSyncProgress);
      await onRefresh();
      setSyncResults((current) => ({ ...current, [source]: formatFeedSyncSummary(name, result) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "This calendar could not be synced.");
    } finally {
      setSyncing(null);
      setSyncProgress(null);
    }
  }

  async function remove(source: CalendarFeedSource) {
    if (removing) return;
    setPendingRemove(null);
    setMenu(null);
    setError(null);
    setRemoving(source);
    try { await onRemove(source); }
    catch { setError("Unable to remove this calendar. Please try again."); }
    finally { setRemoving(null); }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function dragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const next = reorderCalendarPriority(order, String(active.id), String(over.id));
    if (next !== order) onReorder(next);
  }

  return (
    <section className="settings-section" aria-labelledby="settings-calendar-priority">
      <h3 id="settings-calendar-priority">Calendar priority</h3>
      <p id="calendar-priority-hint" className="modal-hint">
        LEARN and Portal show up here after their events finish importing. Google Calendar joins while it is linked, and it works best last.
        Drag to set priority. The calendar at the top wins when the same title appears on the same day.
        Matching ignores capitalization and extra spaces. Both records are kept.
      </p>
      <DndContext id="calendar-priority" sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}
        accessibility={{
          screenReaderInstructions: { draggable: "Press Space to pick up a calendar. Use the up and down arrow keys to change its priority, then press Space to drop it. Press Escape to cancel." },
          announcements: {
            onDragStart: ({ active }) => `Picked up ${labels[active.id as CalendarPrioritySource]}.`,
            onDragOver: ({ active, over }) => over ? `${labels[active.id as CalendarPrioritySource]} will move to priority ${order.indexOf(over.id as CalendarPrioritySource) + 1}.` : undefined,
            onDragEnd: ({ active, over }) => over ? `${labels[active.id as CalendarPrioritySource]} moved to priority ${order.indexOf(over.id as CalendarPrioritySource) + 1}.` : "Reordering cancelled.",
            onDragCancel: () => "Reordering cancelled.",
          },
        }}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ol className="calendar-priority-list" aria-label="Calendar priority, highest first" aria-describedby="calendar-priority-hint">
            {order.map((source, index) => <PriorityRow key={source} source={source} label={labels[source]} rank={index + 1}
              busy={removing !== null || syncing !== null} removing={removing === source} menuOpen={menu?.source === source}
              syncing={syncing === source} syncProgress={syncing === source ? syncProgress : null}
              syncResult={syncResults[source]} syncEnabled={canSync(source)}
              onSync={() => void syncSource(source)}
              onMenu={source === "google" ? undefined : (element) => setMenu((current) => current?.source === source ? null : { ...menuStateFromElement(element), source })} />)}
          </ol>
        </SortableContext>
      </DndContext>
      {order.length === 0 ? <p className="modal-hint">No calendars yet. Paste a LEARN or Portal link above, or link Google Calendar.</p> : null}
      {order.includes("google") && order[order.length - 1] !== "google" ? (
        <p className="calendar-priority-warning" role="status">
          Drag Google Calendar to the bottom. LEARN and Portal should outrank it when the same class is on both calendars.
        </p>
      ) : null}
      {error ? <p className="calendar-import-error" role="alert">{error}</p> : null}
      <ContextMenu state={menu} onClose={closeMenu} items={menu ? [{
        id: "rename", label: "Rename calendar", disabled: removing !== null,
        onSelect: () => { setRenaming(menu.source); setMenu(null); },
      }, {
        id: "remove", label: "Remove calendar", danger: true, disabled: removing !== null,
        onSelect: () => { setPendingRemove(menu.source); setMenu(null); },
      }] : []} />
      {renaming ? <RenameCalendarDialog name={labels[renaming]} onCancel={() => setRenaming(null)}
        onSave={(name) => { onRename(renaming, name); setRenaming(null); }} /> : null}
      {pendingRemove ? <ConfirmDialog title={`Remove ${labels[pendingRemove]}?`}
        message="Remove this calendar from the priority list and archive its imported events in WatAgent? You can restore it by importing the link again. Events in external calendars are not deleted."
        confirmLabel="Remove calendar" onCancel={() => setPendingRemove(null)} onConfirm={() => void remove(pendingRemove)} /> : null}
      <p className="calendar-priority-keyboard-hint">Keyboard: focus a drag handle, press Space, then use ↑ or ↓ to reorder.</p>
      <div className="settings-toggle">
        <label htmlFor="show-duplicate-events">Show both versions of duplicate events</label>
        <Switch id="show-duplicate-events" checked={showDuplicates} onChange={onShowDuplicatesChange} />
      </div>
    </section>
  );
}

function PriorityRow({ source, label, rank, busy, removing, menuOpen, syncing, syncProgress, syncResult, syncEnabled, onSync, onMenu }: {
  source: CalendarPrioritySource; label: string; rank: number; busy: boolean; removing: boolean; menuOpen: boolean;
  syncing: boolean; syncProgress: CalendarImportProgress | null; syncResult?: string; syncEnabled: boolean;
  onSync: () => void;
  onMenu?: (element: HTMLButtonElement) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: source, disabled: busy });
  const progressLabel = syncProgress ? feedSyncProgressLabel(label, syncProgress) : "";
  return (
    <li ref={setNodeRef} className={`calendar-priority-item${isDragging ? " is-dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}>
      <div className="calendar-priority-row">
        <button ref={setActivatorNodeRef} type="button" className="calendar-priority-handle"
          {...attributes} {...listeners} disabled={busy} aria-label={`Drag ${label}, priority ${rank}`}>
          <svg width="16" height="20" viewBox="0 0 16 20" fill="currentColor" aria-hidden="true">
            {[5, 10, 15].map((y) => <g key={y}><circle cx="5" cy={y} r="1.5" /><circle cx="11" cy={y} r="1.5" /></g>)}
          </svg>
        </button>
        <span className="calendar-priority-rank" aria-hidden="true">{rank}</span>
        <span className="calendar-priority-name">{label}</span>
        {rank === 1 ? <span className="calendar-priority-badge">Highest priority</span> : null}
        <button
          type="button"
          className={`calendar-priority-sync${syncing ? " is-syncing" : ""}`}
          disabled={busy || syncing || !syncEnabled}
          aria-busy={syncing}
          aria-label={syncing ? `Syncing ${label}` : `Sync ${label}`}
          onClick={onSync}
        >
          {syncing ? <span className="sync-spinner" aria-hidden="true" /> : "Sync"}
        </button>
        {onMenu ? <button type="button" className="calendar-priority-menu" disabled={busy}
          aria-label={`Options for ${label}`} aria-haspopup="menu" aria-expanded={menuOpen}
          onClick={(event) => onMenu(event.currentTarget)}>
          <DotsIcon />
        </button> : null}
        {removing ? <span className="calendar-priority-progress" role="status">Removing…</span> : null}
      </div>
      {syncing ? (
        <div className="calendar-import-status calendar-priority-sync-status">
          <progress
            className="calendar-import-meter"
            aria-label={syncProgress ? progressLabel : `Syncing ${label}`}
            {...(syncProgress?.total == null ? {} : { value: syncProgress.done, max: Math.max(syncProgress.total, 1) })}
          />
          <p className="modal-hint">{syncProgress ? progressLabel : `Syncing ${label}…`}</p>
        </div>
      ) : null}
      {!syncing && syncResult ? (
        <p className="calendar-priority-sync-result settings-status" role="status">{syncResult}</p>
      ) : null}
    </li>
  );
}

export function RenameCalendarDialog({ name, onCancel, onSave }: { name: string; onCancel: () => void; onSave: (name: string) => void }) {
  const [value, setValue] = useState(name);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const inputId = useId();
  useDialog(ref, { open: true, onEscape: onCancel, initialFocus: inputRef });
  return <div className="modal-backdrop" role="presentation" data-state="open" onClick={onCancel}>
    <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
      <h2 id={titleId}>Rename calendar</h2>
      <form onSubmit={(event) => { event.preventDefault(); if (value.trim()) onSave(value.trim()); }}>
        <label htmlFor={inputId}>Calendar name</label>
        <input ref={inputRef} id={inputId} value={value} onChange={(event) => setValue(event.target.value)} maxLength={80} required autoComplete="off" />
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary-btn" disabled={!value.trim()}>Save name</button>
        </div>
      </form>
    </div>
  </div>;
}
