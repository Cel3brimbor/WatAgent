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
import type { CalendarNames, CalendarPriorityOrder, CalendarPrioritySource } from "@/calendar/types";

const LABELS: Record<CalendarPrioritySource, string> = { learn: "LEARN / Brightspace", portal: "Portal" };

export function CalendarPriorityPanel({ names, onRename, order, onReorder, showDuplicates, onShowDuplicatesChange, onRemove }: {
  names: CalendarNames;
  onRename: (source: CalendarPrioritySource, name: string) => void;
  order: CalendarPriorityOrder;
  onReorder: (order: CalendarPriorityOrder) => void;
  showDuplicates: boolean;
  onShowDuplicatesChange: (show: boolean) => void;
  onRemove: (source: CalendarPrioritySource) => Promise<void>;
}) {
  const [menu, setMenu] = useState<(NonNullable<ContextMenuState> & { source: CalendarPrioritySource }) | null>(null);
  const labels = { ...LABELS, ...names };
  const [renaming, setRenaming] = useState<CalendarPrioritySource | null>(null);
  const [pendingRemove, setPendingRemove] = useState<CalendarPrioritySource | null>(null);
  const [removing, setRemoving] = useState<CalendarPrioritySource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  async function remove(source: CalendarPrioritySource) {
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
        Drag calendars to set their priority. The calendar at the top wins when LEARN and Portal titles match
        on the same day. Matching ignores capitalization and extra spaces. Both records are kept.
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
              busy={removing !== null} removing={removing === source} menuOpen={menu?.source === source}
              onMenu={(element) => setMenu((current) => current?.source === source ? null : { ...menuStateFromElement(element), source })} />)}
          </ol>
        </SortableContext>
      </DndContext>
      {order.length === 0 ? <p className="modal-hint">No calendars in the priority list. Import a calendar link to add it back.</p> : null}
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

function PriorityRow({ source, label, rank, busy, removing, menuOpen, onMenu }: {
  source: CalendarPrioritySource; label: string; rank: number; busy: boolean; removing: boolean; menuOpen: boolean;
  onMenu: (element: HTMLButtonElement) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: source, disabled: busy });
  return (
    <li ref={setNodeRef} className={`calendar-priority-row${isDragging ? " is-dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}>
      <button ref={setActivatorNodeRef} type="button" className="calendar-priority-handle"
        {...attributes} {...listeners} disabled={busy} aria-label={`Drag ${label}, priority ${rank}`}>
        <svg width="16" height="20" viewBox="0 0 16 20" fill="currentColor" aria-hidden="true">
          {[5, 10, 15].map((y) => <g key={y}><circle cx="5" cy={y} r="1.5" /><circle cx="11" cy={y} r="1.5" /></g>)}
        </svg>
      </button>
      <span className="calendar-priority-rank" aria-hidden="true">{rank}</span>
      <span className="calendar-priority-name">{label}</span>
      {rank === 1 ? <span className="calendar-priority-badge">Highest priority</span> : null}
      <button type="button" className="calendar-priority-menu" disabled={busy}
        aria-label={`Options for ${label}`} aria-haspopup="menu" aria-expanded={menuOpen}
        onClick={(event) => onMenu(event.currentTarget)}>
        <DotsIcon />
      </button>
      {removing ? <span className="calendar-priority-progress" role="status">Removing…</span> : null}
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
