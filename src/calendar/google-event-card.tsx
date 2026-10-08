"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { TimelineItem } from "@/calendar/types";
import { formatDueWhen, formatGoogleWhen } from "@/calendar/date-utils";

type Props = {
  item: TimelineItem;
  anchor: DOMRect;
  //false while the exit transition plays
  open?: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  calendarLabel?: string;
};

function safeHttps(raw: string | undefined, hosts?: string[]): string | undefined {
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:") return undefined;
  if (
    hosts &&
    !hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  ) {
    return undefined;
  }
  return url.toString();
}

function guestLine(guests: string[]): string {
  if (guests.length === 1) return guests[0];
  if (guests.length === 2) return `${guests[0]} and ${guests[1]}`;
  if (guests.length <= 4) {
    return `${guests.slice(0, -1).join(", ")}, and ${guests[guests.length - 1]}`;
  }
  return `${guests.slice(0, 3).join(", ")}, and ${guests.length - 3} more`;
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="gcal-card-icon">
      {children}
    </svg>
  );
}

//emerge from the side facing the clicked event, level with it, so the card reads as coming from it
function originFor(anchor: DOMRect, left: number, top: number, width: number): string {
  const x = left >= anchor.right ? 0 : left + width <= anchor.left ? width : anchor.left + anchor.width / 2 - left;
  const y = Math.max(0, anchor.top + Math.min(anchor.height, 48) / 2 - top);
  return `${Math.round(x)}px ${Math.round(y)}px`;
}

