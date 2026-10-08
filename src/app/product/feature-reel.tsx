"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { TimelineStrip } from "@/calendar/timeline-strip";
import type { TimelineItem } from "@/calendar/types";
import { CarouselReel } from "./carousel-reel";
import { SAMPLE_TAGS, sampleItems } from "./sample-calendar";
import styles from "./product.module.css";

export const FEATURES = [
  { id: "tags", title: "Smart tags", kicker: "Color by meaning" },
  { id: "events", title: "Events", kicker: "Campus, in the week" },
  { id: "rules", title: "Agent rules", kicker: "A standing instruction" },
  { id: "calendars", title: "Calendars", kicker: "Many sources" },
  { id: "tasks", title: "Tasks", kicker: "Due, not lost" },
] as const;

export type FeatureId = (typeof FEATURES)[number]["id"];

const DEMO_THURSDAY = new Date(2026, 9, 8);
const DEMO_WEDNESDAY = new Date(2026, 9, 7);

type Props = {
  active: FeatureId;
  onActive: (id: FeatureId) => void;
};

export function FeatureReel({ active, onActive }: Props) {
  return (
    <CarouselReel
      items={FEATURES}
      active={active}
      onActive={onActive}
      ariaLabel="Calendar features"
      hint="Drag sideways to turn it. Tags and tasks respond like the app — still view-only on your real calendar."
      renderBody={(id) => <FeatureBody id={id} />}
    />
  );
}

function ExpandRow({
  title,
  meta,
  open,
  onToggle,
  children,
}: {
  title: string;
  meta?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={styles.expand} data-open={open}>
      <button type="button" aria-expanded={open} onClick={onToggle}>
        <span>
          <strong>{title}</strong>
          {meta ? <em>{meta}</em> : null}
        </span>
        <i aria-hidden="true">{open ? "–" : "+"}</i>
      </button>
      <div className={styles.drawer} data-open={open}>
        <div>{children}</div>
      </div>
    </div>
  );
}

function StripPreview({
  items,
  highlightTagId,
  completed,
  onCompleteTask,
  onOpen,
}: {
  items: TimelineItem[];
  highlightTagId?: string | null;
  completed?: Record<string, boolean>;
  onCompleteTask?: (id: string, done: boolean) => void;
  onOpen?: (item: TimelineItem) => void;
}) {
  return (
    <div className={styles.stripPreview} aria-label="Sample calendar chips">
      {items.map((item) => {
        const withState = completed ? { ...item, completed: completed[item.id] ?? item.completed } : item;
        const dim = highlightTagId && item.smartTag?.id !== highlightTagId;
        return (
          <div key={item.id} className={styles.stripPreviewRow} data-dim={dim || undefined}>
            <TimelineStrip
              item={withState}
              layout="card"
              compact
              onOpen={(opened) => onOpen?.(opened)}
              onCompleteTask={onCompleteTask}
            />
          </div>
        );
      })}
    </div>
  );
}

function FeatureBody({ id }: { id: FeatureId }) {
  if (id === "tags") return <TagsCard />;
  if (id === "events") return <EventsCard />;
  if (id === "rules") return <RulesCard />;
  if (id === "calendars") return <CalendarsCard />;
  return <TasksCard />;
}

const TAG_CHIP_IDS: Record<string, string> = {
  classes: "tag-classes",
  campus: "tag-campus",
  focus: "tag-focus",
};

function TagsCard() {
  const [openTag, setOpenTag] = useState<string | null>(SAMPLE_TAGS[0].id);
  const [focusItem, setFocusItem] = useState<TimelineItem | null>(null);
  const strips = useMemo(() => {
    const thu = sampleItems(DEMO_THURSDAY).filter((item) => item.smartTag);
    const wed = sampleItems(DEMO_WEDNESDAY).filter((item) => item.smartTag?.id === "tag-campus");
    return [...wed, ...thu];
  }, []);

  const activeTag = SAMPLE_TAGS.find((tag) => tag.id === openTag);
  const highlightTagId = openTag ? TAG_CHIP_IDS[openTag] : null;

  return (
    <div className={styles.interactiveCard}>
      <p className={styles.cardLead}>Rules paint events on your week. Coverage can fill the chip, half, or a quarter wedge.</p>
      <div className={styles.stack}>
        {SAMPLE_TAGS.map((tag) => (
          <ExpandRow
            key={tag.id}
            title={tag.name}
            meta={tag.cover}
            open={openTag === tag.id}
            onToggle={() => setOpenTag((current) => (current === tag.id ? null : tag.id))}
          >
            <p>{tag.rule} {tag.note}</p>
          </ExpandRow>
        ))}
      </div>
      <div className={styles.previewBlock}>
        <span className={styles.previewLabel}>{activeTag ? `${activeTag.name} on the grid` : "On the grid"}</span>
        <StripPreview
          items={strips}
          highlightTagId={highlightTagId}
          onOpen={setFocusItem}
        />
      </div>
      {focusItem ? (
        <div className={styles.inlineDetail}>
          <strong>{focusItem.title}</strong>
          <span>{focusItem.smartTag ? `${focusItem.smartTag.name} · ${focusItem.smartTag.cover} coverage` : "No tag"}</span>
          <button type="button" onClick={() => setFocusItem(null)}>Close</button>
        </div>
      ) : null}
    </div>
  );
}

