"use client";

import { useEffect, useState } from "react";
import { campusCategoryLabel, campusFeedUrl, toggledCategories, type CampusCategory } from "@/campus/campus-events";
import { ChevronIcon } from "@/calendar/sidebar-icons";
import { Disclosure } from "@/shared/disclosure";
import { afterPaint } from "@/shared/after-paint";
import { Switch } from "@/shared/switch";
import styles from "./campus-events.module.css";

type Props = {
  categories: CampusCategory[];
  /** Upcoming events in each category. */
  counts: Map<string, number>;
  subscribed: string[];
  /** Saves the categories that should each have a calendar. None removes them. */
  onSubscribe: (categories: Array<{ id: string; label: string }>) => Promise<void>;
};

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const have = new Set(b);
  for (const id of a) if (!have.has(id)) return false;
  return true;
}

function enabledSummary(labels: string[]): string {
  if (labels.length === 0) return "Turn a sport on and it gets its own calendar.";
  const shown = labels.length > 2 ? `${labels.slice(0, 2).join(", ")} +${labels.length - 2}` : labels.join(" and ");
  return labels.length === 1 ? `${shown} has its own calendar` : `${shown} each have their own calendar`;
}

function DropInSports({
  label,
  sports,
  counts,
  subscribed,
  onToggle,
  legacy,
}: {
  label: string;
  sports: CampusCategory[];
  counts: Map<string, number>;
  subscribed: string[];
  onToggle: (id: string, on: boolean) => void;
  /** The previous calendar that held every drop-in. Turning it off removes that calendar. */
  legacy: boolean;
}) {
  const enabled = sports.filter((sport) => subscribed.includes(sport.id));
  const [open, setOpen] = useState(enabled.length > 0 || legacy);
  const total = sports.reduce((sum, sport) => sum + (counts.get(sport.id) ?? 0), 0);
  return (
    <li className={styles.subNest}>
      <button
        type="button"
        className={styles.subNestToggle}
        aria-expanded={open}
        aria-controls="campus-drop-in-sports"
        onClick={() => setOpen((current) => !current)}
      >
        <span className={styles.subLabel}>
          <span>{label}</span>
          <small>{enabledSummary(enabled.map((sport) => sport.label))}</small>
        </span>
        <span className={styles.subCount} title="Upcoming drop-ins">
          {total}
        </span>
        <ChevronIcon open={open} />
      </button>
      <Disclosure open={open} id="campus-drop-in-sports">
        <p className={styles.subSportNote}>Each sport is its own calendar. Merge them from Calendars if you want a single one.</p>
        <ul className={styles.subSports}>
          {legacy ? (
            <li className={`${styles.subRow} ${styles.subSport}`}>
              <Switch
                id="campus-sub-recreation"
                checked
                aria-describedby="campus-sub-recreation-hint"
                onChange={(on) => {
                  if (!on) onToggle("recreation", false);
                }}
              />
              <span className={styles.subLabel}>
                <label htmlFor="campus-sub-recreation">All drop-ins</label>
                <small id="campus-sub-recreation-hint">The previous calendar, with every sport. Turn it off to remove it.</small>
              </span>
            </li>
          ) : null}
          {sports.map((sport) => {
            const id = `campus-sub-${sport.id}`;
            return (
              <li key={sport.id} className={`${styles.subRow} ${styles.subSport}`}>
                <Switch id={id} checked={subscribed.includes(sport.id)} aria-describedby={`${id}-hint`} onChange={(on) => onToggle(sport.id, on)} />
                <span className={styles.subLabel}>
                  <label htmlFor={id}>{sport.label}</label>
                  <small id={`${id}-hint`}>{sport.hint}</small>
                </span>
                <span className={styles.subCount} title="Upcoming events">
                  {counts.get(sport.id) ?? 0}
                </span>
              </li>
            );
          })}
        </ul>
      </Disclosure>
    </li>
  );
}

export function CampusSubscriptions({ categories, counts, subscribed, onSubscribe }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  //the knob follows this list on the click. the saved calendars catch up after paint
  const [picked, setPicked] = useState<string[] | null>(null);
  useEffect(() => {
    if (picked && sameIds(picked, subscribed)) setPicked(null);
  }, [picked, subscribed]);
  const shown = picked ?? subscribed;
  const sports = categories.filter((category) => category.group === "drop-ins");
  const rows = categories.filter((category) => category.group !== "drop-ins");
  const named = categories.filter((category) => shown.includes(category.id)).map((category) => category.label);
  const summary = named.length === 0
    ? "Turn a category on and it gets its own calendar."
    : `${named.length > 2 ? `${named.slice(0, 2).join(", ")} +${named.length - 2}` : named.join(" and ")} ${named.length === 1 ? "has its own calendar" : "each have their own calendar"}`;
  const link = campusFeedUrl(shown);
  const feedLink = link.startsWith("https://") ? link : null;

  function toggle(id: string, on: boolean) {
    const next = toggledCategories(shown, id, on, categories);
    setPicked(next);
    const payload = next.map((categoryId) => ({
      id: categoryId,
      label: categories.find((category) => category.id === categoryId)?.label ?? campusCategoryLabel(categoryId),
    }));
    afterPaint(() => {
      void onSubscribe(payload);
    });
  }

  async function copyLink() {
    if (!feedLink) return;
    try {
      await navigator.clipboard.writeText(feedLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className={styles.subscriptions} aria-labelledby="campus-subscriptions-heading">
      <button type="button" className={styles.subToggle} aria-expanded={open} aria-controls="campus-subscriptions-body" onClick={() => setOpen((current) => !current)}>
        <span className={styles.subText}>
          <span id="campus-subscriptions-heading" className={styles.subTitle}>
            Subscriptions
          </span>
          <span>{summary}</span>
        </span>
        <ChevronIcon open={open} />
      </button>
      <Disclosure open={open} id="campus-subscriptions-body">
        <div className={styles.subBody}>
          <p className={styles.subNote}>
            Each category you turn on is its own read-only calendar under UWaterloo Events. It stays up to date as events are added, moved or called off. When LEARN or Portal has the same event, that copy is the one on your calendar.
          </p>
          <ul className={styles.subList}>
            {rows.map((category) => {
              if (category.id === "recreation") {
                return (
                  <DropInSports
                    key={category.id}
                    label={category.label}
                    sports={sports}
                    counts={counts}
                    subscribed={shown}
                    onToggle={toggle}
                    legacy={shown.includes("recreation")}
                  />
                );
              }
              const id = `campus-sub-${category.id}`;
              return (
                <li key={category.id} className={styles.subRow}>
                  <Switch id={id} checked={shown.includes(category.id)} aria-describedby={`${id}-hint`} onChange={(on) => toggle(category.id, on)} />
                  <span className={styles.subLabel}>
                    <label htmlFor={id}>{category.label}</label>
                    <small id={`${id}-hint`}>{category.hint}</small>
                  </span>
                  <span className={styles.subCount} title="Upcoming events">
                    {counts.get(category.id) ?? 0}
                  </span>
                </li>
              );
            })}
          </ul>
          {feedLink ? (
            <div className={styles.feed}>
              <span>Use Google Calendar, Apple Calendar or Outlook instead? Subscribe to this link there.</span>
              <div className={styles.feedRow}>
                <input readOnly value={feedLink} aria-label="Feed link" onFocus={(event) => event.currentTarget.select()} />
                <button type="button" className="ghost-btn" onClick={() => void copyLink()}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </Disclosure>
    </section>
  );
}
