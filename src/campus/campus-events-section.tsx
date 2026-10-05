"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCampusEvents } from "@/campus/campus-client";
import {
  campusCategoryLabel,
  campusDays,
  campusEventIcs,
  campusFeedUrl,
  campusPlacements,
  eventInCampusCategory,
  googleCalendarLink,
  icsFileName,
  isDropInSport,
  localSpan,
  matchesCampusQuery,
  toggledCategories,
  type CampusEvent,
  type CampusEventsPayload,
  type CampusSeries,
} from "@/campus/campus-events";
import { CampusSubscriptions } from "@/campus/campus-subscriptions";
import { formatTime } from "@/calendar/date-utils";
import type { CalendarItemDoc } from "@/calendar/types";
import { ContextMenu, menuStateFromElement, type ContextMenuItem, type ContextMenuPosition } from "@/shared/context-menu";
import { CheckIcon, ChevronDownIcon } from "@/shared/icons";
import styles from "./campus-events.module.css";

type Props = {
  /** Everything on your calendars, to mark events you already have. */
  items: CalendarItemDoc[];
  /** WatAgent calendars an event can be added to. */
  calendars: Array<{ id: string; name: string }>;
  onAdd: (event: CampusEvent, calendarId: string) => void;
  /** One imported calendar per enabled category. */
  subscriptions: Array<{ feedId: string; categories: string[] }>;
  /** Saves the categories that should each have a calendar. None removes them. */
  onSubscribe: (categories: Array<{ id: string; label: string }>) => Promise<void>;
};

//rows rendered at first; the rest wait behind "Show more" so a busy term doesn't build hundreds of cards
const PAGE = 40;
const LOADING_POLL_MS = 15_000;

type Load = { data: CampusEventsPayload | null; error: string | null; loading: boolean };

