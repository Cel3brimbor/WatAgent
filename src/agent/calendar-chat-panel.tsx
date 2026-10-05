"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { AgentEffort } from "@/agent/agent-effort";
import { useAgentEffort } from "@/agent/use-agent-effort";
import { AgentActivity } from "@/agent/agent-activity";
import { ChatBubbleTools } from "@/agent/bubble-tools";
import { CalendarBadge } from "@/agent/calendar-badge";
import { messagePieces, type MentionCalendar } from "@/agent/calendar-mention";
import { ChatComposer } from "@/agent/chat-composer";
import { MentionField, type MentionFieldHandle } from "@/agent/mention-field";
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
  restriction: { message: string; reason: string | null } | null;
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
  restriction,
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
  const editRef = useRef<MentionFieldHandle>(null);
  const [openBadge, setOpenBadge] = useState<string | null>(null);
  const { effort, setEffort } = useAgentEffort();

  useEffect(() => {
    if (restriction) setEditingId(null);
  }, [restriction]);

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
        name:
          id === "tasks" ? "Tasks" : id === "events" ? "Agent Main" : id === "google" ? "Google Calendar" : "Calendar",
        kind: id === "tasks" ? "task" : "event",
        color: "#5b8a72",
        readOnly: id === "google" || id.startsWith("ics:") || id.startsWith("merge-"),
      }
    );
  }

  function submitEdit(messageId: string) {
    const payload = editRef.current?.read();
    const next = payload?.text.trim() ?? "";
    const calendarIds = payload?.calendarIds ?? [];
    if (busy || (!next && calendarIds.length === 0)) return;
    setEditingId(null);
    setOpenBadge(null);
    send({ text: next, calendarIds, branch: { kind: "edit", messageId } });
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
            restricted={Boolean(restriction)}
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
                        {editing ? (
                          <>
                            <MentionField
                              key={m.id}
                              ref={editRef}
                              className="bubble-edit"
                              calendars={calendars}
                              items={items}
                              ariaLabel="Edit message"
                              initialText={m.content}
                              initialCalendarIds={m.calendarIds}
                              openCalendarId={openBadge?.startsWith(`edit:${m.id}:`) ? openBadge.slice(`edit:${m.id}:`.length) : null}
                              onOpenCalendar={(id) => setOpenBadge(id ? `edit:${m.id}:${id}` : null)}
                              onEnter={() => submitEdit(m.id)}
                              onEscape={() => setEditingId(null)}
                            />
                            <div className="bubble-edit-actions">
                              <button type="button" className="ghost-btn" onClick={() => setEditingId(null)}>
                                Cancel
                              </button>
                              <button type="button" className="primary-btn" disabled={busy} onClick={() => submitEdit(m.id)}>
                                Update
                              </button>
                            </div>
                          </>
                        ) : m.role === "user" ? (
                          <UserMessage
                            content={m.content}
                            calendarIds={m.calendarIds}
                            calendarOf={calendarOf}
                            items={items}
                            openBadge={openBadge}
                            messageId={m.id}
                            onOpenBadge={setOpenBadge}
                            onEditItem={onEditCalendarItem}
                          />
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
                        locked={Boolean(restriction)}
                        onRegenerate={() => send({ text: "", branch: { kind: "regenerate", messageId: m.id } })}
                        onStartEdit={() => {
                          setOpenBadge(null);
                          setEditingId(m.id);
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
        {restriction ? (
          <div className="ai-restriction-stack">
            <p className="ai-restriction" role="alert">
              {restriction.message}
            </p>
            {restriction.reason ? <p className="ai-restriction">Restriction reason: {restriction.reason}</p> : null}
          </div>
        ) : null}
        <ChatComposer
          busy={busy}
          restricted={Boolean(restriction)}
          error={restriction ? null : error}
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

function UserMessage({
  content,
  calendarIds,
  calendarOf,
  items,
  openBadge,
  messageId,
  onOpenBadge,
  onEditItem,
}: {
  content: string;
  calendarIds?: string[];
  calendarOf: (id: string) => MentionCalendar;
  items: CalendarItemDoc[];
  openBadge: string | null;
  messageId: string;
  onOpenBadge: (id: string | null) => void;
  onEditItem?: (item: CalendarItemDoc) => void;
}) {
  const pieces = messagePieces(content, calendarIds).filter((piece) => piece.kind === "calendar" || piece.text.trim());
  if (pieces.length === 0) return null;
  const chips = pieces.some((piece) => piece.kind === "calendar");
  if (!chips) return <MessageContent content={content} />;
  return (
    <div className="bubble-flow">
      {pieces.map((piece, index) =>
        piece.kind === "calendar" ? (
          <CalendarBadge
            key={`${piece.id}:${index}`}
            calendar={calendarOf(piece.id)}
            items={items}
            open={openBadge === `${messageId}:${piece.id}`}
            onOpenChange={(next) => onOpenBadge(next ? `${messageId}:${piece.id}` : null)}
            onEditItem={onEditItem}
          />
        ) : (
          <span key={index} className="bubble-text">
            {piece.text}
          </span>
        ),
      )}
    </div>
  );
}
