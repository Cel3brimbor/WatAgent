"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { newId } from "@/shared/ids";
import { parseCalendarMeta, type CalendarItemDoc, type CalendarItemMeta } from "@/calendar/types";
import { deleteCalendarItem, listCalendarItems, upsertCalendarItem } from "@/calendar/client";
import { syncGoogleCalendar } from "@/calendar/google-calendar-client";
import type { BusyBlock, OverlayEvent } from "@/calendar/timeline";
import type { CalendarChange } from "@/agent/stream";
import type { ChatMessage, ChatSession } from "@/agent/types";
import { createSaveQueue } from "@/agent/chat-save-queue";
import { deleteChatSession, loadChatSessions, saveChatSession } from "@/agent/snapshots-client";
import {
  approvePending,
  getCalendarSettings,
  listPendingChanges,
  rejectPending,
  setRequireAiApproval,
  type PendingAiChange,
} from "@/calendar/approval-client";
import {
  commitApprovedPendingChanges,
  mergePendingIntoItems,
  pendingChangesMatching,
} from "@/calendar/merge-pending";

type CalendarContextValue = {
  hydrated: boolean;
  loadError: string | null;
  items: CalendarItemDoc[];
  displayItems: CalendarItemDoc[];
  requireAiApproval: boolean;
  pendingChanges: PendingAiChange[];
  approvalBusy: boolean;
  setRequireAiApproval: (value: boolean) => Promise<void>;
  refreshPending: () => Promise<void>;
  approvePendingChanges: (input: { ids?: string[]; all?: boolean }) => Promise<void>;
  rejectPendingChanges: (input: { ids?: string[]; all?: boolean }) => Promise<void>;
  refresh: () => Promise<void>;
  /** Drop a feed's events now, and keep a refresh from putting them back until releaseImport. */
  hideImport: (source: string) => void;
  /** Show events already on this device, and keep them across refreshes until the server has that feed. */
  stageImport: (source: string, items: CalendarItemDoc[]) => void;
  /** The server list is the truth for this feed again. */
  releaseImport: (source: string) => void;
  syncFromGoogle: (range: {
    rangeStartUTC: number;
    rangeEndUTC: number;
  }) => Promise<{
    busyBlocks: BusyBlock[];
    overlayEvents: OverlayEvent[];
    calendars: Array<{ id: string; name: string; color?: string; group: "mine" | "other" }>;
    lastSyncedAt: number;
  }>;
  setAfterWrite: (listener: (() => void) | null) => void;
  upsert: (input: { id?: string; title: string; calendar: CalendarItemMeta }) => void;
  completeTask: (id: string, completed: boolean) => void;
  remove: (id: string) => void;
  /** Deletes many items a few at a time; resolves with how many could not be deleted. */
  removeMany: (ids: string[]) => Promise<number>;
  applyRemoteCalendarChange: (change: CalendarChange) => void;
  chats: ChatSession[];
  activeChat: ChatSession | null;
  activeChatRef: () => ChatSession | null;
  createChat: () => void;
  selectChat: (chatId: string) => void;
  renameChat: (chatId: string, title: string) => void;
  closeChat: (chatId: string) => void;
  reopenChat: (chatId: string) => void;
  deleteChat: (chatId: string) => void;
  reorderChats: (orderedIds: string[]) => void;
  applyAutoTitle: (chatId: string, title: string) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  persistActiveChat: () => void;
  pruneEmptyChats: () => void;
};

type ChatState = { chats: ChatSession[]; activeChatId: string | null };

const CalendarContext = createContext<CalendarContextValue | null>(null);

function sortItems(items: CalendarItemDoc[]): CalendarItemDoc[] {
  return [...items].sort((a, b) => a.calendar.startUTC - b.calendar.startUTC);
}

function emptyChat(): ChatSession {
  const now = Date.now();
  return {
    id: newId(),
    title: "New chat",
    titleSource: "auto",
    messages: [],
    createdAt: now,
    updatedAt: now,
    open: true,
  };
}

