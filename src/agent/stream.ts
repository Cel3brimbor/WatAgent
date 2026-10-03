import { parseCalendarMeta, type CalendarItemMeta } from "@/calendar/types";
import type { ToolEventState } from "@/agent/types";

export type CalendarChange = {
  action: "upsert" | "delete";
  id: string;
  title?: string;
  calendar?: CalendarItemMeta;
  pending?: boolean;
  pendingId?: string;
};

export type AgentStreamEvent =
  | { type: "content"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "reasoning-reset" }
  | { type: "content-reset" }
  | { type: "status"; label: string }
  | {
      type: "tool";
      name: string;
      state: ToolEventState;
      resultSummary?: string;
      callLabel?: string;
      calendarChange?: CalendarChange;
    };

const TOOL_STATES = new Set<ToolEventState>(["calling", "succeeded", "failed"]);

function calendarChangeOf(raw: unknown): CalendarChange | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as Record<string, unknown>;
  if (rec.action !== "upsert" && rec.action !== "delete") return undefined;
  if (typeof rec.id !== "string" || !rec.id || rec.id.length > 128) return undefined;
  return {
    action: rec.action,
    id: rec.id,
    title: typeof rec.title === "string" ? rec.title.slice(0, 200) : undefined,
    calendar: parseCalendarMeta(rec.calendar),
    pending: rec.pending === true,
    pendingId: typeof rec.pendingId === "string" ? rec.pendingId : undefined,
  };
}

function eventOf(raw: unknown): AgentStreamEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (rec.type === "content" && typeof rec.content === "string") {
    return { type: "content", content: rec.content };
  }
  if (rec.type === "reasoning" && typeof rec.content === "string" && rec.content) {
    return { type: "reasoning", content: rec.content.slice(0, 8_000) };
  }
  if (rec.type === "reasoning-reset") return { type: "reasoning-reset" };
  if (rec.type === "content-reset") return { type: "content-reset" };
  if (rec.type === "status" && typeof rec.label === "string") {
    return { type: "status", label: rec.label.slice(0, 120) };
  }
  if (
    rec.type === "tool" &&
    typeof rec.name === "string" &&
    TOOL_STATES.has(rec.state as ToolEventState)
  ) {
    return {
      type: "tool",
      name: rec.name.slice(0, 64),
      state: rec.state as ToolEventState,
      resultSummary: typeof rec.resultSummary === "string" ? rec.resultSummary.slice(0, 300) : undefined,
      callLabel: typeof rec.callLabel === "string" ? rec.callLabel.slice(0, 240) : undefined,
      calendarChange: calendarChangeOf(rec.calendarChange),
    };
  }
  return null;
}

export async function readAgentStream(
  response: Response,
  onEvent: (event: AgentStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response stream");
  const decoder = new TextDecoder();
  let buffer = "";

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (!data) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    const event = eventOf(parsed);
    if (event) onEvent(event);
  };

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    }
    buffer += decoder.decode();
    if (buffer) processLine(buffer);
  } finally {
    reader.releaseLock();
  }
}
