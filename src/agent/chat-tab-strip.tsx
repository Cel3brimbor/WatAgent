"use client";

import { useCallback, useRef, useState, type MouseEvent } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ContextMenu,
  menuStateFromElement,
  type ContextMenuItem,
  type ContextMenuState,
} from "@/shared/context-menu";
import { ConfirmDialog } from "@/shared/confirm-dialog";
import { CloseIcon, PlusIcon } from "@/shared/icons";
import { usePresence } from "@/shared/use-presence";

export type ChatTabSession = {
  id: string;
  title: string;
  open: boolean;
};

type Props = {
  chats: ChatTabSession[];
  activeChatId: string | null;
  onSelect: (chatId: string) => void;
  onNewChat: () => void;
  onRenameChat: (chatId: string, title: string) => void;
  onDeleteChat: (chatId: string) => void;
  onCloseTab: (chatId: string) => void;
  onReopenChat: (chatId: string) => void;
  onReorderChats: (orderedIds: string[]) => void;
  onStop: () => void;
};

export function ChatTabStrip({
  chats,
  activeChatId,
  onSelect,
  onNewChat,
  onRenameChat,
  onDeleteChat,
  onCloseTab,
  onReopenChat,
  onReorderChats,
  onStop,
}: Props) {
  const [historyMenu, setHistoryMenu] = useState<ContextMenuState>(null);
  const [tabMenu, setTabMenu] = useState<(ContextMenuState & { chatId: string }) | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ChatTabSession | null>(null);
  const deletePresence = usePresence(pendingDelete);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const skipRenameCommit = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const openChats = chats.filter((chat) => chat.open);
  const closedChats = chats.filter((chat) => !chat.open);
  const openIds = openChats.map((chat) => chat.id);

  const closeMenus = useCallback(() => {
    setHistoryMenu(null);
    setTabMenu(null);
  }, []);

  function startRename(chat: ChatTabSession) {
    setRenamingId(chat.id);
    setRenameDraft(chat.title);
  }

  function commitRename(chatId: string) {
    if (skipRenameCommit.current) {
      skipRenameCommit.current = false;
      setRenamingId(null);
      return;
    }
    const title = renameDraft.trim();
    setRenamingId(null);
    if (title) onRenameChat(chatId, title);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = openIds.indexOf(String(active.id));
    const to = openIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorderChats(arrayMove(openIds, from, to));
  }

  const tabMenuItems: ContextMenuItem[] = (() => {
    if (!tabMenu) return [];
    const chat = chats.find((item) => item.id === tabMenu.chatId);
    if (!chat) return [];
    return [
      { id: "rename", label: "Rename", onSelect: () => startRename(chat) },
      { id: "delete", label: "Delete", danger: true, onSelect: () => setPendingDelete(chat) },
    ];
  })();

  const historyItems: ContextMenuItem[] =
    closedChats.length === 0
      ? [{ id: "empty", label: "No closed chats", disabled: true, onSelect: () => undefined }]
      : closedChats.map((chat) => ({
          id: chat.id,
          label: chat.title,
          onSelect: () => {
            onStop();
            onReopenChat(chat.id);
          },
        }));

  return (
    <>
      <div className="chat-tabs-row">
        <div className="chat-tabs" role="tablist" aria-label="Chats">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={openIds} strategy={horizontalListSortingStrategy}>
              {openChats.map((chat) => (
                <SortableChatTab
                  key={chat.id}
                  chat={chat}
                  active={chat.id === activeChatId}
                  renaming={renamingId === chat.id}
                  renameDraft={renameDraft}
                  onRenameDraft={setRenameDraft}
                  onCommitRename={() => commitRename(chat.id)}
                  onCancelRename={() => {
                    skipRenameCommit.current = true;
                    setRenamingId(null);
                  }}
                  onSelect={() => {
                    if (chat.id === activeChatId) return;
                    onStop();
                    onSelect(chat.id);
                  }}
                  onClose={() => {
                    onStop();
                    onCloseTab(chat.id);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    closeMenus();
                    setTabMenu({ x: event.clientX, y: event.clientY, chatId: chat.id });
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>
          <button
            type="button"
            className="chat-tab-add"
            aria-label="New chat"
            title="New chat"
            onClick={() => {
              closeMenus();
              onStop();
              onNewChat();
            }}
          >
            <PlusIcon />
          </button>
        </div>
        <button
          type="button"
          className="chat-history"
          aria-label="Closed chats"
          title="Closed chats"
          onClick={(event) => {
            closeMenus();
            setHistoryMenu(menuStateFromElement(event.currentTarget));
          }}
        >
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
            <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M10 6.2V10l2.6 2.1"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <ContextMenu state={historyMenu} onClose={closeMenus} items={historyItems} />
      <ContextMenu state={tabMenu} onClose={closeMenus} items={tabMenuItems} />
      {deletePresence.value ? (
        <ConfirmDialog
          title={`Delete “${deletePresence.value.title}”?`}
          message="This cannot be undone."
          open={deletePresence.open}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const chat = pendingDelete;
            if (!chat) return;
            setPendingDelete(null);
            onStop();
            onDeleteChat(chat.id);
          }}
        />
      ) : null}
    </>
  );
}

function SortableChatTab({
  chat,
  active,
  renaming,
  renameDraft,
  onRenameDraft,
  onCommitRename,
  onCancelRename,
  onSelect,
  onClose,
  onContextMenu,
}: {
  chat: ChatTabSession;
  active: boolean;
  renaming: boolean;
  renameDraft: string;
  onRenameDraft: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onSelect: () => void;
  onClose: () => void;
  onContextMenu: (event: MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chat.id,
    disabled: renaming,
    transition: { duration: 320, easing: "cubic-bezier(0.25, 1, 0.5, 1)" },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`chat-tab${active ? " is-active" : ""}${isDragging ? " is-dragging" : ""}`}
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
    >
      {renaming ? (
        <input
          className="chat-tab-rename"
          value={renameDraft}
          maxLength={200}
          autoFocus
          aria-label="Chat name"
          onChange={(event) => onRenameDraft(event.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") onCancelRename();
          }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        />
      ) : (
        <button type="button" role="tab" aria-selected={active} title={chat.title} onClick={onSelect}>
          <span className="chat-tab-label">{chat.title}</span>
        </button>
      )}
      <button
        type="button"
        className="chat-tab-close"
        aria-label={`Close ${chat.title}`}
        title="Close"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
