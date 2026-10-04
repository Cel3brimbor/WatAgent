"use client";

import { useCallback, useId, useRef, useState } from "react";
import { ContextMenu, menuStateFromElement, type ContextMenuState } from "@/shared/context-menu";
import { useDialog } from "@/shared/use-dialog";
import { ConfirmDialog } from "@/shared/confirm-dialog";
import { DotsIcon } from "@/calendar/sidebar-icons";
import { feedSyncProgressLabel, formatFeedSyncSummary, syncImportedFeed } from "@/calendar/calendar-sync";
import type { CalendarImportProgress } from "@/calendar/client";
import { mergedByMember } from "@/calendar/imported-calendars";
import { externalCalendarId } from "@/calendar/external-calendars";
import type { ImportedCalendar, ImportedCalendarSource, MergedCalendar } from "@/calendar/types";

const GOOGLE = "google";
type RowId = ImportedCalendarSource | typeof GOOGLE;

export function ImportedCalendarsPanel({ calendars, mergedCalendars, googleConnected, onRename, onRemove, onRefresh, onSyncGoogle }: {
  calendars: ImportedCalendar[];
  mergedCalendars: MergedCalendar[];
  googleConnected: boolean;
  onRename: (id: ImportedCalendarSource, name: string) => void;
  onRemove: (id: ImportedCalendarSource) => Promise<void>;
  onRefresh: () => Promise<void>;
  onSyncGoogle: () => Promise<number | null>;
}) {
  const [menu, setMenu] = useState<(NonNullable<ContextMenuState> & { id: ImportedCalendarSource }) | null>(null);
  const [renaming, setRenaming] = useState<ImportedCalendar | null>(null);
  const [pendingRemove, setPendingRemove] = useState<ImportedCalendar | null>(null);
  const [removing, setRemoving] = useState<ImportedCalendarSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<RowId | null>(null);
  const [syncProgress, setSyncProgress] = useState<CalendarImportProgress | null>(null);
  const [syncResults, setSyncResults] = useState<Partial<Record<RowId, string>>>({});
  const closeMenu = useCallback(() => setMenu(null), []);
  const mergedInto = mergedByMember(mergedCalendars);

  async function sync(id: RowId) {
    if (syncing || removing) return;
    setError(null);
    setSyncResults((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setSyncing(id);
    setSyncProgress({ done: 0, total: null });
    try {
      if (id === GOOGLE) {
        await onSyncGoogle();
        await onRefresh();
        setSyncResults((current) => ({ ...current, google: "Google Calendar synced." }));
        return;
      }
      const calendar = calendars.find((entry) => entry.id === id);
      if (!calendar) return;
      const result = await syncImportedFeed(calendar, setSyncProgress);
      await onRefresh();
      setSyncResults((current) => ({ ...current, [id]: formatFeedSyncSummary(calendar.name, result) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "This calendar could not be synced.");
    } finally {
      setSyncing(null);
      setSyncProgress(null);
    }
  }

  async function remove(calendar: ImportedCalendar) {
    if (removing) return;
    setPendingRemove(null);
    setMenu(null);
    setError(null);
    setRemoving(calendar.id);
    try { await onRemove(calendar.id); }
    catch { setError("Unable to remove this calendar. Please try again."); }
    finally { setRemoving(null); }
  }

  const busy = removing !== null || syncing !== null;
  const menuCalendar = menu ? calendars.find((calendar) => calendar.id === menu.id) : undefined;

  return (
    <section className="settings-section" aria-labelledby="settings-imported-calendars">
      <h3 id="settings-imported-calendars">Imported calendars</h3>
      <p className="modal-hint">
        Every calendar link you&apos;ve imported. Their events are read only and change only when the calendar syncs.
        When two list the same events, combine them in Calendars so they show as one.
      </p>
      <ol className="calendar-priority-list" aria-label="Imported calendars">
        {calendars.map((calendar) => {
          const merged = mergedInto.get(externalCalendarId(calendar.id));
          return (
            <CalendarRow key={calendar.id} label={calendar.name} note={merged ? `In ${merged.name}` : undefined}
              busy={busy} removing={removing === calendar.id} menuOpen={menu?.id === calendar.id}
              syncing={syncing === calendar.id} syncProgress={syncing === calendar.id ? syncProgress : null}
              syncResult={syncResults[calendar.id]} syncEnabled
              onSync={() => void sync(calendar.id)}
              onMenu={(element) => setMenu((current) => current?.id === calendar.id ? null : { ...menuStateFromElement(element), id: calendar.id })} />
          );
        })}
        {googleConnected ? (
          <CalendarRow label="Google Calendar" busy={busy} removing={false} menuOpen={false}
            syncing={syncing === GOOGLE} syncProgress={null} syncResult={syncResults.google} syncEnabled
            onSync={() => void sync(GOOGLE)} />
        ) : null}
      </ol>
      {calendars.length === 0 && !googleConnected ? <p className="modal-hint">No calendars yet. Paste a calendar link above, or link Google Calendar.</p> : null}
      {error ? <p className="calendar-import-error" role="alert">{error}</p> : null}
      <ContextMenu state={menu} onClose={closeMenu} items={menuCalendar ? [{
        id: "rename", label: "Rename calendar", disabled: removing !== null,
        onSelect: () => { setRenaming(menuCalendar); setMenu(null); },
      }, {
        id: "remove", label: "Remove calendar", danger: true, disabled: removing !== null,
        onSelect: () => { setPendingRemove(menuCalendar); setMenu(null); },
      }] : []} />
      {renaming ? <RenameCalendarDialog name={renaming.name} onCancel={() => setRenaming(null)}
        onSave={(name) => { onRename(renaming.id, name); setRenaming(null); }} /> : null}
      {pendingRemove ? <ConfirmDialog title={`Remove ${pendingRemove.name}?`}
        message="Archive its imported events in WatAgent and take it out of any merged calendar? You can restore it by importing the link again. Events in external calendars are not deleted."
        confirmLabel="Remove calendar" onCancel={() => setPendingRemove(null)} onConfirm={() => void remove(pendingRemove)} /> : null}
    </section>
  );
}

function CalendarRow({ label, note, busy, removing, menuOpen, syncing, syncProgress, syncResult, syncEnabled, onSync, onMenu }: {
  label: string; note?: string; busy: boolean; removing: boolean; menuOpen: boolean;
  syncing: boolean; syncProgress: CalendarImportProgress | null; syncResult?: string; syncEnabled: boolean;
  onSync: () => void;
  onMenu?: (element: HTMLButtonElement) => void;
}) {
  const progressLabel = syncProgress ? feedSyncProgressLabel(label, syncProgress) : "";
  return (
    <li className="calendar-priority-item">
      <div className="calendar-priority-row">
        <span className="calendar-priority-name">{label}</span>
        {note ? <span className="calendar-priority-badge">{note}</span> : null}
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

export function RenameCalendarDialog({ name, onCancel, onSave, title = "Rename calendar", fieldLabel = "Calendar name", submitLabel = "Save name" }: {
  name: string; onCancel: () => void; onSave: (name: string) => void; title?: string; fieldLabel?: string; submitLabel?: string;
}) {
  const [value, setValue] = useState(name);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const inputId = useId();
  useDialog(ref, { open: true, onEscape: onCancel, initialFocus: inputRef });
  return <div className="modal-backdrop" role="presentation" data-state="open" onClick={onCancel}>
    <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
      <h2 id={titleId}>{title}</h2>
      <form onSubmit={(event) => { event.preventDefault(); if (value.trim()) onSave(value.trim()); }}>
        <label htmlFor={inputId}>{fieldLabel}</label>
        <input ref={inputRef} id={inputId} value={value} onChange={(event) => setValue(event.target.value)} maxLength={80} required autoComplete="off" />
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary-btn" disabled={!value.trim()}>{submitLabel}</button>
        </div>
      </form>
    </div>
  </div>;
}
