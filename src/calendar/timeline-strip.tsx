"use client";

import type { TimelineItem } from "@/calendar/types";
import { formatTime } from "@/calendar/date-utils";

type Props = {
  item: TimelineItem;
  compact?: boolean;
  /** Stacked title → time → location (day/week grid cards). */
  layout?: "inline" | "card";
  onOpen: (item: TimelineItem, anchor?: DOMRect) => void;
  onCompleteTask?: (id: string, completed: boolean) => void;
};

function timeRange(item: TimelineItem): string {
  return `${formatTime(item.startUTC)}${item.endUTC > item.startUTC ? `–${formatTime(item.endUTC)}` : ""}`;
}

function itemLocation(item: TimelineItem): string | null {
  const loc = item.google?.location?.trim();
  return loc ? loc : null;
}

function StripCardBody({
  item,
  timeLabel,
}: {
  item: TimelineItem;
  timeLabel: string | null;
}) {
  const location = itemLocation(item);
  return (
    <span className="calendar-strip-main">
      <span className="calendar-strip-title">{item.title}</span>
      {timeLabel ? <span className="calendar-strip-time">{timeLabel}</span> : null}
      {location ? <span className="calendar-strip-location">{location}</span> : null}
    </span>
  );
}

export function TimelineStrip({ item, compact, layout = "inline", onOpen, onCompleteTask }: Props) {
  const isCard = layout === "card";
  const layoutClass = isCard ? " is-card" : "";
  if (item.kind === "gcal_busy") {
    return (
      <div
        className={`calendar-strip is-gcal-busy${compact ? " is-compact" : ""}`}
        aria-label="Busy on Google Calendar"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="calendar-strip-title">{item.title}</span>
      </div>
    );
  }

  if (item.kind === "gcal_event") {
    const timeLabel = item.allDay ? null : timeRange(item);
    const rawColor = item.google?.calendarColor ?? "";
    const color = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : undefined;
    return (
      <button
        type="button"
        className={`calendar-strip is-gcal-event${compact ? " is-compact" : ""}${layoutClass}`}
        aria-label={item.title}
        style={
          color
            ? {
                borderLeftColor: color,
                background: `color-mix(in srgb, ${color} 22%, transparent)`,
              }
            : undefined
        }
        onClick={(event) => {
          event.stopPropagation();
          onOpen(item, event.currentTarget.getBoundingClientRect());
        }}
      >
        {isCard ? (
          <StripCardBody item={item} timeLabel={timeLabel} />
        ) : (
          <>
            <span className="calendar-strip-title">{item.title}</span>
            {timeLabel ? <span className="calendar-strip-time">{timeLabel}</span> : null}
          </>
        )}
      </button>
    );
  }

  const timeLabel = item.allDay ? null : timeRange(item);

  return (
    <button
      type="button"
      className={`calendar-strip is-${item.kind}${item.completed ? " is-done" : ""}${item.pendingApproval ? " is-pending" : ""}${compact ? " is-compact" : ""}${layoutClass}`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(item);
      }}
    >
      {item.kind === "task" ? (
        <span
          className={`calendar-strip-check${item.completed ? " is-checked" : ""}`}
          role="checkbox"
          aria-checked={Boolean(item.completed)}
          onClick={(event) => {
            event.stopPropagation();
            onCompleteTask?.(item.id, !item.completed);
          }}
        >
          {item.completed ? "✓" : "○"}
        </span>
      ) : null}
      {isCard ? (
        <StripCardBody item={item} timeLabel={timeLabel} />
      ) : (
        <>
          <span className="calendar-strip-title">{item.title}</span>
          {timeLabel ? <span className="calendar-strip-time">{timeLabel}</span> : null}
        </>
      )}
    </button>
  );
}
