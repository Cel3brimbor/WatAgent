"use client";

import { useState } from "react";
import { CAMPUS_CALENDAR_NAME, type CampusCategory } from "@/campus/campus-events";
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
    ? `Updating your ${CAMPUS_CALENDAR_NAME} calendar…`
    : names.length === 0
      ? "Pick categories and their events stay on your calendar, new ones included."
      : `${names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(" and ")} on your ${CAMPUS_CALENDAR_NAME} calendar`;

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
            Subscribed events go on a read-only calendar called {CAMPUS_CALENDAR_NAME}. It keeps itself up to date as events are added, moved or called off.
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
