"use client";

import type { PendingAiChange } from "@/calendar/approval-client";
import { formatTime } from "@/calendar/date-utils";

type Props = {
  items: PendingAiChange[];
  busy: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onApproveAll: () => void;
  onRejectAll: () => void;
};

function whenLabel(change: PendingAiChange): string {
  const meta = change.calendar ?? change.previousCalendar;
  if (!meta) return "";
  if (meta.allDay) return "All day";
  return `${formatTime(meta.startUTC)}–${formatTime(meta.endUTC)}`;
}

function actionLabel(change: PendingAiChange): string {
  if (change.action === "delete") return "Delete";
  const existing = change.previousCalendar;
  return existing ? "Update" : "Add";
}

export function AiApprovalPanel({
  items,
  busy,
  onApprove,
  onReject,
  onApproveAll,
  onRejectAll,
}: Props) {
  if (items.length === 0) return null;

  return (
    <section className="ai-approval-panel" aria-label="Pending Agent changes">
      <header className="ai-approval-head">
        <div>
          <h3>Review Agent changes</h3>
          <p>{items.length} pending change{items.length === 1 ? "" : "s"} (not synced to Google until approved)</p>
        </div>
        <div className="ai-approval-bulk">
          <button type="button" className="ghost-btn" disabled={busy} onClick={onRejectAll}>
            Reject all
          </button>
          <button type="button" className="primary-btn" disabled={busy} onClick={onApproveAll}>
            Approve all
          </button>
        </div>
      </header>
      <ul className="ai-approval-list">
        {items.map((change) => (
          <li key={change.id}>
            <div className="ai-approval-copy">
              <span className="ai-approval-action">{actionLabel(change)}</span>
              <strong>{change.title}</strong>
              <span className="ai-approval-when">{whenLabel(change)}</span>
            </div>
            <div className="ai-approval-row-actions">
              <button type="button" className="ghost-btn" disabled={busy} onClick={() => onReject(change.id)}>
                Reject
              </button>
              <button type="button" className="primary-btn" disabled={busy} onClick={() => onApprove(change.id)}>
                Approve
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
