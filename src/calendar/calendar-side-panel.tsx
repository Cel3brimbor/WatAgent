"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { ConfirmDialog } from "@/shared/confirm-dialog";
import { RenameCalendarDialog } from "@/calendar/calendar-priority-panel";
import type { ExternalCalendarRef } from "@/calendar/external-calendars";
import { formatFeedSyncSummary, syncImportedFeed } from "@/calendar/calendar-sync";
import type { CalendarFeedSource, CalendarLinks, CalendarView, ImportedCalendarSource } from "@/calendar/types";
import { addDays, addMonths, isToday, monthCells, startOfLocalDay, startOfWeek } from "@/calendar/date-utils";
import type { GoogleCalendarRef } from "@/calendar/google-calendar-client";
import { isExcludedGoogleCalendarName } from "@/calendar/calendar-lists";
import {
  CALENDAR_PALETTE,
  calendarGroupsOf,
  isSidebarHidden,
  type CalendarColors,
  type CalendarGroups,
  type CalendarSourceFilter,
  type SidePanelSectionsOpen,
} from "@/calendar/preferences";
import type { SmartTag, SmartTagTarget } from "@/calendar/smart-tags";
import { SmartTagsPanel } from "@/calendar/smart-tags-panel";
import { CheckIcon, ChevronIcon, DotsIcon, GoogleCalendarIcon } from "@/calendar/sidebar-icons";
import { ChevronLeftIcon, ChevronRightIcon } from "@/shared/icons";
import { Disclosure } from "@/shared/disclosure";
import { usePresence } from "@/shared/use-presence";

type Row = {
  id: string;
  name: string;
  color: string;
  checked: boolean;
  google?: boolean;
};

type MenuState = {
  id: string;
  name: string;
  color: string;
  top: number;
  left: number;
};

type Props = {
  focus: Date;
  view: CalendarView;
  weekStartsOn: 0 | 1;
  onFocus: (date: Date) => void;
  sources: CalendarSourceFilter;
  onSources: (next: CalendarSourceFilter) => void;
  colors: CalendarColors;
  onColors: (next: CalendarColors) => void;
  externalCalendars: ExternalCalendarRef[];
  calendarLinks: CalendarLinks;
  onRenameExternal: (source: CalendarFeedSource, name: string) => void;
  onRemoveExternal: (source: CalendarFeedSource) => Promise<void>;
  onRefreshCalendars: () => Promise<void>;
  onSyncGoogle: () => Promise<number | null>;
  onNotice: (message: string) => void;
  googleCalendars: GoogleCalendarRef[];
  colorOverrides: Record<string, string>;
  onColorOverrides: (next: Record<string, string>) => void;
  smartTags: SmartTag[];
  onSmartTags: (next: SmartTag[]) => void;
  smartTagSamples: SmartTagTarget[];
  sidePanelSections: SidePanelSectionsOpen;
  onSidePanelSections: (next: SidePanelSectionsOpen) => void;
};

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function googleChecked(sources: CalendarSourceFilter, id: string): boolean {
  return sources.google && !sources.mutedGoogleIds.includes(id);
}

