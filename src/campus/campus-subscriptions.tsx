"use client";

import { useState } from "react";
import type { CampusCategory } from "@/campus/campus-events";
import { ChevronIcon } from "@/calendar/sidebar-icons";
import { Disclosure } from "@/shared/disclosure";
import { Switch } from "@/shared/switch";
import styles from "./campus-events.module.css";

type Props = {
  categories: CampusCategory[];
  /** Upcoming events in each category. */
  counts: Map<string, number>;
  subscribed: string[];
  busy: boolean;
  onToggle: (id: string, on: boolean) => void;
  /** A public https link other calendar apps can subscribe to, when the server has one. */
  feedLink: string | null;
};

export function CampusSubscriptions({ categories, counts, subscribed, busy, onToggle, feedLink }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const names = categories.filter((category) => subscribed.includes(category.id)).map((category) => category.label);
  const summary = busy
    ? "Updating your UWaterloo Events calendars…"
    : names.length === 0
      ? "Turn a category on and it gets its own calendar."
      : `${names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(" and ")} ${names.length === 1 ? "has its own calendar" : "each have their own calendar"}`;

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
            {categories.map((category) => {
              const id = `campus-sub-${category.id}`;
              return (
                <li key={category.id} className={styles.subRow}>
                  <Switch id={id} checked={subscribed.includes(category.id)} disabled={busy} aria-describedby={`${id}-hint`} onChange={(on) => onToggle(category.id, on)} />
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
