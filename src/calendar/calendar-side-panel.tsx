"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { CalendarView } from "@/calendar/types";
import { addDays, addMonths, isToday, monthCells, startOfLocalDay, startOfWeek } from "@/calendar/date-utils";
import type { GoogleCalendarRef } from "@/calendar/google-calendar-client";
import { isExcludedGoogleCalendarName } from "@/calendar/calendar-lists";
import {
  CALENDAR_PALETTE,
  isSidebarHidden,
  type CalendarColors,
  type CalendarSourceFilter,
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
  googleCalendars: GoogleCalendarRef[];
  colorOverrides: Record<string, string>;
  onColorOverrides: (next: Record<string, string>) => void;
  smartTags: SmartTag[];
  onSmartTags: (next: SmartTag[]) => void;
  smartTagSamples: SmartTagTarget[];
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
  googleCalendars,
  colorOverrides,
  onColorOverrides,
  smartTags,
  onSmartTags,
  smartTagSamples,
}: Props) {
  const [cursor, setCursor] = useState(() => startOfLocalDay(focus));
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuPresence = usePresence(menu);
  const shownMenu = menuPresence.value;
  const [openGroups, setOpenGroups] = useState({ watagent: true, other: true, hidden: true });
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
  const allRows: Row[] = [...localRows, ...googleRows];
  const visible = (row: Row) => !isSidebarHidden(sources, row.id);
  const watagentRows = localRows.filter(visible);
  const otherRows = googleRows.filter(visible);
  const hiddenRows = allRows.filter((row) => isSidebarHidden(sources, row.id));
  const smartTagCalendars = allRows.map((row) => ({ id: row.id, name: row.name, google: Boolean(row.google) }));

  function toggle(id: string, checked: boolean) {
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
        onSources({ ...sources, google: true, mutedGoogleIds: ids.filter((item) => item !== id) });
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
    const ids = googleCalendars.map((calendar) => calendar.id);
    if (id === "events") {
      onSources({ events: true, tasks: false, google: false, mutedGoogleIds: ids, hiddenIds: [] });
    } else if (id === "tasks") {
      onSources({ events: false, tasks: true, google: false, mutedGoogleIds: ids, hiddenIds: [] });
    } else {
      onSources({
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
          open={openGroups.watagent}
          onToggle={() => setOpenGroups((current) => ({ ...current, watagent: !current.watagent }))}
          rows={watagentRows}
          menuId={menu?.id}
          onToggleRow={toggle}
          onOpenMenu={openRowMenu}
        />
        {otherRows.length > 0 ? (
          <CalendarGroup
            title="Other calendars"
            open={openGroups.other}
            onToggle={() => setOpenGroups((current) => ({ ...current, other: !current.other }))}
            rows={otherRows}
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
        />
        {hiddenRows.length > 0 ? (
          <CalendarGroup
            title="Hidden calendars"
            open={openGroups.hidden}
            onToggle={() => setOpenGroups((current) => ({ ...current, hidden: !current.hidden }))}
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
          onDisplayOnly={() => displayOnly(shownMenu.id)}
          onHide={() => hideCalendar(shownMenu.id)}
          onColor={(color) => paint(shownMenu.id, color)}
        />
      ) : null}
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
  onToggleRow?: (id: string, checked: boolean) => void;
  onOpenMenu?: (row: Row, anchor: DOMRect) => void;
  onUnhide?: (id: string) => void;
}) {
  return (
    <section className="side-cal-list">
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
      <Disclosure open={open}>
        <ul>
          {rows.map((row) => (
            <li key={row.id} className={`side-cal-row${hidden ? " is-hidden-row" : ""}`}>
              {hidden ? (
                <span className="side-cal-swatch" style={{ background: row.color }} aria-hidden="true" />
              ) : (
                <button
                  type="button"
                  className={`side-cal-check${row.checked ? " is-on" : ""}`}
                  style={{ color: row.color, background: row.checked ? row.color : "transparent" }}
                  aria-pressed={row.checked}
                  aria-label={`${row.checked ? "Hide" : "Show"} ${row.name}`}
                  onClick={() => onToggleRow?.(row.id, !row.checked)}
                >
                  {row.checked ? <CheckIcon /> : null}
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
  onDisplayOnly,
  onHide,
  onColor,
}: {
  menuRef: RefObject<HTMLDivElement | null>;
  menu: MenuState;
  open: boolean;
  onDisplayOnly: () => void;
  onHide: () => void;
  onColor: (color: string) => void;
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
      <button type="button" role="menuitem" onClick={onDisplayOnly}>
        Display this only
      </button>
      <button type="button" role="menuitem" onClick={onHide}>
        Hide calendar
      </button>
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