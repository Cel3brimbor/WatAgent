import { attachedIdsOf } from "@/agent/calendar-mention";
import { CHAT_IMAGE_MEDIA, MAX_CHAT_IMAGE_B64, MAX_CHAT_IMAGE_TEXT, MAX_CHAT_IMAGES, type ChatImage } from "@/agent/chat-image";
import type { ActivityPart, ChatMessage, ChatSession } from "@/agent/types";
import { parseCalendarMeta, type CalendarItemDoc } from "@/calendar/types";

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CHARS = 1_500_000;

export type ItemOp =
  | { kind: "upsert"; item: CalendarItemDoc; localOnly: boolean }
  | { kind: "delete"; id: string };

type ItemJournal = { items: CalendarItemDoc[]; ops: ItemOp[] };
type ChatJournal = { chats: ChatSession[]; serverIds: string[]; dirty: string[]; deleted: string[] };

function itemsKey(userId: string): string {
  return `watagent.local.items.v1.${userId}`;
}

function chatsKey(userId: string): string {
  return `watagent.local.chats.v1.${userId}`;
}

function storage(): Storage | null {
  try {
    if (typeof globalThis.localStorage?.getItem !== "function") return null;
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function ready(userId: string): boolean {
  return storage() != null && USER_ID.test(userId);
}

function itemOf(raw: unknown): CalendarItemDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string" || !rec.id || rec.id.length > 128) return null;
  const calendar = parseCalendarMeta(rec.calendar);
  if (!calendar) return null;
  const title = typeof rec.title === "string" ? rec.title.slice(0, 200) : "";
  return {
    id: rec.id,
    title: title || (calendar.kind === "task" ? "Task" : "Event"),
    calendar,
    createdAt: Number(rec.createdAt) || Date.now(),
    updatedAt: Number(rec.updatedAt) || Date.now(),
  };
}

function messageOf(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string" || !rec.id || rec.id.length > 128) return null;
  if (rec.role !== "user" && rec.role !== "assistant") return null;
  if (typeof rec.content !== "string") return null;
  const images: ChatImage[] = [];
  if (Array.isArray(rec.images)) {
    for (const image of rec.images) {
      if (!image || typeof image !== "object") continue;
      const row = image as Record<string, unknown>;
      if (typeof row.mediaType !== "string" || !CHAT_IMAGE_MEDIA.includes(row.mediaType as ChatImage["mediaType"])) continue;
      if (typeof row.data !== "string" || row.data.length > MAX_CHAT_IMAGE_B64) continue;
      images.push({ mediaType: row.mediaType as ChatImage["mediaType"], data: row.data });
      if (images.length >= MAX_CHAT_IMAGES) break;
    }
  }
  return {
    id: rec.id,
    role: rec.role,
    content: rec.content.slice(0, 20_000),
    createdAt: Number(rec.createdAt) || undefined,
    calendarIds:
      rec.role === "user" && Array.isArray(rec.calendarIds)
        ? attachedIdsOf(rec.calendarIds.filter((id): id is string => typeof id === "string"))
        : undefined,
    activity:
      rec.role === "assistant" && Array.isArray(rec.activity)
        ? (rec.activity.filter((part) => part && typeof part === "object").slice(0, 40) as ActivityPart[])
        : undefined,
    images: images.length > 0 ? images : undefined,
    imageText: typeof rec.imageText === "string" ? rec.imageText.slice(0, MAX_CHAT_IMAGE_TEXT) : undefined,
  };
}

function chatOf(raw: unknown): ChatSession | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string" || !rec.id || rec.id.length > 128) return null;
  const messages = Array.isArray(rec.messages)
    ? rec.messages.map(messageOf).filter((message): message is ChatMessage => message != null).slice(0, 200)
    : [];
  return {
    id: rec.id,
    title: typeof rec.title === "string" && rec.title.trim() ? rec.title.slice(0, 200) : "Chat",
    titleSource: rec.titleSource === "user" ? "user" : "auto",
    messages,
    createdAt: Number(rec.createdAt) || Date.now(),
    updatedAt: Number(rec.updatedAt) || Date.now(),
    open: rec.open === true,
    pinned: rec.pinned === true,
  };
}

