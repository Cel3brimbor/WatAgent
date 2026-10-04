"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { DotsVerticalIcon } from "@/shared/icons";
import { ContextMenu, menuStateFromElement, type ContextMenuItem, type ContextMenuState } from "@/shared/context-menu";
import { usePresence } from "@/shared/use-presence";
import { startOfLocalDay } from "@/calendar/date-utils";

const HISTORY_PAGE = 10;

type HistoryChatRow = {
  id: string;
  title: string;
  createdAt?: number;
  updatedAt?: number;
};

type DateBucket = "today" | "yesterday" | "previous7" | "older";

type Props = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  chats: HistoryChatRow[];
  renamingId: string | null;
  renameDraft: string;
  rowMenu: (ContextMenuState & { chatId: string }) | null;
  onClose: () => void;
  onRenameDraft: (value: string) => void;
  onCommitRename: (chatId: string) => void;
  onCancelRename: () => void;
  onReopen: (chatId: string) => void;
  onRowMenu: (state: (ContextMenuState & { chatId: string }) | null) => void;
  rowMenuItems: ContextMenuItem[];
};

const BUCKET_ORDER: DateBucket[] = ["today", "yesterday", "previous7", "older"];

const BUCKET_LABEL: Record<DateBucket, string> = {
  today: "Today",
  yesterday: "Yesterday",
  previous7: "Previous 7 days",
  older: "Older",
};

function bucketOf(createdAt: number, now = new Date()): DateBucket {
  const createdDay = startOfLocalDay(new Date(createdAt));
  const today = startOfLocalDay(now);
  const diffDays = Math.floor((today.getTime() - createdDay.getTime()) / 86_400_000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays <= 7) return "previous7";
  return "older";
}

function createdMeta(createdAt: number, bucket: DateBucket): string {
  const date = new Date(createdAt);
  if (bucket === "today" || bucket === "yesterday") {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  if (bucket === "previous7") {
    return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function isOutsideDismissTarget(target: Node, anchor: HTMLElement | null, panel: HTMLElement | null): boolean {
  if (anchor?.contains(target)) return false;
  if (panel?.contains(target)) return false;
  const el = target instanceof Element ? target : target.parentElement;
  if (el?.closest(".context-menu, .modal-backdrop")) return false;
  return true;
}

export function ChatHistoryPanel({
  open,
  anchorRef,
  chats,
  renamingId,
  renameDraft,
  rowMenu,
  onClose,
  onRenameDraft,
  onCommitRename,
  onCancelRename,
  onReopen,
  onRowMenu,
  rowMenuItems,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const presence = usePresence(open ? chats : null);
  const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE);

  const sortedChats = useMemo(
    () => [...presence.value ?? []].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
    [presence.value],
  );

  const visibleChats = sortedChats.slice(0, visibleCount);
  const hasMore = sortedChats.length > visibleCount;

  const sections = useMemo(() => {
    const grouped = new Map<DateBucket, HistoryChatRow[]>();
    for (const chat of visibleChats) {
      const bucket = bucketOf(chat.createdAt ?? chat.updatedAt ?? Date.now());
      const list = grouped.get(bucket) ?? [];
      list.push(chat);
      grouped.set(bucket, list);
    }
    return BUCKET_ORDER.filter((bucket) => grouped.has(bucket)).map((bucket) => ({
      bucket,
      label: BUCKET_LABEL[bucket],
      chats: grouped.get(bucket) ?? [],
    }));
  }, [visibleChats]);

  useEffect(() => {
    if (open) setVisibleCount(HISTORY_PAGE);
  }, [open]);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!open || !anchor || !panel) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(18 * 16, window.innerWidth - 16);
    let left = rect.right - width;
    let top = rect.bottom + 6;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    const height = panel.offsetHeight;
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 6);
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
    panel.style.width = `${width}px`;
    panel.style.transformOrigin = `${rect.right - left}px 0px`;
  }, [open, anchorRef, chats.length, renamingId, visibleCount]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onPointerDown(event: PointerEvent) {
      if (!isOutsideDismissTarget(event.target as Node, anchorRef.current, panelRef.current)) return;
      onClose();
    }
    window.addEventListener("keydown", onKey);
    const timer = window.setTimeout(() => {
      window.addEventListener("pointerdown", onPointerDown, true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, onClose, anchorRef]);

  if (typeof document === "undefined") return null;
  if (!open && !rowMenu) return null;

  return createPortal(
    <>
      {presence.value ? (
        <div
          ref={panelRef}
          className="chat-history-panel"
          role="dialog"
          aria-label="Closed chats"
          data-state={presence.open ? "open" : "closed"}
          inert={!presence.open}
        >
          <p className="chat-history-panel-head">Closed chats</p>
          {presence.value.length === 0 ? (
            <p className="chat-history-empty">No closed chats</p>
          ) : (
            <div className="chat-history-scroll">
              {sections.map((section) => (
                <section key={section.bucket} className="chat-history-section" aria-label={section.label}>
                  <p className="chat-history-section-label">{section.label}</p>
                  <ul className="chat-history-list">
                    {section.chats.map((chat) => {
                      const renaming = renamingId === chat.id;
                      const createdAt = chat.createdAt ?? chat.updatedAt ?? Date.now();
                      const bucket = bucketOf(createdAt);
                      return (
                        <li key={chat.id} className="chat-history-row">
                          {renaming ? (
                            <input
                              className="chat-history-rename"
                              value={renameDraft}
                              maxLength={200}
                              autoFocus
                              aria-label="Chat name"
                              onChange={(event) => onRenameDraft(event.target.value)}
                              onBlur={() => onCommitRename(chat.id)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") event.currentTarget.blur();
                                if (event.key === "Escape") onCancelRename();
                              }}
                            />
                          ) : (
                            <button
                              type="button"
                              className="chat-history-open"
                              title={chat.title}
                              onClick={() => onReopen(chat.id)}
                            >
                              <span className="chat-history-title">{chat.title}</span>
                              <span className="chat-history-meta">{createdMeta(createdAt, bucket)}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            className="chat-history-more"
                            aria-label={`${chat.title} options`}
                            aria-expanded={rowMenu?.chatId === chat.id}
                            aria-haspopup="menu"
                            onClick={(event) => {
                              event.stopPropagation();
                              onRowMenu({ ...menuStateFromElement(event.currentTarget), chatId: chat.id });
                            }}
                          >
                            <DotsVerticalIcon />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
              {hasMore ? (
                <button
                  type="button"
                  className="chat-history-show-more"
                  onClick={() => setVisibleCount((count) => count + HISTORY_PAGE)}
                >
                  Show 10 more
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
      <ContextMenu state={rowMenu} items={rowMenuItems} onClose={() => onRowMenu(null)} />
    </>,
    document.body,
  );
}
