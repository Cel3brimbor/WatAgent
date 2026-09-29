"use client";

import { useEffect, useRef, useState } from "react";
import { AgentThinkingBlock } from "@/agent/agent-thinking-block";
import { ChatBubbleTools } from "@/agent/bubble-tools";
import { ChatComposer } from "@/agent/chat-composer";
import { ChatTabStrip } from "@/agent/chat-tab-strip";
import { MessageContent } from "@/agent/message-content";
import type { ChatMessage, ChatSession, LiveActivity } from "@/agent/types";
import { CHAT_WIDTH_MAX, CHAT_WIDTH_MIN, useChatResize } from "@/agent/use-chat-resize";

type SendPayload = {
  text: string;
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
  liveActivity: LiveActivity | null;
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
};

export function CalendarChatPanel({
  open,
  chats,
  activeChat,
  messages,
  busy,
  error,
  streamingAssistantId,
  liveActivity,
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
}: Props) {
  const chatResize = useChatResize();
  const listRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  useEffect(() => {
    onResizingChange(chatResize.resizing);
  }, [chatResize.resizing, onResizingChange]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, activeChat?.id]);

  if (!open) return null;

  function submitEdit(messageId: string) {
    const next = editDraft.trim();
    if (!next || busy) return;
    setEditingId(null);
    onSend({ text: next, branch: { kind: "edit", messageId } });
  }

  return (
    <aside className="chat-panel" aria-label="Agent" style={{ width: chatResize.width }}>
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
      <section className="chat-messages" ref={listRef} aria-live="polite">
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
              const status = liveActivity?.assistantId === m.id && !m.content ? liveActivity.status : null;
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
                      <AgentThinkingBlock events={m.toolEvents} />
                      {status ? <p className="bubble-status">{status}</p> : null}
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
                              disabled={busy || !editDraft.trim()}
                              onClick={() => submitEdit(m.id)}
                            >
                              Update
                            </button>
                          </div>
                        </>
                      ) : (
                        <MessageContent content={m.content} pending={streaming && !m.content} />
                      )}
                    </div>
                  </article>
                  <div className="bubble-toolbar">
                    <ChatBubbleTools
                      role={m.role}
                      content={m.content}
                      busy={busy}
                      streaming={streaming}
                      onRegenerate={() => onSend({ text: "", branch: { kind: "regenerate", messageId: m.id } })}
                      onStartEdit={() => {
                        setEditingId(m.id);
                        setEditDraft(m.content);
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <ChatComposer
        busy={busy}
        error={error}
        onSend={onSend}
        onStop={onStop}
        onError={onError}
      />
    </aside>
  );
}