function EventsCard() {
  const [openId, setOpenId] = useState<string | null>("talk");
  const talk = useMemo(
    () => sampleItems(DEMO_WEDNESDAY).find((item) => item.id.includes("talk")) ?? null,
    [],
  );
  const thursday = useMemo(() => sampleItems(DEMO_THURSDAY).filter((item) => item.kind === "event"), []);

  return (
    <div className={styles.interactiveCard}>
      <p className={styles.cardLead}>Campus talks sit beside class blocks — open a day to read times and places.</p>
      <div className={styles.stack}>
        {talk ? (
          <ExpandRow
            title={talk.title}
            meta="Wednesday · STC 1012"
            open={openId === "talk"}
            onToggle={() => setOpenId(openId === "talk" ? null : "talk")}
          >
            <p>{talk.description}</p>
            <StripPreview items={[talk]} onOpen={() => {}} />
          </ExpandRow>
        ) : null}
        <ExpandRow
          title="Thursday · 3 on the day"
          meta="Sample week"
          open={openId === "thu"}
          onToggle={() => setOpenId(openId === "thu" ? null : "thu")}
        >
          <StripPreview items={thursday} onOpen={() => {}} />
        </ExpandRow>
      </div>
    </div>
  );
}

function TasksCard() {
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const tasks = useMemo(() => {
    const days = [DEMO_THURSDAY, new Date(2026, 9, 9)];
    return days.flatMap((date) => sampleItems(date).filter((item) => item.kind === "task"));
  }, []);

  return (
    <div className={styles.interactiveCard}>
      <p className={styles.cardLead}>Tasks use the task color and a checkbox — try checking one off.</p>
      <StripPreview
        items={tasks}
        completed={completed}
        onCompleteTask={(id, done) => setCompleted((previous) => ({ ...previous, [id]: done }))}
        onOpen={() => {}}
      />
    </div>
  );
}

function CalendarsCard() {
  const [open, setOpen] = useState("course");
  const sources = [
    { id: "course", name: "Course schedule", meta: "Imported", color: "#3d6b8c", blurb: "One link, kept in its own lane. Lectures land here before a rule copies what you care about." },
    { id: "personal", name: "Personal", meta: "WatAgent", color: "#5b8a72", blurb: "Lunch, the market, the Sunday call. The calendar you write in yourself." },
    { id: "google", name: "Google Calendar", meta: "Connected", color: "#b0600f", blurb: "Busy blocks and events you already keep. WatAgent reads them. It does not become them." },
  ];

  const previewItems = useMemo(() => sampleItems(DEMO_THURSDAY).slice(0, 4), []);

  return (
    <div className={styles.interactiveCard}>
      <p className={styles.cardLead}>Each source keeps its color. Merged view is what you see above.</p>
      <div className={styles.stack}>
        {sources.map((source) => (
          <ExpandRow
            key={source.id}
            title={source.name}
            meta={source.meta}
            open={open === source.id}
            onToggle={() => setOpen(source.id)}
          >
            <p>{source.blurb}</p>
            <div className={styles.sourceSwatch} style={{ "--strip-color": source.color } as CSSProperties}>
              <i style={{ background: source.color }} />
              <span>Events from {source.name}</span>
            </div>
          </ExpandRow>
        ))}
      </div>
      <div className={styles.previewBlock}>
        <span className={styles.previewLabel}>Thursday together</span>
        <StripPreview items={previewItems} onOpen={() => {}} />
      </div>
    </div>
  );
}

function RulesCard() {
  const [open, setOpen] = useState<string | null>("classes");
  return (
    <div className={styles.interactiveCard}>
      <p className={styles.ruleStatus}>On · they run in the app</p>
      <div className={styles.stack}>
        <ExpandRow
          title="Classes onto the week"
          meta="Course schedule → Personal"
          open={open === "classes"}
          onToggle={() => setOpen(open === "classes" ? null : "classes")}
        >
          <p>When a new lecture appears on the course feed, add it to Personal if the title contains a course code. Look two weeks ahead. Ask before writing.</p>
        </ExpandRow>
        <ExpandRow
          title="Talks worth the walk"
          meta="Campus → Personal"
          open={open === "talks"}
          onToggle={() => setOpen(open === "talks" ? null : "talks")}
        >
          <p>If a campus event mentions a talk or a workshop, draft it onto Personal for the next 10 days. Leave sports alone.</p>
        </ExpandRow>
      </div>
    </div>
  );
}
