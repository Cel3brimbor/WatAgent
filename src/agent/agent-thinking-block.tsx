"use client";

import { useMemo, useState } from "react";
import type { ToolEventRecord } from "@/agent/types";

const TOOL_LABELS: Record<string, string> = {
  list_calendar_items: "Listed calendar items",
  add_calendar_item: "Added a calendar item",
  update_calendar_item: "Updated a calendar item",
  delete_calendar_item: "Deleted a calendar item",
  complete_calendar_task: "Completed a task",
};

function collapsedSummary(events: ToolEventRecord[]): string {
  const parts = events.map((event) => event.resultSummary || TOOL_LABELS[event.tool] || event.tool);
  const unique = [...new Set(parts)];
  return unique.slice(0, 3).join(" · ") || "Used tools";
}

function stateGlyph(state: ToolEventRecord["state"]): string {
  if (state === "succeeded") return "✓";
  if (state === "failed") return "!";
  return "↗";
}

export function AgentThinkingBlock({ events }: { events?: ToolEventRecord[] }) {
  const [open, setOpen] = useState(false);
  const summary = useMemo(() => (events && events.length > 0 ? collapsedSummary(events) : ""), [events]);

  if (!events || events.length === 0) return null;

  return (
    <div className="agent-thinking-block">
      <button
        type="button"
        className="agent-thinking-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{summary}</span>
      </button>
      {open ? (
        <ol className="agent-thinking-timeline">
          {events.map((event) => (
            <li key={event.id} data-state={event.state}>
              <span className="agent-tool-icon" aria-hidden>
                {stateGlyph(event.state)}
              </span>
              <div className="agent-tool-copy">
                <code className="agent-tool-badge">{event.tool}</code>
                {event.resultSummary ? <p className="agent-tool-result">{event.resultSummary}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
