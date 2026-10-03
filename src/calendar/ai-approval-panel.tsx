"use client";

import { useRef, useState } from "react";
import type { PendingAiChange } from "@/calendar/approval-client";
import { formatDayHeading, formatTime } from "@/calendar/date-utils";
import type { CalendarItemKind, CalendarItemMeta } from "@/calendar/types";
import { ChevronRightIcon } from "@/shared/icons";
import { Disclosure } from "@/shared/disclosure";
import { usePresence } from "@/shared/use-presence";
import { useFlip } from "@/shared/use-flip";

type Props = {
  items: PendingAiChange[];
  busy: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onApproveAll: () => void;
  onRejectAll: () => void;
  onInspect: (change: PendingAiChange) => void;
  /** Agent rule names by id, to say which rule proposed a change. */
  ruleNames?: Record<string, string>;
};

type ChangeVerb = "add" | "delete" | "edit";

function whenLabel(change: PendingAiChange): string {
  const meta = change.calendar ?? change.previousCalendar;
  if (!meta) return "";
  if (meta.allDay) return "All day";
  return `${formatTime(meta.startUTC)}–${formatTime(meta.endUTC)}`;
}

function verbOf(change: PendingAiChange): ChangeVerb {
  if (change.action === "delete") return "delete";
  return change.previousCalendar ? "edit" : "add";
}

function kindOf(change: PendingAiChange): CalendarItemKind {
  return (change.calendar ?? change.previousCalendar)?.kind === "task" ? "task" : "event";
}

function scheduleLabel(meta: CalendarItemMeta): string {
  const day = formatDayHeading(new Date(meta.startUTC));
  if (meta.allDay) return `${day}, all day`;
  return `${day}, ${formatTime(meta.startUTC)}–${formatTime(meta.endUTC)}`;
}

function kindLabel(kind: CalendarItemKind): string {
  return kind === "task" ? "Task" : "Event";
}

type DiffLine = { label: string; from: string; to: string };

function editDiffs(change: PendingAiChange): DiffLine[] {
  const prev = change.previousCalendar;
  const next = change.calendar;
  const lines: DiffLine[] = [];
  const fromTitle = change.previousTitle?.trim();
  const toTitle = change.title.trim();
  if (fromTitle && fromTitle !== toTitle) {
    lines.push({ label: "Title", from: fromTitle, to: toTitle });
  }
  if (!prev || !next) return lines;
  if (prev.kind !== next.kind) {
    lines.push({ label: "Type", from: kindLabel(prev.kind), to: kindLabel(next.kind) });
  }
  const fromWhen = scheduleLabel(prev);
  const toWhen = scheduleLabel(next);
  if (fromWhen !== toWhen) lines.push({ label: "When", from: fromWhen, to: toWhen });
  if ((prev.kind === "task" || next.kind === "task") && Boolean(prev.completed) !== Boolean(next.completed)) {
    lines.push({
      label: "Status",
      from: prev.completed ? "Done" : "Open",
      to: next.completed ? "Done" : "Open",
    });
  }
  return lines;
}

const VERB_NAME: Record<ChangeVerb, string> = { add: "Added", delete: "Removed", edit: "Updated" };

export function AiApprovalPanel({
  items,
  busy,
  onApprove,
  onReject,
  onApproveAll,
  onRejectAll,
  onInspect,
  ruleNames,
}: Props) {
  //keep the last batch on screen while the panel slides away
  const presence = usePresence(items.length > 0 ? items : null);
  const listRef = useRef<HTMLUListElement>(null);
  const shown = presence.value ?? [];
  const [openDiffs, setOpenDiffs] = useState<Set<string>>(() => new Set());
  useFlip(listRef, shown.map((change) => change.id).join("|"));

  if (!presence.value) return null;

  const several = shown.length > 1;

  function toggleDiff(id: string) {
    setOpenDiffs((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section
      className="ai-approval-panel"
      aria-label="Pending Agent changes"
      data-state={presence.open ? "open" : "closed"}
      inert={!presence.open}
    >
      {several ? (
        <header className="ai-approval-head">
          <p>
            {shown.length} pending
          </p>
          <div className="ai-approval-bulk">
            <button type="button" className="ghost-btn" disabled={busy} onClick={onRejectAll}>
              Undo all
            </button>
            <button type="button" className="primary-btn" disabled={busy} onClick={onApproveAll}>
              Approve all
            </button>
          </div>
        </header>
      ) : null}
      <ul className="ai-approval-list" ref={listRef}>
        {shown.map((change) => {
          const verb = verbOf(change);
          const kind = kindOf(change);
          const diffs = verb === "edit" ? editDiffs(change) : [];
          const diffOpen = openDiffs.has(change.id);
          const diffId = `approval-diff-${change.id}`;
          return (
            <li
              key={change.id}
              data-flip-id={change.id}
              className={`ai-approval-item is-${kind} is-${verb}`}
            >
              <div className="ai-approval-main">
                {diffs.length > 0 ? (
                  <button
                    type="button"
                    className="ai-approval-diff-toggle"
                    aria-expanded={diffOpen}
                    aria-controls={diffId}
                    aria-label={diffOpen ? "Hide what changed" : "Show what changed"}
                    onClick={() => toggleDiff(change.id)}
                  >
                    <ChevronRightIcon />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ai-approval-jump"
                  aria-label={`${VERB_NAME[verb]}: ${change.title}. Show on calendar`}
                  onClick={() => onInspect(change)}
                >
                  <span className="ai-approval-title">{change.title}</span>
                  <span className="ai-approval-when">{whenLabel(change)}</span>
                  {change.ruleId ? (
                    <span className="ai-approval-rule">From your rule {ruleNames?.[change.ruleId] ?? "for an imported calendar"}</span>
                  ) : null}
                </button>
                <div className="ai-approval-row-actions">
                  <button type="button" className="ghost-btn" disabled={busy} onClick={() => onReject(change.id)}>
                    Undo
                  </button>
                  <button type="button" className="primary-btn" disabled={busy} onClick={() => onApprove(change.id)}>
                    Approve
                  </button>
                </div>
              </div>
              {diffs.length > 0 ? (
                <Disclosure open={diffOpen} id={diffId}>
                  <ul className="ai-approval-diff">
                    {diffs.map((line) => (
                      <li key={line.label}>
                        <span className="ai-approval-diff-label">{line.label}</span>
                        <span className="ai-approval-diff-from">{line.from}</span>
                        <span className="ai-approval-diff-arrow" aria-hidden>
                          →
                        </span>
                        <span className="ai-approval-diff-to">{line.to}</span>
                      </li>
                    ))}
                  </ul>
                </Disclosure>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
