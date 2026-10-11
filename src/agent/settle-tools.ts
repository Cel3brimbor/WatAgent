import type { ToolEventRecord } from "./types";

//a turn that already ended must not restore as a live call
export function settleCallingTools(
  events: ToolEventRecord[],
  outcome: "succeeded" | "failed",
  summary?: string,
): void {
  for (const event of events) {
    if (event.state !== "calling") continue;
    event.state = outcome;
    if (outcome === "failed" && summary && !event.resultSummary) event.resultSummary = summary;
  }
}
