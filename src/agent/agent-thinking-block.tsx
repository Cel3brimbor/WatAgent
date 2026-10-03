"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ToolEventRecord } from "@/agent/types";
import { AlertIcon, CheckIcon, ChevronRightIcon, ToolIcon } from "@/shared/icons";
import { Disclosure } from "@/shared/disclosure";

const PROGRESS: Record<string, string> = {
  list_calendar_items: "Checking your calendar…",
  search_calendar_history: "Searching past events…",
  search_upcoming_events: "Searching upcoming events…",
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

function toolSummary(steps: ToolEventRecord[]): string {
  const live = steps.find((event) => event.state === "calling");
  if (live) return progressLabel(live);
  const failed = steps.find((event) => event.state === "failed");
  if (failed) return settledLabel(failed);
  return settledLabel(steps[steps.length - 1]);
}

function StateGlyph({ state }: { state: ToolEventRecord["state"] }) {
  if (state === "succeeded") return <CheckIcon />;
  if (state === "failed") return <AlertIcon />;
  return <ToolIcon />;
}

export function AgentThinkingBlock({ events, active = true }: { events?: ToolEventRecord[]; active?: boolean }) {
  const steps = events ?? [];
  const toolBusy = steps.some((event) => event.state === "calling");
  const [open, setOpen] = useState(true);
  const panelId = useId();
  const activeRef = useRef(active);

  useEffect(() => {
    if (toolBusy) setOpen(true);
    else if (activeRef.current && !active) setOpen(false);
    activeRef.current = active;
  }, [toolBusy, active]);

  if (steps.length === 0) return null;

  const summary = toolSummary(steps);
  const stepCount = steps.length;

  return (
    <div className="agent-thinking-block">
      <button
        type="button"
        className="agent-thinking-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRightIcon className="agent-thinking-chevron" />
        <span className="agent-thinking-summary">{summary}</span>
        {stepCount > 1 ? <span className="agent-thinking-count">{stepCount} steps</span> : null}
      </button>
      <Disclosure open={open} id={panelId}>
        <ol className="agent-thinking-timeline">
          {steps.map((event) => (
            <li key={event.id} data-state={event.state}>
              <span className="agent-tool-icon" aria-hidden>
                <StateGlyph state={event.state} />
              </span>
              <p className="agent-call-line">
                <span className={event.state === "calling" ? "agent-call-verb agent-activity-live" : "agent-call-verb"}>
                  {event.state === "calling" ? "calling" : event.state === "failed" ? "failed" : "called"}
                </span>
                <span className="agent-activity-detail">{event.callLabel || event.tool}</span>
              </p>
            </li>
          ))}
        </ol>
      </Disclosure>
    </div>
  );
}
