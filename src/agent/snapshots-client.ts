import { attachedIdsOf } from "@/agent/calendar-mention";
import type { ActivityPart, ChatMessage, ChatSession, ThoughtSegment, ToolEventRecord } from "@/agent/types";
import { apiJson } from "@/shared/api-base";

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const TOOL_NAME = /^[A-Za-z0-9_]{1,64}$/;
const MAX_TOOL_EVENTS = 40;
const MAX_ACTIVITY = 40;

function toolEventOf(raw: unknown): ToolEventRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string" || !SAFE_ID.test(rec.id)) return null;
  if (typeof rec.tool !== "string" || !TOOL_NAME.test(rec.tool)) return null;
  if (rec.state !== "calling" && rec.state !== "succeeded" && rec.state !== "failed") return null;
  //a saved "calling" step is from a turn that already ended. keep it from flashing after reopen.
  return {
    id: rec.id,
    tool: rec.tool,
    state: rec.state === "calling" ? "succeeded" : rec.state,
    callLabel: typeof rec.callLabel === "string" ? rec.callLabel.slice(0, 240) : undefined,
    resultSummary: typeof rec.resultSummary === "string" ? rec.resultSummary.slice(0, 500) : undefined,
  };
}

function toolEventsOf(raw: unknown): ToolEventRecord[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const events = raw.map(toolEventOf).filter((event): event is ToolEventRecord => event != null);
  return events.length > 0 ? events.slice(0, MAX_TOOL_EVENTS) : undefined;
}

function thoughtOf(raw: unknown, fallbackId: string): ThoughtSegment | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const id = typeof rec.id === "string" && SAFE_ID.test(rec.id) ? rec.id : fallbackId;
  if (typeof rec.text !== "string" || !rec.text.trim()) return null;
  const seconds = Number(rec.seconds);
  return {
    id,
    text: rec.text.slice(0, 16_000),
    startedAt: Number(rec.startedAt) || Date.now(),
    seconds: Number.isInteger(seconds) && seconds >= 1 && seconds <= 3_600 ? seconds : undefined,
  };
}

function activityOf(raw: unknown, messageId: string): ActivityPart[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const parts: ActivityPart[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (rec.kind === "thought") {
      const thought = thoughtOf(rec.thought, `${messageId}-thought`);
      if (thought) parts.push({ kind: "thought", thought });
    } else if (rec.kind === "tools") {
      const events = toolEventsOf(rec.events);
      if (events) parts.push({ kind: "tools", events });
    }
    if (parts.length >= MAX_ACTIVITY) break;
  }
  return parts.length > 0 ? parts : undefined;
}

function legacyActivity(messageId: string, reasoning: unknown, toolEvents: unknown, createdAt?: number): ActivityPart[] | undefined {
  const parts: ActivityPart[] = [];
  if (typeof reasoning === "string" && reasoning.trim()) {
    parts.push({
      kind: "thought",
      thought: {
        id: SAFE_ID.test(`${messageId}-thought`) ? `${messageId}-thought` : messageId,
        text: reasoning.slice(0, 16_000),
        startedAt: createdAt || Date.now(),
      },
    });
  }
  const events = toolEventsOf(toolEvents);
  if (events) parts.push({ kind: "tools", events });
  return parts.length > 0 ? parts : undefined;
}

function messageOf(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string" || !SAFE_ID.test(rec.id)) return null;
  if (rec.role !== "user" && rec.role !== "assistant") return null;
  if (typeof rec.content !== "string") return null;
  const createdAt = Number(rec.createdAt) || undefined;
  const calendarIds =
    rec.role === "user" && Array.isArray(rec.calendarIds)
      ? attachedIdsOf(rec.calendarIds.filter((id): id is string => typeof id === "string"))
      : undefined;
  return {
    id: rec.id,
    role: rec.role,
    content: rec.content.slice(0, 20_000),
    createdAt,
    calendarIds,
    activity:
      rec.role === "assistant"
        ? activityOf(rec.activity, rec.id) ?? legacyActivity(rec.id, rec.reasoning, rec.toolEvents, createdAt)
        : undefined,
  };
}

function sessionOf(raw: unknown): ChatSession | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string" || !SAFE_ID.test(rec.id)) return null;
  return {
    id: rec.id,
    title: typeof rec.title === "string" && rec.title.trim() ? rec.title.slice(0, 200) : "Chat",
    titleSource: rec.titleSource === "user" ? "user" : "auto",
    messages: Array.isArray(rec.messages)
      ? rec.messages.map(messageOf).filter((message): message is ChatMessage => message != null)
      : [],
    createdAt: Number(rec.createdAt) || Date.now(),
    updatedAt: Number(rec.updatedAt) || Date.now(),
    open: false,
  };
}

export async function loadChatSessions(): Promise<ChatSession[]> {
  const payload = await apiJson<{ chats?: unknown }>("/api/calendar/chats");
  if (!Array.isArray(payload.chats)) return [];
  return payload.chats.map(sessionOf).filter((chat): chat is ChatSession => chat != null);
}

export async function saveChatSession(chat: ChatSession): Promise<void> {
  const messages = chat.messages
    .filter(
      (message) =>
        message.content.trim().length > 0 ||
        (message.calendarIds?.length ?? 0) > 0 ||
        (message.activity?.length ?? 0) > 0,
    )
    .slice(-200)
    .map((message) => {
      const activity = message.activity
        ?.slice(0, MAX_ACTIVITY)
        .map((part) => {
          if (part.kind === "thought") {
            if (!part.thought.text.trim()) return null;
            const seconds =
              part.thought.seconds == null ? undefined : Math.min(3_600, Math.max(1, part.thought.seconds));
            return {
              kind: "thought" as const,
              thought: {
                id: part.thought.id,
                text: part.thought.text.slice(0, 16_000),
                seconds,
              },
            };
          }
          const events = part.events.slice(0, MAX_TOOL_EVENTS).map((event) => ({
            id: event.id,
            tool: event.tool.slice(0, 64),
            state: event.state,
            callLabel: event.callLabel?.slice(0, 240),
            resultSummary: event.resultSummary?.slice(0, 500),
          }));
          return events.length > 0 ? { kind: "tools" as const, events } : null;
        })
        .filter((part) => part != null);
      const toolEvents = activity
        ?.flatMap((part) => (part.kind === "tools" ? part.events : []))
        .slice(0, MAX_TOOL_EVENTS);
      return {
        id: message.id,
        role: message.role,
        content: message.content.slice(0, 20_000),
        createdAt: message.createdAt,
        calendarIds: message.role === "user" ? attachedIdsOf(message.calendarIds) : undefined,
        activity: message.role === "assistant" && activity?.length ? activity : undefined,
        toolEvents: message.role === "assistant" && toolEvents?.length ? toolEvents : undefined,
      };
    });
  if (messages.length === 0) return;
  await apiJson("/api/calendar/chats", {
    method: "POST",
    body: JSON.stringify({
      id: chat.id,
      title: chat.title.slice(0, 200),
      titleSource: chat.titleSource,
      messages,
      createdAt: chat.createdAt,
    }),
  });
}

export async function deleteChatSession(id: string): Promise<void> {
  await apiJson("/api/calendar/chats", { method: "DELETE", body: JSON.stringify({ id }) });
}