function useCampusEvents() {
  const [state, setState] = useState<Load>({ data: null, error: null, loading: true });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    try {
      const data = await fetchCampusEvents();
      setState({ data, error: null, loading: false });
    } catch (err) {
      setState((current) => ({ ...current, loading: false, error: err instanceof Error ? err.message : "Unable to load UWaterloo events." }));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  //the server's first scrape takes about a minute; check back until it's done
  const collecting = state.data?.status === "loading";
  useEffect(() => {
    if (!collecting) return;
    const timer = window.setTimeout(() => void load(), LOADING_POLL_MS);
    return () => window.clearTimeout(timer);
  }, [collecting, state.data, load]);
  return { ...state, reload: load };
}

function dayHeading(date: Date, now: number): string {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  const full = date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  if (days === 0) return `Today · ${full}`;
  if (days === 1) return `Tomorrow · ${full}`;
  return full;
}

function shortDay(utc: number): string {
  return new Date(utc).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function monthDay(utc: number): string {
  return new Date(utc).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function sameDay(a: number, b: number): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/** The time column: start and end the same day, "All day", or the day a longer event runs until. */
function whenLines(event: CampusEvent): { main: string; end?: string; until?: string } {
  const { startUTC, endUTC } = localSpan(event);
  if (event.allDay) {
    const lastDay = endUTC - 86_400_000;
    return lastDay > startUTC ? { main: "All day", until: `until ${monthDay(lastDay)}` } : { main: "All day" };
  }
  if (sameDay(startUTC, endUTC)) return { main: formatTime(startUTC), end: formatTime(endUTC) };
  return { main: formatTime(startUTC), until: `until ${monthDay(endUTC)}` };
}

//a file the browser saves, for Apple Calendar, Outlook and the rest
function downloadIcs(event: CampusEvent) {
  const url = URL.createObjectURL(new Blob([campusEventIcs(event, Date.now())], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = icsFileName(event);
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function updatedLabel(updatedAt: number | null, now: number): string {
  if (updatedAt == null) return "";
  const minutes = Math.max(0, Math.round((now - updatedAt) / 60_000));
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Updated ${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `Updated ${new Date(updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

//re-reads the clock each minute, so finished events leave the list and memos stay steady between ticks
function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function CampusEventsSection({ items, calendars, onAdd, subscriptions, onSubscribe }: Props) {
  const { data, error, loading, reload } = useCampusEvents();
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [limit, setLimit] = useState(PAGE);
  const [menu, setMenu] = useState<{ position: ContextMenuPosition; event: CampusEvent } | null>(null);
  const now = useMinute();
  //the switches move at once and settle when the calendar has synced
  const [pendingCategories, setPendingCategories] = useState<string[] | null>(null);
  const savedCategories = subscriptions.flatMap((entry) => entry.categories);
  const subscribed = pendingCategories ?? savedCategories;
  const feedIds = subscriptions.map((entry) => entry.feedId);
  const placementOf = useMemo(() => campusPlacements(items, feedIds), [items, feedIds]);

  const labels = useMemo(() => new Map((data?.categories ?? []).map((entry) => [entry.id, entry.label])), [data]);
  const sourceNames = useMemo(() => new Map((data?.sources ?? []).map((entry) => [entry.id, entry.name])), [data]);
  const upcoming = useMemo(() => (data?.events ?? []).filter((event) => localSpan(event).endUTC > now), [data, now]);
  const counts = useMemo(() => {
    const found = new Map<string, number>();
    for (const event of upcoming) for (const id of event.categories) found.set(id, (found.get(id) ?? 0) + 1);
    //the drop-in chip counts every sport, including sessions still tagged with the old combined category
    let dropIns = 0;
    for (const [id, count] of found) if (id === "recreation" || isDropInSport(id)) dropIns += count;
    if (dropIns > 0) found.set("recreation", dropIns);
    return found;
  }, [upcoming]);
  const shown = useMemo(
    () => upcoming.filter((event) => eventInCampusCategory(event, category) && matchesCampusQuery(event, query)),
    [upcoming, category, query],
  );
  const days = useMemo(() => campusDays(shown, now), [shown, now]);

  //page through series, not days, so one busy day can't hide the rest
  let budget = limit;
  const visibleDays = days.flatMap((day) => {
    if (budget <= 0) return [];
    const series = day.series.slice(0, budget);
    budget -= series.length;
    return [{ ...day, series }];
  });
  const seriesCount = days.reduce((sum, day) => sum + day.series.length, 0);

  const menuItems: ContextMenuItem[] = menu
    ? [
        ...calendars.map((calendar) => ({
          id: `calendar:${calendar.id}`,
          label: `Add to ${calendar.name}`,
          onSelect: () => onAdd(menu.event, calendar.id),
        })),
        {
          id: "google",
          label: "Open in Google Calendar",
          onSelect: () => void window.open(googleCalendarLink(menu.event), "_blank", "noopener,noreferrer"),
        },
        { id: "ics", label: "Download .ics file", onSelect: () => downloadIcs(menu.event) },
      ]
    : [];

  function addButton(event: CampusEvent, compact = false) {
    if (placementOf(event) === "added") {
      return (
        <span className={compact ? styles.addedSmall : styles.added}>
          <CheckIcon />
          Added
        </span>
      );
    }
    return (
      <button
        type="button"
        className={compact ? styles.addSmall : `ghost-btn ${styles.add}`}
        aria-haspopup="menu"
        aria-label={`Add ${event.title} to a calendar`}
        onClick={(click) => setMenu({ position: menuStateFromElement(click.currentTarget), event })}
      >
        {compact ? "Add" : "Add to calendar"}
        {compact ? null : <ChevronDownIcon />}
      </button>
    );
  }

  async function toggleSubscription(id: string, on: boolean) {
    if (!data || pendingCategories) return;
    const next = toggledCategories(savedCategories, id, on, data.categories);
    setPendingCategories(next);
    try {
      await onSubscribe(next.map((categoryId) => ({ id: categoryId, label: labels.get(categoryId) ?? campusCategoryLabel(categoryId) })));
    } finally {
      setPendingCategories(null);
    }
  }

  function subscribedTitle(event: CampusEvent): string {
    const categoryId = event.categories.find((id) => subscribed.includes(id));
    const name = categoryId ? labels.get(categoryId) ?? campusCategoryLabel(categoryId) : "UWaterloo Events";
    return `On your ${name} calendar`;
  }

  function toggleExpanded(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function renderSeries(series: CampusSeries) {
    const { next, more } = series;
    const when = whenLines(next);
    const open = expanded.has(series.key);
    const meta = [next.location, sourceNames.get(next.source)].filter(Boolean).join(" · ");
    return (
      <li key={series.key} className={styles.event}>
        <div className={styles.when}>
          <span>{when.main}</span>
          {when.end ? <small className={styles.end}>{when.end}</small> : null}
          {when.until ? <small>{when.until}</small> : null}
        </div>
        <div className={styles.body}>
          <a className={styles.eventTitle} href={next.url} target="_blank" rel="noreferrer noopener">
            {next.title}
          </a>
          {meta ? <p className={styles.meta}>{meta}</p> : null}
          {next.summary ? <p className={styles.summary}>{next.summary}</p> : null}
          <div className={styles.tags}>
            {placementOf(next) === "subscribed" ? (
              <span className={styles.onCalendar} title={subscribedTitle(next)}>
                <CheckIcon />
                Subscribed
              </span>
            ) : null}
            {next.categories.map((id) => (
              <span key={id} className={styles.tag}>
                {labels.get(id) ?? "Other"}
              </span>
            ))}
            {more.length > 0 ? (
              <button type="button" className={styles.more} aria-expanded={open} onClick={() => toggleExpanded(series.key)}>
                {open ? "Hide other dates" : `${more.length} more date${more.length === 1 ? "" : "s"}`}
              </button>
            ) : null}
          </div>
          {open ? (
            <ul className={styles.dates}>
              {more.map((occurrence) => {
                const lines = whenLines(occurrence);
                return (
                  <li key={occurrence.id}>
                    <span>{[shortDay(localSpan(occurrence).startUTC), lines.end ? `${lines.main} – ${lines.end}` : lines.until ?? lines.main].join(" · ")}</span>
                    {addButton(occurrence, true)}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        <div className={styles.actions}>{addButton(next)}</div>
      </li>
    );
  }

  function renderBody() {
    if (!data) {
      if (error) {
        return (
          <div className={styles.empty} role="alert">
            <p>{error}</p>
            <button type="button" className="ghost-btn" onClick={() => void reload()} disabled={loading}>
              Try again
            </button>
          </div>
        );
      }
      return <p className={styles.empty}>Loading UWaterloo events…</p>;
    }
    if (data.status === "loading" && upcoming.length === 0) {
      return <p className={styles.empty}>Collecting events from uwaterloo.ca. The first pass takes about a minute.</p>;
    }
    if (data.status === "off" && upcoming.length === 0) {
      return <p className={styles.empty}>UWaterloo events are turned off on this server.</p>;
    }
    if (upcoming.length === 0) return <p className={styles.empty}>No upcoming UWaterloo events right now.</p>;
    if (days.length === 0) {
      return (
        <div className={styles.empty}>
          <p>No events match{query.trim() ? ` “${query.trim()}”` : ""}{category ? ` in ${labels.get(category) ?? "this category"}` : ""}.</p>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              setQuery("");
              setCategory(null);
            }}
          >
            Show all events
          </button>
        </div>
      );
    }
    return (
      <>
        <div className={styles.days}>
          {visibleDays.map((day) => (
            <section key={day.key} className={styles.day} aria-labelledby={`campus-day-${day.key}`}>
              <h3 id={`campus-day-${day.key}`} className={styles.dayTitle}>
                {dayHeading(day.date, now)}
              </h3>
              <ul className={styles.list}>{day.series.map(renderSeries)}</ul>
            </section>
          ))}
        </div>
        {seriesCount > limit ? (
          <button type="button" className={`ghost-btn ${styles.showMore}`} onClick={() => setLimit((current) => current + PAGE)}>
            Show more events
          </button>
        ) : null}
      </>
    );
  }

  const chips = (data?.categories ?? []).filter((entry) => entry.group !== "drop-ins" && (counts.get(entry.id) ?? 0) > 0);
  //calendar apps can only reach a public https server, so development has no link to share
  const feedLink = (() => {
    const link = campusFeedUrl(subscribed);
    return link.startsWith("https://") ? link : null;
  })();
  const subtitle = [
    data ? `${upcoming.length} upcoming` : "",
    data ? updatedLabel(data.updatedAt, now) : "",
  ].filter(Boolean).join(" · ");

  return (
    <section className={styles.section} aria-labelledby="campus-heading">
      <div className={styles.head}>
        <div>
          <h2 id="campus-heading">UWaterloo events</h2>
          <p>{subtitle || "Talks, workshops, games and dates from around campus"}</p>
        </div>
      </div>
      {data && data.categories.length > 0 ? (
        <CampusSubscriptions
          categories={data.categories}
          counts={counts}
          subscribed={subscribed}
          busy={pendingCategories != null}
          onToggle={(id, on) => void toggleSubscription(id, on)}
          feedLink={feedLink}
        />
      ) : null}
      <input
        type="search"
        className={styles.search}
        placeholder="Search events"
        aria-label="Search UWaterloo events"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setLimit(PAGE);
        }}
      />
      {chips.length > 0 ? (
        <div className={styles.chips} role="group" aria-label="Filter by category">
          <button type="button" className={styles.chip} aria-pressed={category == null} onClick={() => setCategory(null)}>
            All <span>{upcoming.length}</span>
          </button>
          {chips.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={styles.chip}
              title={entry.hint}
              aria-pressed={category === entry.id}
              onClick={() => {
                setCategory((current) => (current === entry.id ? null : entry.id));
                setLimit(PAGE);
              }}
            >
              {entry.label} <span>{counts.get(entry.id)}</span>
            </button>
          ))}
        </div>
      ) : null}
      {renderBody()}
      <ContextMenu state={menu?.position ?? null} items={menuItems} onClose={() => setMenu(null)} />
      {data && data.sources.length > 0 ? (
        <p className={styles.footer}>
          From{" "}
          {data.sources.map((source, index) => (
            <span key={source.id}>
              {index > 0 ? (index === data.sources.length - 1 ? " and " : ", ") : ""}
              <a href={source.url} target="_blank" rel="noreferrer noopener">
                {source.name}
              </a>
            </span>
          ))}
          .
        </p>
      ) : null}
    </section>
  );
}
