"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { AgentEffort } from "@/agent/agent-effort";
import { useAgentEffort } from "@/agent/use-agent-effort";
import { AgentActivity } from "@/agent/agent-activity";
import { ChatBubbleTools } from "@/agent/bubble-tools";
import { CalendarBadge } from "@/agent/calendar-badge";
import type { MentionCalendar } from "@/agent/calendar-mention";
import { ChatComposer } from "@/agent/chat-composer";
import { ChatTabStrip } from "@/agent/chat-tab-strip";
import { MessageContent } from "@/agent/message-content";
import type { ChatMessage, ChatSession } from "@/agent/types";
import { CHAT_WIDTH_MAX, CHAT_WIDTH_MIN, useChatResize } from "@/agent/use-chat-resize";
import { useSheetDismiss } from "@/agent/use-sheet-dismiss";
import { AiApprovalPanel } from "@/calendar/ai-approval-panel";
import type { PendingAiChange } from "@/calendar/approval-client";
import type { CalendarItemDoc } from "@/calendar/types";
import { usePresence } from "@/shared/use-presence";

//matches the panel's width/sheet transition in globals.css
const PANEL_EXIT_MS = 320;

type SendPayload = {
  text: string;
  effort: AgentEffort;
  calendarIds?: string[];
  branch?: { kind: "edit"; messageId: string } | { kind: "regenerate"; messageId: string };
};

type Props = {
  open: boolean;
  chats: ChatSession[];
  activeChat: ChatSession | null;
  messages: ChatMessage[];
  busy: boolean;
  error: string | null;
  streamingAssistantId: string | null;
  onSend: (payload: SendPayload) => void;
  onStop: () => void;
  onError: (message: string | null) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  onRenameChat: (chatId: string, title: string) => void;
  onCloseChat: (chatId: string) => void;
  onReopenChat: (chatId: string) => void;
  onSelectChat: (chatId: string) => void;
  onReorderChats: (orderedIds: string[]) => void;
  onResizingChange: (resizing: boolean) => void;
  onClose: () => void;
  calendars: MentionCalendar[];
  items: CalendarItemDoc[];
  pendingChanges: PendingAiChange[];
  approvalBusy: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onApproveAll: () => void;
  onRejectAll: () => void;
  onInspectPending: (change: PendingAiChange) => void;
  onEditCalendarItem?: (item: CalendarItemDoc) => void;
  attachRequest?: { id: string; nonce: number } | null;
  ruleNames?: Record<string, string>;
};