export function CalendarSidePanel({
  focus,
  view,
  weekStartsOn,
  onFocus,
  sources,
  onSources,
  colors,
  onColors,
  externalCalendars,
  calendarLinks,
  onRenameExternal,
  onRemoveExternal,
  onRefreshCalendars,
  onSyncGoogle,
  onNotice,
  googleCalendars,
  colorOverrides,
  onColorOverrides,
  smartTags,
  onSmartTags,
  smartTagSamples,
  sidePanelSections,
  onSidePanelSections,
}: Props) {
  const [externalOpen, setExternalOpen] = useState(true);
  const [renaming, setRenaming] = useState<ExternalCalendarRef | null>(null);
  const [removing, setRemoving] = useState<ExternalCalendarRef | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [cursor, setCursor] = useState(() => startOfLocalDay(focus));
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuPresence = usePresence(menu);
  const shownMenu = menuPresence.value;
  const menuRef = useRef<HTMLDivElement | null>(null);
  const headingId = useId();

  useEffect(() => {
    setCursor(startOfLocalDay(focus));
  }, [focus]);

  useEffect(() => {
    if (!menu) return;
    function onPointer(event: MouseEvent) {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenu(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const cells = monthCells(cursor, weekStartsOn);
  const weekStartDate = startOfWeek(focus, weekStartsOn);
  const weekEndDate = addDays(weekStartDate, 7);
  const weekdayLetters = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStartDate, index).toLocaleDateString(undefined, { weekday: "narrow" }),
  );
  const monthTitle = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const localRows: Row[] = [
    { id: "events", name: "WatAgent", color: colors.event, checked: sources.events },
    { id: "tasks", name: "Tasks", color: colors.task, checked: sources.tasks },
  ];
  const googleRows: Row[] = googleCalendars
    .filter((calendar) => !isExcludedGoogleCalendarName(calendar.name))
    .map((calendar) => ({
      id: calendar.id,
      name: calendar.name,
      color: colorOverrides[calendar.id] || calendar.color || colors.google,
      checked: googleChecked(sources, calendar.id),
      google: true,
    }));
  const externalRows: Row[] = externalCalendars.map((calendar) => ({
    id: calendar.id, name: calendar.name, color: colorOverrides[calendar.id] || colors.event,
    checked: !sources.mutedGoogleIds.includes(calendar.id),
  }));
  const allRows: Row[] = [...localRows, ...externalRows, ...googleRows];
  const groups = calendarGroupsOf(sources.groups);
  function setGroup(key: keyof CalendarGroups, on: boolean) {
    onSources({ ...sources, groups: { ...groups, [key]: on } });
  }
  const externalById = (id: string) => externalCalendars.find((calendar) => calendar.id === id);
  const visible = (row: Row) => !isSidebarHidden(sources, row.id);
  const watagentRows = localRows.filter(visible);
  const otherRows = googleRows.filter(visible);
  const hiddenRows = allRows.filter((row) => isSidebarHidden(sources, row.id));
  const smartTagCalendars = allRows.map((row) => ({ id: row.id, name: row.name, google: Boolean(row.google) }));

  function toggle(id: string, checked: boolean) {
    if (externalById(id)) {
      onSources({ ...sources, mutedGoogleIds: checked ? sources.mutedGoogleIds.filter((item) => item !== id) : [...new Set([...sources.mutedGoogleIds, id])] });
      return;
    }
    if (id === "events") {
      onSources({ ...sources, events: checked });
      return;
    }
    if (id === "tasks") {
      onSources({ ...sources, tasks: checked });
      return;
    }
    const ids = googleCalendars.map((calendar) => calendar.id);
    if (checked) {
      if (!sources.google) {
        onSources({ ...sources, google: true, mutedGoogleIds: [...sources.mutedGoogleIds.filter((item) => externalById(item)), ...ids.filter((item) => item !== id)] });
        return;
      }
      onSources({
        ...sources,
        google: true,
        mutedGoogleIds: sources.mutedGoogleIds.filter((item) => item !== id),
      });
      return;
    }
    const muted = [...new Set([...sources.mutedGoogleIds, id])];
    const anyVisible = ids.some((item) => !muted.includes(item));
    onSources({ ...sources, google: anyVisible, mutedGoogleIds: muted });
  }

  function hideCalendar(id: string) {
    if (isSidebarHidden(sources, id)) return;
    const hiddenIds = [...sources.hiddenIds, id];
    if (id === "events") {
      onSources({ ...sources, events: false, hiddenIds });
    } else if (id === "tasks") {
      onSources({ ...sources, tasks: false, hiddenIds });
    } else {
      const mutedGoogleIds = [...new Set([...sources.mutedGoogleIds, id])];
      onSources({ ...sources, mutedGoogleIds, hiddenIds });
    }
    setMenu(null);
  }

  function unhideCalendar(id: string) {
    const hiddenIds = sources.hiddenIds.filter((item) => item !== id);
    if (externalById(id)) {
      onSources({ ...sources, hiddenIds, mutedGoogleIds: sources.mutedGoogleIds.filter((item) => item !== id) });
      return;
    }
    if (id === "events") {
      onSources({ ...sources, events: true, hiddenIds });
      return;
    }
    if (id === "tasks") {
      onSources({ ...sources, tasks: true, hiddenIds });
      return;
    }
    onSources({
      ...sources,
      google: true,
      hiddenIds,
      mutedGoogleIds: sources.mutedGoogleIds.filter((item) => item !== id),
    });
  }

  function displayOnly(id: string) {
    const ids = [...googleCalendars.map((calendar) => calendar.id), ...externalCalendars.map((calendar) => calendar.id)];
    if (externalById(id)) {
      onSources({ ...sources, events: false, tasks: false, google: false, mutedGoogleIds: ids.filter((item) => item !== id), hiddenIds: sources.hiddenIds.filter((item) => item !== id) });
      setMenu(null);
      return;
    }
    if (id === "events") {
      onSources({ ...sources, events: true, tasks: false, google: false, mutedGoogleIds: ids, hiddenIds: [] });
    } else if (id === "tasks") {
      onSources({ ...sources, events: false, tasks: true, google: false, mutedGoogleIds: ids, hiddenIds: [] });
    } else {
      onSources({
        ...sources,
        events: false,
        tasks: false,
        google: true,
        mutedGoogleIds: ids.filter((item) => item !== id),
        hiddenIds: sources.hiddenIds.filter((item) => item !== id),
      });
    }
    setMenu(null);
  }

  function paint(id: string, color: string) {
    const next = color.toLowerCase();
    if (id === "events") onColors({ ...colors, event: next });
    else if (id === "tasks") onColors({ ...colors, task: next });
    else onColorOverrides({ ...colorOverrides, [id]: next });
    setMenu((current) => (current && current.id === id ? { ...current, color: next } : current));
  }

  function openRowMenu(row: Row, anchor: DOMRect) {
    if (menu?.id === row.id) {
      setMenu(null);
      return;
    }
    openMenu(row, anchor);
  }

  function openMenu(row: Row, anchor: DOMRect) {
    const width = 196;
    let left = anchor.right - width;
    if (left < 8) left = 8;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    const top = Math.min(anchor.bottom + 6, window.innerHeight - 220);
    setMenu({ id: row.id, name: row.name, color: row.color, top, left });
  }

  async function syncCalendarRow(id: string) {
    if (syncBusy) return;
    const external = externalById(id);
    const isGoogle = googleCalendars.some((calendar) => calendar.id === id);
    if (!external && !isGoogle) return;
    setSyncBusy(true);
    setMenu(null);
    try {
      if (external) {
        const source = external.source as ImportedCalendarSource;
        const url = calendarLinks[source];
        if (!url) {
          onNotice("No calendar link saved for this feed. Import it again in Settings.");
          return;
        }
        const result = await syncImportedFeed(source, url);
        await onRefreshCalendars();
        onNotice(formatFeedSyncSummary(external.name, result));
        return;
      }
      await onSyncGoogle();
      await onRefreshCalendars();
      onNotice("Google Calendar synced.");
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "This calendar could not be synced.");
    } finally {
      setSyncBusy(false);
    }
  }

  const menuExternal = shownMenu ? externalById(shownMenu.id) : undefined;
  const menuIsGoogle = shownMenu ? googleCalendars.some((calendar) => calendar.id === shownMenu.id) : false;
  const menuCanSync = Boolean(menuExternal || menuIsGoogle);

  return (
    <div className="side-cal">
      <div className="side-cal-nav">
        <strong>{monthTitle}</strong>
        <div className="side-cal-arrows">
          <button type="button" aria-label="Previous month" onClick={() => setCursor((date) => addMonths(date, -1))}>
            <ChevronLeftIcon />
          </button>
          <button type="button" aria-label="Next month" onClick={() => setCursor((date) => addMonths(date, 1))}>
            <ChevronRightIcon />
          </button>
        </div>
      </div>
      <div className="side-cal-grid" role="grid" aria-label={monthTitle}>
        {weekdayLetters.map((letter, index) => (
          <span key={`${letter}-${index}`} className="side-cal-dow">
            {letter}
          </span>
        ))}
        {cells.map((cell) => {
          const selected = sameDay(cell.date, focus);
          const today = isToday(cell.date);
          const inWeek = view === "week" && cell.date >= weekStartDate && cell.date < weekEndDate;
          return (
            <button
              key={cell.date.toISOString()}
              type="button"
              role="gridcell"
              className={`side-cal-day${cell.inMonth ? "" : " is-outside"}${today ? " is-today" : ""}${selected ? " is-selected" : ""}${inWeek ? " is-in-week" : ""}`}
              aria-label={cell.date.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
              aria-current={selected ? "date" : undefined}
              onClick={() => onFocus(startOfLocalDay(cell.date))}
            >
              {cell.date.getDate()}
            </button>
          );
        })}
      </div>
      <div className="side-cal-groups">
        <CalendarGroup
          title="WatAgent Calendars"
          headingId={headingId}
          open={sidePanelSections.watagent}
          onToggle={() =>
            onSidePanelSections({ ...sidePanelSections, watagent: !sidePanelSections.watagent })
          }
          rows={watagentRows}
          groupOn={groups.watagent}
          onToggleGroup={(on) => setGroup("watagent", on)}
          menuId={menu?.id}
          onToggleRow={toggle}
          onOpenMenu={openRowMenu}
        />
        {externalRows.filter(visible).length > 0 ? <CalendarGroup title="External calendars" open={externalOpen}
          onToggle={() => setExternalOpen((open) => !open)} rows={externalRows.filter(visible)}
          groupOn={groups.external} onToggleGroup={(on) => setGroup("external", on)}
          menuId={menu?.id} onToggleRow={toggle} onOpenMenu={openRowMenu} /> : null}
        {removeError ? <p role="alert" className="calendar-import-error">{removeError}</p> : null}
        {removeBusy ? <p role="status" className="modal-hint">Removing calendar…</p> : null}
        {syncBusy ? <p role="status" className="modal-hint">Syncing calendar…</p> : null}
        {otherRows.length > 0 ? (
          <CalendarGroup
            title="Google calendar"
            open={sidePanelSections.other}
            onToggle={() => onSidePanelSections({ ...sidePanelSections, other: !sidePanelSections.other })}
            rows={otherRows}
            groupOn={groups.other}
            onToggleGroup={(on) => setGroup("other", on)}
            menuId={menu?.id}
            onToggleRow={toggle}
            onOpenMenu={openRowMenu}
          />
        ) : null}
        <SmartTagsPanel
          tags={smartTags}
          onChange={onSmartTags}
          calendars={smartTagCalendars}
          samples={smartTagSamples}
          open={sidePanelSections.smartTags}
          onOpenChange={(open) => onSidePanelSections({ ...sidePanelSections, smartTags: open })}
          groupOn={groups.smartTags}
          onToggleGroup={(on) => setGroup("smartTags", on)}
        />
        {hiddenRows.length > 0 ? (
          <CalendarGroup
            title="Hidden calendars"
            open={sidePanelSections.hidden}
            onToggle={() => onSidePanelSections({ ...sidePanelSections, hidden: !sidePanelSections.hidden })}
            rows={hiddenRows}
            hidden
            onUnhide={unhideCalendar}
          />
        ) : null}
      </div>
      {shownMenu ? (
        <CalendarOptionsMenu
          menuRef={menuRef}
          menu={shownMenu}
          open={menuPresence.open}
          onSync={menuCanSync && !syncBusy ? () => void syncCalendarRow(shownMenu.id) : undefined}
          onDisplayOnly={() => displayOnly(shownMenu.id)}
          onHide={() => hideCalendar(shownMenu.id)}
          onColor={(color) => paint(shownMenu.id, color)}
          onRename={menuExternal?.source !== "other" && menuExternal ? () => {
            setRenaming(menuExternal); setMenu(null);
          } : undefined}
          onRemove={!removeBusy && menuExternal?.source !== "other" && menuExternal ? () => {
            setRemoving(menuExternal); setMenu(null);
          } : undefined}
        />
      ) : null}
      {renaming ? <RenameCalendarDialog name={renaming.name} onCancel={() => setRenaming(null)} onSave={(name) => {
        if (renaming.source !== "other") onRenameExternal(renaming.source, name);
        setRenaming(null);
      }} /> : null}
      {removing ? <ConfirmDialog title={`Remove ${removing.name}?`}
        message="Archive this calendar’s imported events and remove it from the list? Import its link again to restore it."
        confirmLabel="Remove calendar" onCancel={() => setRemoving(null)} onConfirm={() => {
          const source = removing.source; setRemoving(null);
          if (source === "other") return;
          setRemoveBusy(true); setRemoveError(null);
          void onRemoveExternal(source).catch(() => setRemoveError("Unable to remove this calendar. Please try again.")).finally(() => setRemoveBusy(false));
        }} /> : null}
    </div>
  );
}

function CalendarGroup({
  title,
  headingId,
  open,
  onToggle,
  rows,
  menuId,
  hidden,
  groupOn = true,
  onToggleGroup,
  onToggleRow,
  onOpenMenu,
  onUnhide,
}: {
  title: string;
  headingId?: string;
  open: boolean;
  onToggle: () => void;
  rows: Row[];
  menuId?: string;
  hidden?: boolean;
  groupOn?: boolean;
  onToggleGroup?: (on: boolean) => void;
  onToggleRow?: (id: string, checked: boolean) => void;
  onOpenMenu?: (row: Row, anchor: DOMRect) => void;
  onUnhide?: (id: string) => void;
}) {
  return (
    <section className="side-cal-list">
      <div className="side-cal-heading-row">
        {onToggleGroup && !hidden ? (
          <button
            type="button"
            className={`side-cal-check side-cal-group-check${groupOn ? " is-on" : ""}`}
            style={{ color: "var(--accent)", background: groupOn ? "var(--accent)" : "transparent" }}
            aria-pressed={groupOn}
            aria-label={`${groupOn ? "Hide" : "Show"} every calendar in ${title}`}
            onClick={() => onToggleGroup(!groupOn)}
          >
            {groupOn ? <CheckIcon /> : null}
          </button>
        ) : null}
        <button
          type="button"
          className="side-cal-heading"
          id={headingId}
          aria-expanded={open}
          onClick={onToggle}
        >
          <span>{title}</span>
          <ChevronIcon open={open} />
        </button>
      </div>
      <Disclosure open={open}>
        <ul>
          {rows.map((row) => (
            <li key={row.id} className={`side-cal-row${hidden ? " is-hidden-row" : ""}`}>
              {hidden ? (
                <span className="side-cal-swatch" style={{ background: row.color }} aria-hidden="true" />
              ) : (
                <button
                  type="button"
                  className={`side-cal-check${groupOn && row.checked ? " is-on" : ""}`}
                  style={{ color: row.color, background: groupOn && row.checked ? row.color : "transparent" }}
                  aria-pressed={groupOn && row.checked}
                  aria-label={`${groupOn && row.checked ? "Hide" : "Show"} ${row.name}`}
                  onClick={() => {
                    if (!groupOn) return;
                    onToggleRow?.(row.id, !row.checked);
                  }}
                >
                  {groupOn && row.checked ? <CheckIcon /> : null}
                </button>
              )}
              {row.google ? <GoogleCalendarIcon /> : null}
              <span className="side-cal-name">{row.name}</span>
              {hidden ? (
                <button type="button" className="side-cal-unhide" onClick={() => onUnhide?.(row.id)}>
                  Unhide
                </button>
              ) : (
                <button
                  type="button"
                  className="side-cal-more"
                  aria-label={`${row.name} options`}
                  aria-expanded={menuId === row.id}
                  aria-haspopup="menu"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenMenu?.(row, event.currentTarget.getBoundingClientRect());
                  }}
                >
                  <DotsIcon />
                </button>
              )}
            </li>
          ))}
        </ul>
      </Disclosure>
    </section>
  );
}

