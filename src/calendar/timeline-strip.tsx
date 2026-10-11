"use client";

import type { CSSProperties } from "react";
import type { TimelineItem } from "@/calendar/types";
import { formatTime } from "@/calendar/date-utils";
import { CheckIcon } from "@/shared/icons";

type Props = {
  item: TimelineItem;
  compact?: boolean;
  /**stacked title → time → location (day/week grid cards).*/
  layout?: "inline" | "card";
  onOpen: (item: TimelineItem, anchor?: DOMRect) => void;
  onCompleteTask?: (id: string, completed: boolean) => void;
};

function timeRange(item: TimelineItem): string {
  if (item.pinned) return `Due ${formatTime(item.pinnedDueUTC ?? item.startUTC)}`;
  return `${formatTime(item.startUTC)}${item.endUTC > item.startUTC ? `–${formatTime(item.endUTC)}` : ""}`;
}

function itemLocation(item: TimelineItem): string | null {
  const loc = (item.google?.location ?? item.location)?.trim();
  return loc ? loc : null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

const VERB_LABEL = { add: "Added", delete: "Removed", edit: "Updated" } as const;

function stripColorStyle(color: string | undefined): CSSProperties | undefined {
  if (!color || !HEX.test(color)) return undefined;
  return { "--strip-color": color } as CSSProperties;
}

//full fills the chip. half and quarter paint only the side left of the diagonal
function tagPaint(item: TimelineItem, calendarColor: string | undefined): { className: string; style: CSSProperties | undefined } {
  const tag = item.smartTag;
  const cover = tag?.cover === "half" || tag?.cover === "quarter" ? tag.cover : "full";
  if (!tag || cover === "full") {
    return { className: "", style: stripColorStyle(tag?.color ?? calendarColor) };
  }
  return {
    className: ` is-tag-${cover}`,
    style: {
      "--tag-color": tag.color,
      ...(calendarColor && HEX.test(calendarColor) ? { "--strip-color": calendarColor } : {}),
    } as CSSProperties,
  };
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
    const paint = tagPaint(item, item.calendarColor ?? item.google?.calendarColor);
    return (
      <button
        type="button"
        className={`calendar-strip is-gcal-event${compact ? " is-compact" : ""}${layoutClass}${paint.className}`}
        aria-label={item.title}
        title={item.smartTag ? `${item.title} · ${item.smartTag.name}` : undefined}
        style={paint.style}
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
  const verb = item.pendingVerb;
  const paint = tagPaint(item, item.calendarColor);

  return (
    <button
      type="button"
      data-calendar-item={item.id}
      className={`calendar-strip is-${item.kind}${item.completed ? " is-done" : ""}${item.pendingApproval ? " is-pending" : ""}${verb ? ` is-pending-${verb}` : ""}${item.editorDraft ? " is-editor-draft" : ""}${compact ? " is-compact" : ""}${layoutClass}${paint.className}`}
      aria-label={verb ? `${VERB_LABEL[verb]}, pending: ${item.title}` : undefined}
      title={item.smartTag ? `${item.title} · ${item.smartTag.name}` : undefined}
      style={paint.style}
      onClick={(event) => {
          event.stopPropagation();
          onOpen(item, event.currentTarget.getBoundingClientRect());
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
          <CheckIcon />
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
