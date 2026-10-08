"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarMonthView } from "@/calendar/views/month-view";
import { CalendarYearView } from "@/calendar/views/year-view";
import { SegmentedControl } from "@/shared/segmented-control";
import { ChevronLeftIcon, ChevronRightIcon } from "@/shared/icons";
import type { TimelineItem } from "@/calendar/types";
import styles from "./product.module.css";

// The public preview uses the production calendar views with fictional data only.
function sampleItems(date: Date): TimelineItem[] {
  const weekday = date.getDay();
  if (weekday === 0 || weekday === 6) return [];
  const titles = weekday % 2 === 0
    ? ["MATH 117 · Calculus", "ECE 150 · Programming"]
    : ["Design project", "Study group"];
  if (weekday === 5) titles.push("Assignment due");
  return titles.map((title, index) => ({
    id: `sample-${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${index}`,
    title,
    kind: index === 2 ? "task" : "event",
    startUTC: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9 + index * 3).getTime(),
    endUTC: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 10 + index * 3).getTime(),
    allDay: false,
  }));
}

export function CalendarPreview() {
  const router = useRouter();
  const [focus, setFocus] = useState(new Date(2026, 9, 8));
  const [view, setView] = useState<"month" | "year">("month");
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const itemsForDay = (date: Date) => sampleItems(date).map((item) => ({ ...item, completed: completed[item.id] ?? false }));
  const [selected, setSelected] = useState<TimelineItem | null>(null);
  const move = (offset: number) => {
    setSelected(null);
    setFocus(new Date(focus.getFullYear() + (view === "year" ? offset : 0), focus.getMonth() + (view === "month" ? offset : 0), 1));
  };

  return (
    <div className={styles.productDemo}>
      <div className={styles.demoFrame}>
        <aside className={styles.demoSidebar}>
          <div className={styles.demoWordmark}>WatAgent</div>
          <nav aria-label="Open sections in WatAgent">
            <Link href="/" className="side-nav-bar is-active">Calendar</Link>
            <Link href="/" className="side-nav-bar">Tasks</Link>
            <Link href="/" className="side-nav-bar">Events</Link>
            <Link href="/" className="side-nav-bar">Calendars</Link>
          </nav>
          <div className={styles.sourceList}>
            <h3>WATAGENT CALENDARS</h3><p><i /> Events</p><p><i className={styles.taskSwatch} /> Tasks</p>
            <h3>EXTERNAL CALENDARS</h3><p><i /> Course schedule</p>
            <h3>SMART TAGS</h3><p className={styles.sourceHint}>Color events automatically by words in their title, location, or description.</p>
          </div>
        </aside>
        <div className={styles.demoMain}>
          <header data-section="calendar" className={`calendar-toolbar ${styles.demoToolbar}`}>
            <div className="calendar-toolbar-left"><h2>{focus.toLocaleDateString("en-CA", view === "year" ? { year: "numeric" } : { month: "long", year: "numeric" })}</h2></div>
            <div className="calendar-toolbar-right">
              <div className="calendar-step">
                <button type="button" className="icon-btn" aria-label="Previous period" onClick={() => move(-1)}><ChevronLeftIcon /></button>
                <button type="button" className="calendar-today-btn" onClick={() => { setFocus(new Date()); setSelected(null); }}>Today</button>
                <button type="button" className="icon-btn" aria-label="Next period" onClick={() => move(1)}><ChevronRightIcon /></button>
              </div>
              <SegmentedControl value={view} onChange={setView} options={[{ value: "month", label: "Month" }, { value: "year", label: "Year" }]} label="Preview calendar view" />
              <Link href="/" className={styles.agentLink}>Agent ↗</Link>
            </div>
          </header>
          <div className={styles.demoCalendar}>
            {view === "month" ? (
              <CalendarMonthView focus={focus} weekStartsOn={1} itemsForDay={itemsForDay} onSelectDate={setFocus} onOpen={setSelected} onCompleteTask={(id, done) => setCompleted((previous) => ({ ...previous, [id]: done }))} onCreate={() => router.push("/")} />
            ) : (
              <CalendarYearView focus={focus} weekStartsOn={1} itemsForDay={itemsForDay} onSelectDay={(date) => { setFocus(date); setView("month"); }} />
            )}
          </div>
        </div>
      </div>
      <div className={styles.demoFootnote} aria-live="polite">
        {selected ? <><strong>{selected.title}</strong><span>{new Date(selected.startUTC).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · Sample event</span><button type="button" onClick={() => setSelected(null)}>Close</button></> : <><span>Actual WatAgent calendar · Sample events</span><span>Explore the dates or switch views.</span></>}
      </div>
    </div>
  );
}