function pickActive(state: ChatState): ChatSession | null {
  if (state.activeChatId) {
    const current = state.chats.find((chat) => chat.id === state.activeChatId);
    if (current && current.open) return current;
  }
  return state.chats.find((chat) => chat.open) ?? null;
}

function logFailure(label: string) {
  return () => console.error(`[calendar] ${label} failed`);
}

export function CalendarProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CalendarItemDoc[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chatState, setChatState] = useState<ChatState>({ chats: [], activeChatId: null });
  const [requireAiApproval, setRequireAiApprovalState] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<PendingAiChange[]>([]);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const pendingChangesRef = useRef(pendingChanges);
  pendingChangesRef.current = pendingChanges;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  //feeds the screen changed before the server finished. refreshes honor these until releaseImport.
  const hiddenImports = useRef(new Set<string>());
  const stagedImports = useRef(new Map<string, CalendarItemDoc[]>());
  const withLocalImports = useCallback((loaded: CalendarItemDoc[]) => {
    const visible = loaded.filter((item) => !item.calendar.importSource || !hiddenImports.current.has(item.calendar.importSource));
    const present = new Set<string>();
    for (const item of visible) if (item.calendar.importSource) present.add(item.calendar.importSource);
    const extra: CalendarItemDoc[] = [];
    for (const [source, docs] of stagedImports.current) {
      if (hiddenImports.current.has(source) || present.has(source)) continue;
      extra.push(...docs);
    }
    return sortItems([...visible, ...extra]);
  }, []);
  //updated before react paints, so a save in the same turn reads the transcript just written
  const chatStateRef = useRef(chatState);
  const enqueueSave = useRef(createSaveQueue<ChatSession>((_chatId, snapshot) => saveChatSession(snapshot)));

  const updateChats = useCallback((patch: (state: ChatState) => ChatState) => {
    const next = patch(chatStateRef.current);
    chatStateRef.current = next;
    setChatState(next);
  }, []);

  const putItem = useCallback((item: CalendarItemDoc) => {
    setItems((prev) => sortItems([item, ...prev.filter((row) => row.id !== item.id)]));
  }, []);

  const dropItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((row) => row.id !== id));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const loaded = await listCalendarItems();
      setItems(withLocalImports(loaded));
      setLoadError(null);
    } catch {
      setLoadError("Unable to load your calendar.");
    }
  }, [withLocalImports]);

  const hideImport = useCallback((source: string) => {
    stagedImports.current.delete(source);
    hiddenImports.current.add(source);
    setItems((prev) => prev.filter((item) => item.calendar.importSource !== source));
  }, []);

  const stageImport = useCallback((source: string, docs: CalendarItemDoc[]) => {
    hiddenImports.current.delete(source);
    stagedImports.current.set(source, docs);
    setItems((prev) => withLocalImports(prev.filter((item) => item.calendar.importSource !== source)));
  }, [withLocalImports]);

  const releaseImport = useCallback((source: string) => {
    hiddenImports.current.delete(source);
    stagedImports.current.delete(source);
  }, []);

  const refreshPending = useCallback(async () => {
    try {
      setPendingChanges(await listPendingChanges());
    } catch {
      logFailure("pending load")();
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      const settings = await getCalendarSettings();
      setRequireAiApprovalState(settings.requireAiApproval);
    } catch {
      logFailure("settings load")();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.all([refresh(), refreshPending(), refreshSettings()]);
      try {
        const chats = await loadChatSessions();
        if (cancelled) return;
        const opened = chats.map((chat, index) => ({ ...chat, open: index === 0 }));
        updateChats(() => ({ chats: opened, activeChatId: opened[0]?.id ?? null }));
      } catch {
        logFailure("chat load")();
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, refreshPending, refreshSettings, updateChats]);

  const syncFromGoogle = useCallback(
    async (range: { rangeStartUTC: number; rangeEndUTC: number }) => {
      const result = await syncGoogleCalendar(range);
      if (result.items.length > 0 || result.deletedIds.length > 0) {
        const drop = new Set(result.deletedIds);
        setItems((prev) => {
          const byId = new Map(prev.filter((row) => !drop.has(row.id)).map((row) => [row.id, row]));
          for (const item of result.items) if (!drop.has(item.id)) byId.set(item.id, item);
          return sortItems([...byId.values()]);
        });
      }
      return {
        busyBlocks: result.busyBlocks,
        overlayEvents: result.overlayEvents,
        calendars: result.calendars,
        lastSyncedAt: result.lastSyncedAt,
      };
    },
    [],
  );

  const afterWriteRef = useRef<(() => void) | null>(null);
  const setAfterWrite = useCallback((listener: (() => void) | null) => {
    afterWriteRef.current = listener;
  }, []);
  const wrote = useCallback(() => {
    afterWriteRef.current?.();
  }, []);

  const upsert = useCallback(
    (input: { id?: string; title: string; calendar: CalendarItemMeta }) => {
      const id = input.id || newId();
      const title = input.title.trim() || (input.calendar.kind === "task" ? "Task" : "Event");
      const existing = itemsRef.current.find((row) => row.id === id);
      const now = Date.now();
      putItem({
        id,
        title,
        calendar: { ...input.calendar, googleEventId: existing?.calendar.googleEventId,
          icsImportId: existing?.calendar.icsImportId, importSource: existing?.calendar.importSource },
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      void upsertCalendarItem({
        id,
        title,
        calendar: input.calendar,
        createdAt: existing?.createdAt ?? now,
      })
        .then((saved) => {
          putItem(saved);
          wrote();
        })
        .catch(logFailure("save"));
    },
    [putItem, wrote],
  );

  const completeTask = useCallback(
    (id: string, completed: boolean) => {
      const current = itemsRef.current.find((row) => row.id === id);
      if (!current || current.calendar.kind !== "task") return;
      upsert({ id, title: current.title, calendar: { ...current.calendar, completed } });
    },
    [upsert],
  );

  const remove = useCallback(
    (id: string) => {
      dropItem(id);
      void deleteCalendarItem(id).then(wrote).catch(logFailure("delete"));
    },
    [dropItem, wrote],
  );

  const removeMany = useCallback(
    async (ids: string[]) => {
      const queue = [...ids];
      let failed = 0;
      const worker = async () => {
        for (let id = queue.shift(); id; id = queue.shift()) {
          try {
            await deleteCalendarItem(id);
            dropItem(id);
          } catch {
            failed += 1;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
      wrote();
      return failed;
    },
    [dropItem, wrote],
  );

  const applyRemoteCalendarChange = useCallback(
    (change: CalendarChange) => {
      if (change.pending) {
        void refreshPending();
        return;
      }
      if (change.action === "delete") {
        dropItem(change.id);
        wrote();
        return;
      }
      const calendar = parseCalendarMeta(change.calendar);
      if (!calendar) return;
      const existing = itemsRef.current.find((row) => row.id === change.id);
      const now = Date.now();
      putItem({
        id: change.id,
        title: change.title?.trim() || (calendar.kind === "task" ? "Task" : "Event"),
        calendar,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      wrote();
    },
    [dropItem, putItem, refreshPending, wrote],
  );

  const approvalWriteRef = useRef(0);
  const updateRequireAiApproval = useCallback(async (value: boolean) => {
    const write = ++approvalWriteRef.current;
    //move the switch immediately; the save round-trip was holding it for over a second
    setRequireAiApprovalState(value);
    try {
      await setRequireAiApproval(value);
    } catch (err) {
      if (approvalWriteRef.current === write) setRequireAiApprovalState(!value);
      throw err;
    }
  }, []);

  const approvePendingChanges = useCallback(
    async (input: { ids?: string[]; all?: boolean }) => {
      const approving = pendingChangesMatching(pendingChangesRef.current, input);
      if (approving.length === 0) return;
      const approvedIds = new Set(approving.map((change) => change.id));
      setPendingChanges((prev) => prev.filter((change) => !approvedIds.has(change.id)));
      setItems((prev) => commitApprovedPendingChanges(prev, approving));

      setApprovalBusy(true);
      try {
        await approvePending(input);
        wrote();
        void refresh().catch(logFailure("refresh"));
        void refreshPending().catch(logFailure("pending load"));
      } catch {
        await Promise.all([refresh(), refreshPending()]);
        throw new Error("approve failed");
      } finally {
        setApprovalBusy(false);
      }
    },
    [refresh, refreshPending, wrote],
  );

  const rejectPendingChanges = useCallback(
    async (input: { ids?: string[]; all?: boolean }) => {
      const rejecting = pendingChangesMatching(pendingChangesRef.current, input);
      if (rejecting.length === 0) return;
      const rejectedIds = new Set(rejecting.map((change) => change.id));
      setPendingChanges((prev) => prev.filter((change) => !rejectedIds.has(change.id)));

      setApprovalBusy(true);
      try {
        await rejectPending(input);
        void refreshPending().catch(logFailure("pending load"));
      } catch {
        await refreshPending();
        throw new Error("reject failed");
      } finally {
        setApprovalBusy(false);
      }
    },
    [refreshPending],
  );

  const displayItems = useMemo(
    () => mergePendingIntoItems(items, pendingChanges),
    [items, pendingChanges],
  );

  const persistChat = useCallback((chatId: string) => {
    const chat = chatStateRef.current.chats.find((row) => row.id === chatId);
    if (!chat) return;
    void enqueueSave.current(chatId, chat).catch(logFailure("chat save"));
  }, []);

  const createChat = useCallback(() => {
    const chat = emptyChat();
    updateChats((state) => ({ chats: [...state.chats, chat], activeChatId: chat.id }));
  }, [updateChats]);

  const selectChat = useCallback(
    (chatId: string) => {
      updateChats((state) =>
        state.chats.some((chat) => chat.id === chatId) ? { ...state, activeChatId: chatId } : state,
      );
    },
    [updateChats],
  );

  const renameChat = useCallback(
    (chatId: string, title: string) => {
      const next = title.trim().slice(0, 200) || "Untitled chat";
      updateChats((state) => ({
        ...state,
        chats: state.chats.map((chat) =>
          chat.id === chatId
            ? { ...chat, title: next, titleSource: "user" as const, updatedAt: Date.now() }
            : chat,
        ),
      }));
      persistChat(chatId);
    },
    [persistChat, updateChats],
  );

  const closeChat = useCallback(
    (chatId: string) => {
      updateChats((state) => {
        const target = state.chats.find((chat) => chat.id === chatId);
        const chats =
          target && target.messages.length === 0
            ? state.chats.filter((chat) => chat.id !== chatId)
            : state.chats.map((chat) => (chat.id === chatId ? { ...chat, open: false } : chat));
        const activeChatId =
          state.activeChatId === chatId
            ? (chats.find((chat) => chat.open)?.id ?? null)
            : state.activeChatId;
        return { chats, activeChatId };
      });
    },
    [updateChats],
  );

  const reopenChat = useCallback(
    (chatId: string) => {
      updateChats((state) => ({
        chats: state.chats.map((chat) => (chat.id === chatId ? { ...chat, open: true } : chat)),
        activeChatId: chatId,
      }));
    },
    [updateChats],
  );

  const deleteChat = useCallback(
    (chatId: string) => {
      void deleteChatSession(chatId).catch(logFailure("chat delete"));
      updateChats((state) => {
        const chats = state.chats.filter((chat) => chat.id !== chatId);
        return {
          chats,
          activeChatId:
            state.activeChatId === chatId
              ? (chats.find((chat) => chat.open)?.id ?? null)
              : state.activeChatId,
        };
      });
    },
    [updateChats],
  );

  const reorderChats = useCallback(
    (orderedIds: string[]) => {
      updateChats((state) => {
        const byId = new Map(state.chats.map((chat) => [chat.id, chat]));
        const ordered = orderedIds
          .map((id) => byId.get(id))
          .filter((chat): chat is ChatSession => Boolean(chat));
        const rest = state.chats.filter((chat) => !orderedIds.includes(chat.id));
        return { ...state, chats: [...ordered, ...rest] };
      });
    },
    [updateChats],
  );

  const applyAutoTitle = useCallback(
    (chatId: string, title: string) => {
      const next = title.trim().replace(/\s+/g, " ").slice(0, 40);
      if (next.length < 2) return;
      updateChats((state) => {
        let changed = false;
        const chats = state.chats.map((chat) => {
          if (chat.id !== chatId || chat.titleSource !== "auto" || chat.title === next) return chat;
          changed = true;
          return { ...chat, title: next, updatedAt: Date.now() };
        });
        if (!changed) return state;
        queueMicrotask(() => persistChat(chatId));
        return { ...state, chats };
      });
    },
    [persistChat, updateChats],
  );

  const setChatMessages = useCallback(
    (messages: ChatMessage[]) => {
      updateChats((state) => {
        let chats = state.chats;
        let target = pickActive(state);
        if (!target) {
          target = emptyChat();
          chats = [...chats, target];
        }
        const id = target.id;
        return {
          activeChatId: id,
          chats: chats.map((chat) => {
            if (chat.id !== id) return chat;
            return { ...chat, messages, updatedAt: Date.now() };
          }),
        };
      });
    },
    [updateChats],
  );

  const activeChatRef = useCallback(() => pickActive(chatStateRef.current), []);

  const persistActiveChat = useCallback(() => {
    const chat = pickActive(chatStateRef.current);
    if (chat) persistChat(chat.id);
  }, [persistChat]);

  const pruneEmptyChats = useCallback(() => {
    updateChats((state) => {
      const chats = state.chats.filter((chat) => chat.messages.some((m) => m.content.trim()));
      if (chats.length === state.chats.length) return state;
      const activeChatId =
        state.activeChatId && chats.some((chat) => chat.id === state.activeChatId)
          ? state.activeChatId
          : (chats.find((chat) => chat.open)?.id ?? null);
      return { chats, activeChatId };
    });
  }, [updateChats]);

  const activeChat = useMemo(() => pickActive(chatState), [chatState]);

  const value = useMemo<CalendarContextValue>(
    () => ({
      hydrated,
      loadError,
      items,
      displayItems,
      requireAiApproval,
      pendingChanges,
      approvalBusy,
      setRequireAiApproval: updateRequireAiApproval,
      refreshPending,
      approvePendingChanges,
      rejectPendingChanges,
      refresh,
      hideImport,
      stageImport,
      releaseImport,
      syncFromGoogle,
      setAfterWrite,
      upsert,
      completeTask,
      remove,
      removeMany,
      applyRemoteCalendarChange,
      chats: chatState.chats,
      activeChat,
      activeChatRef,
      createChat,
      selectChat,
      renameChat,
      closeChat,
      reopenChat,
      deleteChat,
      reorderChats,
      applyAutoTitle,
      setChatMessages,
      persistActiveChat,
      pruneEmptyChats,
    }),
    [
      hydrated,
      loadError,
      items,
      displayItems,
      requireAiApproval,
      pendingChanges,
      approvalBusy,
      updateRequireAiApproval,
      refreshPending,
      approvePendingChanges,
      rejectPendingChanges,
      refresh,
      hideImport,
      stageImport,
      releaseImport,
      syncFromGoogle,
      setAfterWrite,
      upsert,
      completeTask,
      remove,
      removeMany,
      applyRemoteCalendarChange,
      chatState.chats,
      activeChat,
      activeChatRef,
      createChat,
      selectChat,
      renameChat,
      closeChat,
      reopenChat,
      deleteChat,
      reorderChats,
      applyAutoTitle,
      setChatMessages,
      persistActiveChat,
      pruneEmptyChats,
    ],
  );

  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>;
}

export function useCalendar(): CalendarContextValue {
  const ctx = useContext(CalendarContext);
  if (!ctx) throw new Error("useCalendar must be used within CalendarProvider");
  return ctx;
}