export function GoogleEventCard({ item, anchor, open = true, onClose, onEdit, onDelete, calendarLabel }: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState(() => {
    const width = 420;
    const margin = 12;
    let left = anchor.right + 8;
    if (left + width > window.innerWidth - margin) left = anchor.left - width - 8;
    if (left < margin) left = margin;
    const top = Math.min(Math.max(margin, anchor.top), window.innerHeight - margin - 160);
    return { left, top, origin: originFor(anchor, left, top, width) };
  });
  const details = item.google;
  const when = item.pinned ? formatDueWhen(item.startUTC) : formatGoogleWhen(item.startUTC, item.endUTC, item.allDay);
  const location = (details?.location ?? item.location)?.trim() || "";
  const description = (details?.description ?? item.description)?.trim() || "";
  const calendarName = details?.calendarName?.trim() || calendarLabel?.trim() || "Agent Main";
  const googleColor = details?.calendarColor;
  const ownColor = item.calendarColor;
  const color =
    googleColor && /^#[0-9a-fA-F]{6}$/.test(googleColor)
      ? googleColor
      : ownColor && /^#[0-9a-fA-F]{6}$/.test(ownColor)
        ? ownColor
        : details
          ? "var(--gcal-color)"
          : "var(--event-color)";
  const htmlLink = safeHttps(details?.htmlLink, ["google.com"]);
  const meetLink = safeHttps(details?.meetLink, ["meet.google.com"]);
  const locationHref = location
    ? safeHttps(location) ??
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
    : undefined;
  const guests = details?.guests?.filter(Boolean) ?? [];
  const reminder = details?.reminder?.trim() || "";

  useLayoutEffect(() => {
    const height = cardRef.current?.offsetHeight ?? 280;
    const width = cardRef.current?.offsetWidth ?? 420;
    const margin = 12;
    let left = anchor.right + 8;
    if (left + width > window.innerWidth - margin) left = anchor.left - width - 8;
    if (left < margin) left = margin;
    let top = anchor.top;
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - margin - height);
    }
    setBox({ left, top, origin: originFor(anchor, left, top, width) });
  }, [anchor, item.id, description, location, guests.length]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (cardRef.current?.contains(event.target as Node)) return;
      onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div
      ref={cardRef}
      className="gcal-card"
      role="dialog"
      aria-label={item.title}
      data-state={open ? "open" : "closed"}
      inert={!open}
      style={{ left: box.left, top: box.top, transformOrigin: box.origin }}
    >
      <header className="gcal-card-head">
        <h3>{item.title}</h3>
        <div className="gcal-card-actions">
          {onEdit ? (
            <button type="button" className="gcal-card-icon-btn" aria-label="Edit event" onClick={onEdit}>
              <Icon>
                <path
                  d="M5 19h3.2L18.4 8.8a1.9 1.9 0 0 0 0-2.7l-.5-.5a1.9 1.9 0 0 0-2.7 0L5 15.8V19z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
                <path d="M13.8 7l3.2 3.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
              </Icon>
            </button>
          ) : null}
          {onDelete ? (
            <button type="button" className="gcal-card-icon-btn" aria-label="Delete event" onClick={onDelete}>
              <Icon>
                <path
                  d="M5 7h14M10 7V5.5h4V7M7 7l.8 11.2a1 1 0 0 0 1 .8h6.4a1 1 0 0 0 1-.8L17 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Icon>
            </button>
          ) : null}
          {htmlLink ? (
            <a
              className="gcal-card-icon-btn"
              href={htmlLink}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Open in Google Calendar"
            >
              <Icon>
                <path
                  d="M14 5h5v5M19 5l-9 9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M17 13.5V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </Icon>
            </a>
          ) : null}
          <button type="button" className="gcal-card-icon-btn" aria-label="Close" onClick={onClose}>
            <Icon>
              <path
                d="M7 7l10 10M17 7 7 17"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </Icon>
          </button>
        </div>
      </header>
      <ul className="gcal-card-rows">
        <li>
          <Icon>
            <circle cx="12" cy="12" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.7" />
            <path
              d="M12 8.5V12l2.5 1.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Icon>
          <span>{when}</span>
        </li>
        {location ? (
          <li>
            <Icon>
              <path
                d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="11" r="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
            </Icon>
            {locationHref ? (
              <a href={locationHref} target="_blank" rel="noreferrer noopener">
                {location}
              </a>
            ) : (
              <span>{location}</span>
            )}
          </li>
        ) : null}
        {meetLink ? (
          <li>
            <Icon>
              <rect
                x="3.5"
                y="7"
                width="11"
                height="10"
                rx="1.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              />
              <path
                d="M14.5 10.5 20 7.5v9l-5.5-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
            </Icon>
            <a href={meetLink} target="_blank" rel="noreferrer noopener">
              Join with Google Meet
            </a>
          </li>
        ) : null}
        {guests.length > 0 ? (
          <li>
            <Icon>
              <circle cx="9" cy="9" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
              <path
                d="M4.5 17.5c.6-2.2 2.4-3.3 4.5-3.3s3.9 1.1 4.5 3.3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
              <circle cx="16" cy="9.5" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.7" />
              <path
                d="M15.2 14.4c1.3.3 2.4 1.2 3 2.6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </Icon>
            <span>{guestLine(guests)}</span>
          </li>
        ) : null}
        {description ? (
          <li>
            <Icon>
              <path
                d="M7 6.5h10M7 12h10M7 17.5h6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </Icon>
            <p>{description}</p>
          </li>
        ) : null}
        <li>
          <span className="gcal-card-cal" style={{ background: color }} aria-hidden="true" />
          <span>{calendarName}</span>
        </li>
        {item.smartTag ? (
          <li>
            <span className="gcal-card-cal is-tag" style={{ background: item.smartTag.color }} aria-hidden="true" />
            <span>
              {item.smartTag.name} <span className="gcal-card-muted">· Smart tag, only in WatAgent</span>
            </span>
          </li>
        ) : null}
        {reminder ? (
          <li>
            <Icon>
              <path
                d="M7 16.5h10l-1.2-1.8V11a3.8 3.8 0 1 0-7.6 0v3.7L7 16.5z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <path
                d="M10.5 16.5a1.5 1.5 0 0 0 3 0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              />
            </Icon>
            <span>{reminder}</span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
