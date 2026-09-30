import { apiJson } from "@/shared/api-base";
import type { ChatMessage, ChatSession, ToolEventRecord } from "@/agent/types";

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const TOOL_NAME = /^[A-Za-z0-9_]{1,64}$/;
const MAX_TOOL_EVENTS = 40;

function toolEventOf(raw: unknown): ToolEventRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string" || !SAFE_ID.test(rec.id)) return null;
  if (typeof rec.tool !== "string" || !TOOL_NAME.test(rec.tool)) return null;
  if (rec.state !== "calling" && rec.state !== "succeeded" && rec.state !== "failed") return null;
  return {
    id: rec.id,
    tool: rec.tool,
    state: rec.state,
    callLabel: typeof rec.callLabel === "string" ? rec.callLabel.slice(0, 240) : undefined,
    resultSummary: typeof rec.resultSummary === "string" ? rec.resultSummary.slice(0, 500) : undefined,
  };
}

function toolEventsOf(raw: unknown): ToolEventRecord[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const events = raw.map(toolEventOf).filter((event): event is ToolEventRecord => event != null);
  return events.length > 0 ? events.slice(0, MAX_TOOL_EVENTS) : undefined;
}

function messageOf(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string" || !SAFE_ID.test(rec.id)) return null;
  if (rec.role !== "user" && rec.role !== "assistant") return null;
  if (typeof rec.content !== "string") return null;
  return {
    id: rec.id,
    role: rec.role,
    content: rec.content.slice(0, 20_000),
    createdAt: Number(rec.createdAt) || undefined,
    toolEvents: rec.role === "assistant" ? toolEventsOf(rec.toolEvents) : undefined,
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
    .filter((message) => message.content.trim().length > 0 || (message.toolEvents?.length ?? 0) > 0)
    .slice(-200)
    .map((message) => {
      const toolEvents = message.toolEvents?.slice(0, MAX_TOOL_EVENTS).map((event) => ({
        id: event.id,
        tool: event.tool.slice(0, 64),
        state: event.state,
        callLabel: event.callLabel?.slice(0, 240),
        resultSummary: event.resultSummary?.slice(0, 500),
      }));
      return {
        id: message.id,
        role: message.role,
        content: message.content.slice(0, 20_000),
        createdAt: message.createdAt,
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