function CalendarOptionsMenu({
  menuRef,
  menu,
  open,
  onSync,
  onDisplayOnly,
  onHide,
  onColor,
  onRename,
  onRemove,
}: {
  menuRef: RefObject<HTMLDivElement | null>;
  menu: MenuState;
  open: boolean;
  onSync?: () => void;
  onDisplayOnly: () => void;
  onHide: () => void;
  onColor: (color: string) => void;
  onRename?: () => void;
  onRemove?: () => void;
}) {
  const [box, setBox] = useState({ top: menu.top, left: menu.left });

  useLayoutEffect(() => {
    const height = menuRef.current?.offsetHeight ?? 180;
    const width = menuRef.current?.offsetWidth ?? 196;
    let top = menu.top;
    let left = menu.left;
    if (top + height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - height - 8);
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
    setBox({ top, left });
  }, [menu.top, menu.left, menuRef]);

  return (
    <div
      ref={menuRef}
      className="side-cal-menu"
      role="menu"
      aria-label={`${menu.name} options`}
      data-state={open ? "open" : "closed"}
      inert={!open}
      style={{ top: box.top, left: box.left }}
    >
      {onSync ? (
        <button type="button" role="menuitem" onClick={onSync}>
          Sync calendar
        </button>
      ) : null}
      <button type="button" role="menuitem" onClick={onDisplayOnly}>
        Display this only
      </button>
      <button type="button" role="menuitem" onClick={onHide}>
        Hide calendar
      </button>
      {onRename ? <button type="button" role="menuitem" onClick={onRename}>Rename calendar</button> : null}
      {onRemove ? <button type="button" role="menuitem" onClick={onRemove}>Remove calendar</button> : null}
      <div className="side-cal-swatches" role="group" aria-label="Color">
        {CALENDAR_PALETTE.map((color) => (
          <button
            key={color}
            type="button"
            className={`side-cal-swatch${menu.color.toLowerCase() === color ? " is-current" : ""}`}
            style={{ background: color }}
            aria-label={color}
            aria-pressed={menu.color.toLowerCase() === color}
            onClick={() => onColor(color)}
          />
        ))}
      </div>
    </div>
  );
}