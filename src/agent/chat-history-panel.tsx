"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { DotsVerticalIcon } from "@/shared/icons";
import { ContextMenu, menuStateFromElement, type ContextMenuItem, type ContextMenuState } from "@/shared/context-menu";
import { usePresence } from "@/shared/use-presence";

type HistoryChatRow = {
  id: string;
  title: string;
  updatedAt?: number;
};

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
  }, [open, anchorRef, chats.length, renamingId]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
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
            <ul className="chat-history-list">
              {presence.value.map((chat) => {
                const renaming = renamingId === chat.id;
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
                        {chat.title}
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
          )}
        </div>
      ) : null}
      <ContextMenu state={rowMenu} items={rowMenuItems} onClose={() => onRowMenu(null)} />
    </>,
    document.body,
  );
}