export function CalendarChatPanel({
  open,
  chats,
  activeChat,
  messages,
  busy,
  error,
  streamingAssistantId,
  onSend,
  onStop,
  onError,
  onNewChat,
  onDeleteChat,
  onRenameChat,
  onCloseChat,
  onReopenChat,
  onSelectChat,
  onReorderChats,
  onResizingChange,
  onClose,
  calendars,
  items,
  pendingChanges,
  approvalBusy,
  onApprove,
  onReject,
  onApproveAll,
  onRejectAll,
  onInspectPending,
  onEditCalendarItem,
  attachRequest,
  ruleNames,
}: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const chatResize = useChatResize(panelRef);
  const presence = usePresence(open ? true : null, PANEL_EXIT_MS);
  const sheet = useSheetDismiss(panelRef, open, onClose);
  const listRef = useRef<HTMLDivElement>(null);
  //follow new output only while the reader is already at the bottom
  const pinnedRef = useRef(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editCalendars, setEditCalendars] = useState<string[]>([]);
  const [openBadge, setOpenBadge] = useState<string | null>(null);
  const { effort, setEffort } = useAgentEffort();

  useEffect(() => {
    onResizingChange(chatResize.resizing);
  }, [chatResize.resizing, onResizingChange]);

  useEffect(() => {
    pinnedRef.current = true;
  }, [activeChat?.id, open]);

  useEffect(() => {
    const el = listRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, busy, activeChat?.id, presence.value, pendingChanges.length]);

  if (!presence.value) return null;

  function send(payload: Omit<SendPayload, "effort">) {
    pinnedRef.current = true;
    onSend({ ...payload, effort });
  }

  function calendarOf(id: string): MentionCalendar {
    return (
      calendars.find((calendar) => calendar.id === id) ?? {
        id,
        name: id === "tasks" ? "Tasks" : id === "events" ? "Agent Main" : "Calendar",
        kind: id === "tasks" ? "task" : "event",
        color: "#5b8a72",
      }
    );
  }

  function submitEdit(messageId: string) {
    const next = editDraft.trim();
    if (busy || (!next && editCalendars.length === 0)) return;
    setEditingId(null);
    send({ text: next, calendarIds: editCalendars, branch: { kind: "edit", messageId } });
  }

  return (
    <aside
      ref={panelRef}
      className={`chat-panel${chatResize.live ? " is-live" : ""}`}
      aria-label="Agent"
      data-state={open ? "open" : "closed"}
      inert={!open}
      style={{ "--chat-w": `${chatResize.width}px` } as CSSProperties}
    >
      <div
        className="chat-resize-handle"
        role="separator"
        aria-label="Resize chat"
        aria-orientation="vertical"
        aria-valuemin={CHAT_WIDTH_MIN}
        aria-valuemax={CHAT_WIDTH_MAX}
        aria-valuenow={chatResize.width}
        tabIndex={0}
        onPointerDown={chatResize.onPointerDown}
        onPointerMove={chatResize.onPointerMove}
        onPointerUp={chatResize.onPointerUp}
        onPointerCancel={chatResize.onPointerCancel}
        onKeyDown={chatResize.onKeyDown}
        onDoubleClick={chatResize.reset}
      />
      <div className="chat-panel-inner">
        <div className="chat-grabber" aria-hidden="true" {...sheet}>
          <span />
        </div>
        <div className="chat-head">
          <ChatTabStrip
            chats={chats}
            activeChatId={activeChat?.id ?? null}
            onSelect={onSelectChat}
            onNewChat={onNewChat}
            onRenameChat={onRenameChat}
            onDeleteChat={onDeleteChat}
            onCloseTab={onCloseChat}
            onReopenChat={onReopenChat}
            onStop={onStop}
            onReorderChats={onReorderChats}
          />
          <div className="chat-head-row">
            <p>Ask about this day, or add, edit, delete, and complete events and tasks.</p>
            <button type="button" className="ghost-btn chat-close" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
        <section
          className="chat-messages"
          ref={listRef}
          aria-live="polite"
          onScroll={(event) => {
            const el = event.currentTarget;
            pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          }}
        >
          {messages.length === 0 ? (
            <div className="empty-state">
              <p>Chat about the focused day. The assistant can change your WatAgent events and tasks.</p>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((m) => {
                const streaming = streamingAssistantId === m.id;
                const editing = editingId === m.id;
                const latest = m.role === "assistant" && messages[messages.length - 1]?.id === m.id;
                return (
                  <div
                    key={m.id}
                    className={`bubble-row is-${m.role}${latest ? " is-latest" : ""}${editing ? " is-editing" : ""}`}
                  >
                    <article
                      className={`bubble bubble-${m.role}`}
                      data-empty={m.role === "assistant" && !m.content ? "true" : undefined}
                    >
                      <span className="bubble-role">{m.role === "user" ? "You" : "WatAgent"}</span>
                      <div className="bubble-body">
                        <AgentActivity parts={m.activity} streaming={streaming && !m.content.trim()} />
                        {m.role === "user" && (editing ? editCalendars : m.calendarIds)?.length ? (
                          <div className="bubble-badges">
                            {(editing ? editCalendars : (m.calendarIds ?? [])).map((id) => (
                              <CalendarBadge
                                key={id}
                                calendar={calendarOf(id)}
                                items={items}
                                open={openBadge === `${m.id}:${id}`}
                                onOpenChange={(next) => setOpenBadge(next ? `${m.id}:${id}` : null)}
                                onRemove={
                                  editing
                                    ? () => {
                                        setEditCalendars((list) => list.filter((row) => row !== id));
                                        setOpenBadge(null);
                                      }
                                    : undefined
                                }
                                onEditItem={editing ? undefined : onEditCalendarItem}
                              />
                            ))}
                          </div>
                        ) : null}
                        {editing ? (
                          <>
                            <textarea
                              className="bubble-edit"
                              value={editDraft}
                              maxLength={20_000}
                              aria-label="Edit message"
                              autoFocus
                              onChange={(event) => setEditDraft(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                                  event.preventDefault();
                                  submitEdit(m.id);
                                }
                                if (event.key === "Escape") setEditingId(null);
                              }}
                            />
                            <div className="bubble-edit-actions">
                              <button type="button" className="ghost-btn" onClick={() => setEditingId(null)}>
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="primary-btn"
                                disabled={busy || (!editDraft.trim() && editCalendars.length === 0)}
                                onClick={() => submitEdit(m.id)}
                              >
                                Update
                              </button>
                            </div>
                          </>
                        ) : (
                          <MessageContent content={m.content} />
                        )}
                      </div>
                    </article>
                    <div className="bubble-toolbar">
                      <ChatBubbleTools
                        role={m.role}
                        content={m.content}
                        busy={busy}
                        streaming={streaming}
                        onRegenerate={() => send({ text: "", branch: { kind: "regenerate", messageId: m.id } })}
                        onStartEdit={() => {
                          setEditingId(m.id);
                          setEditDraft(m.content);
                          setEditCalendars(m.calendarIds ?? []);
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        <AiApprovalPanel
          items={pendingChanges}
          busy={approvalBusy}
          onApprove={onApprove}
          onReject={onReject}
          onApproveAll={onApproveAll}
          onRejectAll={onRejectAll}
          onInspect={onInspectPending}
          ruleNames={ruleNames}
        />
        <ChatComposer
          busy={busy}
          error={error}
          effort={effort}
          calendars={calendars}
          items={items}
          openBadge={openBadge}
          onOpenBadge={setOpenBadge}
          onEffort={setEffort}
          onSend={send}
          onStop={onStop}
          onError={onError}
          onEditCalendarItem={onEditCalendarItem}
          attachRequest={attachRequest}
        />
      </div>
    </aside>
  );
}
