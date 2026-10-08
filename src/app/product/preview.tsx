"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDayView } from "@/calendar/views/day-view";
import { CalendarMonthView } from "@/calendar/views/month-view";
import { CalendarWeekView } from "@/calendar/views/week-view";
import { CalendarYearView } from "@/calendar/views/year-view";
import { HOUR_PX } from "@/calendar/calendar-grid";
import { addDays, formatFocusLabel, shiftFocus, startOfLocalDay, startOfWorkWeek } from "@/calendar/date-utils";
import type { CalendarView, TimelineItem } from "@/calendar/types";
import { SegmentedControl, type SegmentOption } from "@/shared/segmented-control";
import { ChevronLeftIcon, ChevronRightIcon } from "@/shared/icons";
import { ExploreDialog } from "./explore-dialog";
import { AgentReel } from "./agent-reel";
import { FeatureReel, type FeatureId } from "./feature-reel";
import { SAMPLE_TAGS, sampleItems } from "./sample-calendar";
import styles from "./product.module.css";

const WEEK_STARTS = 1 as const;

const VIEW_OPTIONS: SegmentOption<CalendarView>[] = [
  { value: "day", label: "Day", hint: "Day" },
  { value: "workweek", label: "5 Day", hint: "Monday to Friday" },
  { value: "week", label: "Week", hint: "Week" },
  { value: "month", label: "Month", hint: "Month" },
  { value: "year", label: "Year", hint: "Year" },
];

const SECTIONS: Array<{ id: FeatureId | "calendar"; label: string }> = [
  { id: "calendar", label: "Calendar" },
  { id: "tasks", label: "Tasks" },
  { id: "events", label: "Events" },
  { id: "calendars", label: "Calendars" },
];

function whenLabel(item: TimelineItem): string {
  const start = new Date(item.startUTC);
  const day = start.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  if (item.allDay) return `${day} · All day`;
  const clock: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const end = new Date(item.endUTC).toLocaleTimeString(undefined, clock);
  return `${day} · ${start.toLocaleTimeString(undefined, clock)} – ${end}`;
}

export function ProductStage() {
  const [feature, setFeature] = useState<FeatureId>("tags");
  const [ask, setAsk] = useState(false);

  function showFeature(id: FeatureId) {
    setFeature(id);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("showcase")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  }

  return (
    <>
      <CalendarPreview onFeature={showFeature} onAskAgent={() => setAsk(true)} />
      <div className={styles.showcase} id="showcase">
        <div className={styles.sectionIntro}>
          <span className={styles.label}>A CLOSER LOOK</span>
          <h2>Turn it, and <em>read a side.</em></h2>
          <p>Tags, events, tasks, calendars, and rules — with the same chips as the week above.<br />Open a row. Tap a task. Leave real edits for the app.</p>
        </div>
        <FeatureReel active={feature} onActive={setFeature} />
        <AgentReel onAskAgent={() => setAsk(true)} />
      </div>
      {ask ? <ExploreDialog onClose={() => setAsk(false)} /> : null}
    </>
  );
}

