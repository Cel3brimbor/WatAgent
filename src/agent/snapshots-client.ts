import { apiJson } from "@/shared/api-base";
import type { ChatMessage, ChatSession } from "@/agent/types";

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

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
    .filter((message) => message.content.trim().length > 0)
    .slice(-200)
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content.slice(0, 20_000),
      createdAt: message.createdAt,
    }));
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