function readRaw(key: string): unknown {
  const box = storage();
  if (!box) return null;
  try {
    const raw = box.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: unknown): boolean {
  const box = storage();
  if (!box) return false;
  const text = JSON.stringify(value);
  if (text.length > MAX_CHARS) return false;
  try {
    box.setItem(key, text);
    return true;
  } catch {
    return false;
  }
}

function applyItems(items: CalendarItemDoc[], ops: ItemOp[]): CalendarItemDoc[] {
  const map = new Map(items.map((item) => [item.id, item]));
  for (const op of ops) {
    if (op.kind === "delete") map.delete(op.id);
    else map.set(op.item.id, op.item);
  }
  return [...map.values()];
}

function readItems(userId: string): ItemJournal | null {
  if (!ready(userId)) return null;
  const raw = readRaw(itemsKey(userId));
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const items = Array.isArray(rec.items) ? rec.items.map(itemOf).filter((item): item is CalendarItemDoc => item != null) : [];
  const ops: ItemOp[] = [];
  if (Array.isArray(rec.ops)) {
    for (const op of rec.ops) {
      if (!op || typeof op !== "object") continue;
      const row = op as Record<string, unknown>;
      if (row.kind === "delete" && typeof row.id === "string") ops.push({ kind: "delete", id: row.id });
      if (row.kind === "upsert") {
        const item = itemOf(row.item);
        if (item) ops.push({ kind: "upsert", item, localOnly: row.localOnly === true });
      }
    }
  }
  return { items, ops };
}

function shrinkItems(journal: ItemJournal): ItemJournal {
  const pending = new Set(
    journal.ops.map((op) => (op.kind === "delete" ? op.id : op.item.id)),
  );
  const items = journal.items.filter((item) => pending.has(item.id) || !item.calendar.importSource);
  return { items, ops: journal.ops };
}

function writeItems(userId: string, journal: ItemJournal): boolean {
  const key = itemsKey(userId);
  if (writeRaw(key, journal)) return true;
  return writeRaw(key, shrinkItems(journal));
}

function opId(op: ItemOp): string {
  return op.kind === "delete" ? op.id : op.item.id;
}

export function localItems(userId: string): CalendarItemDoc[] | null {
  const journal = readItems(userId);
  if (!journal) return null;
  return applyItems(journal.items, journal.ops);
}

export function mergeServerItems(userId: string, server: CalendarItemDoc[]): CalendarItemDoc[] {
  const current = readItems(userId);
  const ids = new Set(server.map((item) => item.id));
  const ops = (current?.ops ?? []).filter((op) => op.kind === "upsert" || ids.has(op.id));
  const journal = { items: server, ops };
  writeItems(userId, journal);
  return applyItems(server, ops);
}

export function noteLocalItemUpsert(userId: string, item: CalendarItemDoc): boolean {
  const journal = readItems(userId) ?? { items: [], ops: [] };
  const prior = journal.ops.find((op) => op.kind === "upsert" && op.item.id === item.id);
  const deleted = journal.ops.some((op) => op.kind === "delete" && op.id === item.id);
  const onServer = journal.items.some((row) => row.id === item.id);
  const localOnly = deleted ? false : prior?.kind === "upsert" ? prior.localOnly : !onServer;
  journal.ops = journal.ops.filter((op) => opId(op) !== item.id);
  journal.ops.push({ kind: "upsert", item, localOnly });
  return writeItems(userId, journal);
}

export function noteLocalItemDelete(userId: string, id: string): boolean {
  const journal = readItems(userId) ?? { items: [], ops: [] };
  const prior = journal.ops.find((op) => op.kind === "upsert" && op.item.id === id);
  const onServer = journal.items.some((row) => row.id === id);
  const localOnly = prior?.kind === "upsert" ? prior.localOnly : !onServer;
  journal.ops = journal.ops.filter((op) => opId(op) !== id);
  if (!localOnly) journal.ops.push({ kind: "delete", id });
  return writeItems(userId, journal);
}

export function pendingItemOps(userId: string): ItemOp[] {
  return readItems(userId)?.ops ?? [];
}

export function ackItemOp(userId: string, id: string): void {
  const journal = readItems(userId);
  if (!journal) return;
  journal.ops = journal.ops.filter((op) => opId(op) !== id);
  writeItems(userId, journal);
}

function readChats(userId: string): ChatJournal | null {
  if (!ready(userId)) return null;
  const raw = readRaw(chatsKey(userId));
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const ids = (value: unknown) =>
    Array.isArray(value) ? value.filter((id): id is string => typeof id === "string").slice(0, 500) : [];
  return {
    chats: Array.isArray(rec.chats) ? rec.chats.map(chatOf).filter((chat): chat is ChatSession => chat != null) : [],
    serverIds: ids(rec.serverIds),
    dirty: ids(rec.dirty),
    deleted: ids(rec.deleted),
  };
}

function writeChats(userId: string, journal: ChatJournal): boolean {
  const key = chatsKey(userId);
  if (writeRaw(key, journal)) return true;
  const lighter = {
    ...journal,
    chats: journal.chats.map((chat) => ({
      ...chat,
      messages: chat.messages.map((message) => ({ ...message, images: undefined, imageText: undefined })),
    })),
  };
  return writeRaw(key, lighter);
}

export function localChats(userId: string): ChatSession[] | null {
  const journal = readChats(userId);
  if (!journal) return null;
  return journal.chats;
}

export function mergeServerChats(userId: string, server: ChatSession[]): ChatSession[] {
  const current = readChats(userId) ?? { chats: [], serverIds: [], dirty: [], deleted: [] };
  const dirty = new Set(current.dirty);
  const deleted = new Set(current.deleted);
  const localById = new Map(current.chats.map((chat) => [chat.id, chat]));
  const merged: ChatSession[] = [];
  const seen = new Set<string>();
  for (const chat of server) {
    if (deleted.has(chat.id)) continue;
    seen.add(chat.id);
    merged.push(dirty.has(chat.id) && localById.get(chat.id) ? localById.get(chat.id)! : chat);
  }
  for (const id of current.dirty) {
    if (seen.has(id) || deleted.has(id)) continue;
    const chat = localById.get(id);
    if (chat) merged.push(chat);
  }
  writeChats(userId, {
    chats: merged,
    serverIds: server.map((chat) => chat.id),
    dirty: current.dirty,
    deleted: current.deleted,
  });
  return merged;
}

export function noteLocalChat(userId: string, chat: ChatSession): boolean {
  const journal = readChats(userId) ?? { chats: [], serverIds: [], dirty: [], deleted: [] };
  const stored = chatOf(chat) ?? chat;
  journal.chats = [stored, ...journal.chats.filter((row) => row.id !== chat.id)].slice(0, 200);
  journal.dirty = [chat.id, ...journal.dirty.filter((id) => id !== chat.id)].slice(0, 200);
  journal.deleted = journal.deleted.filter((id) => id !== chat.id);
  return writeChats(userId, journal);
}

export function noteLocalChatDelete(userId: string, id: string): boolean {
  const journal = readChats(userId) ?? { chats: [], serverIds: [], dirty: [], deleted: [] };
  const onServer = journal.serverIds.includes(id);
  journal.chats = journal.chats.filter((chat) => chat.id !== id);
  journal.dirty = journal.dirty.filter((chatId) => chatId !== id);
  if (onServer) journal.deleted = [id, ...journal.deleted.filter((chatId) => chatId !== id)].slice(0, 200);
  return writeChats(userId, journal);
}

export function dirtyChats(userId: string): ChatSession[] {
  const journal = readChats(userId);
  if (!journal) return [];
  const dirty = new Set(journal.dirty);
  return journal.chats.filter((chat) => dirty.has(chat.id));
}

export function deletedChatIds(userId: string): string[] {
  return readChats(userId)?.deleted ?? [];
}

export function ackLocalChat(userId: string, id: string): void {
  const journal = readChats(userId);
  if (!journal) return;
  journal.dirty = journal.dirty.filter((chatId) => chatId !== id);
  if (!journal.serverIds.includes(id)) journal.serverIds.push(id);
  writeChats(userId, journal);
}

export function ackChatDelete(userId: string, id: string): void {
  const journal = readChats(userId);
  if (!journal) return;
  journal.deleted = journal.deleted.filter((chatId) => chatId !== id);
  journal.serverIds = journal.serverIds.filter((chatId) => chatId !== id);
  writeChats(userId, journal);
}

export function hasLocalPending(userId: string): boolean {
  const items = readItems(userId);
  const chats = readChats(userId);
  return Boolean(items?.ops.length || chats?.dirty.length || chats?.deleted.length);
}
