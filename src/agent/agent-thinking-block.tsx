"use client";

import type { ToolEventRecord } from "@/agent/types";
import { AlertIcon, CheckIcon, ToolIcon } from "@/shared/icons";

const PROGRESS: Record<string, string> = {
  list_calendar_items: "Checking your calendar…",
  add_calendar_item: "Adding to your calendar…",
  update_calendar_item: "Updating your calendar…",
  delete_calendar_item: "Removing from your calendar…",
  complete_calendar_task: "Updating that task…",
};

function progressLabel(event: ToolEventRecord): string {
  return PROGRESS[event.tool] || "Working…";
}

function settledLabel(event: ToolEventRecord): string {
  return event.resultSummary || event.tool;
}

function StateGlyph({ state }: { state: ToolEventRecord["state"] | "drafting" }) {
  if (state === "succeeded") return <CheckIcon />;
  if (state === "failed") return <AlertIcon />;
  return <ToolIcon />;
}

export function AgentThinkingBlock({
  events,
  drafting,
}: {
  events?: ToolEventRecord[];
  drafting?: boolean;
}) {
  const steps = events ?? [];
  if (steps.length === 0 && !drafting) return null;

  return (
    <ol className="agent-activity">
      {steps.map((event) => (
        <li key={event.id} data-state={event.state}>
          <span className="agent-tool-icon" aria-hidden>
            <StateGlyph state={event.state} />
          </span>
          <div className="agent-tool-copy">
            <p className={event.state === "calling" ? "agent-activity-live" : "agent-activity-result"}>
              {event.state === "calling" ? progressLabel(event) : settledLabel(event)}
            </p>
            {event.state !== "calling" && event.callLabel ? (
              <p className="agent-activity-detail">{event.callLabel}</p>
            ) : null}
          </div>
        </li>
      ))}
      {drafting ? (
        <li data-state="drafting">
          <span className="agent-tool-icon" aria-hidden>
            <StateGlyph state="drafting" />
          </span>
          <p className="agent-activity-draft">Thinking / Drafting your response…</p>
        </li>
      ) : null}
    </ol>
  );
}
