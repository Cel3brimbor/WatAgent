"use client";

import { useId, useMemo, useState } from "react";
import type { ToolEventRecord } from "@/agent/types";
import { Disclosure } from "@/shared/disclosure";
import { AlertIcon, CheckIcon, ChevronRightIcon, ToolIcon } from "@/shared/icons";

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

function StateGlyph({ state }: { state: ToolEventRecord["state"] }) {
  if (state === "succeeded") return <CheckIcon />;
  if (state === "failed") return <AlertIcon />;
  return <ToolIcon />;
}

export function AgentThinkingBlock({ events }: { events?: ToolEventRecord[] }) {
  const [open, setOpen] = useState(false);
  const timelineId = useId();
  const summary = useMemo(() => (events && events.length > 0 ? collapsedSummary(events) : ""), [events]);

  if (!events || events.length === 0) return null;

  return (
    <div className="agent-thinking-block">
      <button
        type="button"
        className="agent-thinking-toggle"
        aria-expanded={open}
        aria-controls={timelineId}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRightIcon className="agent-thinking-chevron" />
        <span className="agent-thinking-summary">{summary}</span>
        <span className="agent-thinking-count">
          {events.length} step{events.length === 1 ? "" : "s"}
        </span>
      </button>
      <Disclosure open={open} id={timelineId}>
        <ol className="agent-thinking-timeline">
          {events.map((event) => (
            <li key={event.id} data-state={event.state}>
              <span className="agent-tool-icon" aria-hidden>
                <StateGlyph state={event.state} />
              </span>
              <div className="agent-tool-copy">
                <code className="agent-tool-badge">{event.tool}</code>
                {event.resultSummary ? <p className="agent-tool-result">{event.resultSummary}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </Disclosure>
    </div>
  );
}