function CalendarPreview({ onFeature, onAskAgent }: { onFeature: (id: FeatureId) => void; onAskAgent: () => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState(() => startOfLocalDay(new Date(2026, 9, 8)));
  const [view, setView] = useState<CalendarView>("week");
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<TimelineItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openTag, setOpenTag] = useState<string | null>(null);
  const [tagsOpen, setTagsOpen] = useState(true);
  const [mounted, setMounted] = useState(false);

  const itemsForDay = (date: Date) => sampleItems(date).map((item) => ({ ...item, completed: completed[item.id] ?? false }));

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const node = scroller.current;
    if (!node || !mounted) return;
    if (view === "month" || view === "year") {
      node.scrollTop = 0;
      return;
    }
    //keep the sample morning in frame, whatever the clock says
    if (node.scrollTop < 40) node.scrollTop = 7 * HOUR_PX;
  }, [view, mounted]);

  function refuseEdit() {
    setSelected(null);
    setNotice("This preview can’t add or edit. The week above is a sample.");
  }

  function openItem(item: TimelineItem) {
    setNotice(null);
    setSelected(item);
  }

  function move(offset: number) {
    setSelected(null);
    setNotice(null);
    setFocus((current) => shiftFocus(current, view, offset));
  }

  function openDay(date: Date) {
    setSelected(null);
    setNotice(null);
    setFocus(startOfLocalDay(date));
    setView("day");
  }

  const workDays = view === "workweek" ? Array.from({ length: 5 }, (_, index) => addDays(startOfWorkWeek(focus), index)) : undefined;

  return (
    <div className={styles.productDemo}>
      <div className={styles.demoFrame}>
        <aside className={styles.demoSidebar}>
          <div className={styles.demoWordmark}>WatAgent</div>
          <nav aria-label="Sample sections">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`side-nav-bar${section.id === "calendar" ? " is-active" : ""}`}
                aria-current={section.id === "calendar" ? "page" : undefined}
                onClick={() => {
                  if (section.id === "calendar") return;
                  onFeature(section.id);
                }}
              >
                {section.label}
              </button>
            ))}
          </nav>
          <div className={styles.sourceList}>
            <h3>WATAGENT CALENDARS</h3>
            <p><i /> Events</p>
            <p><i className={styles.taskSwatch} /> Tasks</p>
            <h3>EXTERNAL CALENDARS</h3>
            <p><i /> Course schedule</p>
            <div className={styles.tagBlock}>
              <button type="button" className={styles.tagHeading} aria-expanded={tagsOpen} onClick={() => setTagsOpen((value) => !value)}>
                <span>SMART TAGS</span>
                <i aria-hidden="true">{tagsOpen ? "–" : "+"}</i>
              </button>
              {tagsOpen ? SAMPLE_TAGS.map((tag) => {
                const open = openTag === tag.id;
                return (
                  <div key={tag.id} className={styles.tagRow}>
                    <button type="button" aria-expanded={open} onClick={() => setOpenTag(open ? null : tag.id)}>
                      <i style={{ background: tag.color }} />
                      <span>{tag.name}</span>
                    </button>
                    {open ? <p>{tag.rule} {tag.note}</p> : null}
                  </div>
                );
              }) : null}
            </div>
          </div>
        </aside>
        <div className={styles.demoMain}>
          <header data-section="calendar" className={`calendar-toolbar ${styles.demoToolbar}`}>
            <div className="calendar-toolbar-left">
              <h2 aria-live="polite">{formatFocusLabel(focus, view, WEEK_STARTS)}</h2>
            </div>
            <div className="calendar-toolbar-right">
              <div className="calendar-step">
                <button type="button" className="icon-btn" aria-label="Previous" onClick={() => move(-1)}><ChevronLeftIcon /></button>
                <button type="button" className="calendar-today-btn" onClick={() => { setFocus(startOfLocalDay(new Date())); setSelected(null); setNotice(null); }}>Today</button>
                <button type="button" className="icon-btn" aria-label="Next" onClick={() => move(1)}><ChevronRightIcon /></button>
              </div>
              <SegmentedControl
                value={view}
                onChange={(next) => { setView(next); setSelected(null); setNotice(null); }}
                options={VIEW_OPTIONS}
                label="Calendar view"
              />
              <button type="button" className="ghost-btn calendar-agent-btn" aria-haspopup="dialog" onClick={onAskAgent}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3a7 7 0 0 0-4 12.7V19a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-3.3A7 7 0 0 0 12 3z" />
                  <path d="M9.5 21h5" />
                  <circle cx="10" cy="11" r="0.85" fill="currentColor" stroke="none" />
                  <circle cx="14" cy="11" r="0.85" fill="currentColor" stroke="none" />
                </svg>
                Agent
              </button>
            </div>
          </header>
          {notice ? <p className={styles.previewNotice} role="status">{notice}</p> : null}
          <div className={styles.demoCalendar} ref={scroller}>
            {mounted && view === "day" ? (
              <CalendarDayView
                focus={focus}
                items={itemsForDay(focus)}
                onOpen={openItem}
                onCreateTimed={refuseEdit}
                onCreateAllDay={refuseEdit}
                onCompleteTask={(id, done) => setCompleted((previous) => ({ ...previous, [id]: done }))}
              />
            ) : null}
            {mounted && (view === "week" || view === "workweek") ? (
              <CalendarWeekView
                focus={focus}
                weekStartsOn={WEEK_STARTS}
                days={workDays}
                itemsForDay={itemsForDay}
                onOpen={openItem}
                onCreateTimed={refuseEdit}
                onCreateAllDay={refuseEdit}
                onSelectDay={openDay}
                onCompleteTask={(id, done) => setCompleted((previous) => ({ ...previous, [id]: done }))}
              />
            ) : null}
            {mounted && view === "month" ? (
              <CalendarMonthView
                focus={focus}
                onSelectDate={(date) => { setFocus(startOfLocalDay(date)); setNotice(null); }}
                weekStartsOn={WEEK_STARTS}
                itemsForDay={itemsForDay}
                onOpen={openItem}
                onCreate={refuseEdit}
                onCompleteTask={(id, done) => setCompleted((previous) => ({ ...previous, [id]: done }))}
              />
            ) : null}
            {mounted && view === "year" ? (
              <CalendarYearView focus={focus} weekStartsOn={WEEK_STARTS} itemsForDay={itemsForDay} onSelectDay={openDay} />
            ) : null}
          </div>
          {selected ? (
            <div className={styles.detail} role="dialog" aria-label={selected.title}>
              <header>
                <span>{selected.kind === "task" ? "Task" : "Event"}{selected.smartTag ? ` · ${selected.smartTag.name}` : ""}</span>
                <button type="button" onClick={() => setSelected(null)}>Close</button>
              </header>
              <h3>{selected.title}</h3>
              <p>{whenLabel(selected)}</p>
              {selected.location ? <p className={styles.detailPlace}>{selected.location}</p> : null}
              {selected.description ? <p className={styles.detailCopy}>{selected.description}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className={styles.demoFootnote}>
        <span>Sample week · view only</span>
        <span>Switch views. Open an event to read it.</span>
      </div>
    </div>
  );
}
