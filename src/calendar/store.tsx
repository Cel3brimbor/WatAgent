"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Context,
  type ReactNode,
} from "react";
import { newId } from "@/shared/ids";
import { parseCalendarMeta, type CalendarItemDoc, type CalendarItemMeta } from "@/calendar/types";
import { deleteCalendarItem, listCalendarItems, upsertCalendarItem } from "@/calendar/client";
import {
  ackChatDelete,
  ackItemOp,
  ackLocalChat,
  deletedChatIds,
  dirtyChats,
  hasLocalPending,
  localChats,
  localItems,
  mergeServerChats,
  mergeServerItems,
  noteLocalChat,
  noteLocalChatDelete,
  noteLocalItemDelete,
  noteLocalItemUpsert,
  pendingItemOps,
} from "@/calendar/local-journal";
import { isLockdownError } from "@/shared/api-base";
import { noteLockdown, readApiHealth, subscribeLockdown } from "@/shared/lockdown";
import { syncGoogleCalendar } from "@/calendar/google-calendar-client";
import type { CalendarChange } from "@/agent/stream";
import type { ChatMessage, ChatSession } from "@/agent/types";
import { createSaveQueue } from "@/agent/chat-save-queue";
import { deleteChatSession, loadChatSessions, saveChatPin, saveChatSession } from "@/agent/snapshots-client";
import {
  approvePending,
  getCalendarSettings,
  listPendingChanges,
  rejectPending,
  setRequireAiApproval,
  type PendingAiChange,
} from "@/calendar/approval-client";
import { commitApprovedPendingChanges, mergePendingIntoItems, pendingChangesMatching } from "@/calendar/merge-pending";
import {
  createEventStore,
  EventStoreProvider,
  useAllItems,
  type EventStore,
} from "@/calendar/event-store";

type NoticeListener = (message: string) => void;

type CalendarActions = {
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
  syncFromGoogle: (range: { rangeStartUTC: number; rangeEndUTC: number }) => Promise<{
    calendars: Array<{ id: string; name: string; color?: string; group: "mine" | "other" }>;
    lastSyncedAt: number;
  }>;
  setAfterWrite: (listener: (() => void) | null) => void;
  subscribeNotice: (listener: NoticeListener) => () => void;
  upsert: (input: { id?: string; title: string; calendar: CalendarItemMeta }) => void;
  completeTask: (id: string, completed: boolean) => void;
  remove: (id: string) => void;
  /** Deletes many items a few at a time; resolves with how many could not be deleted. */
  removeMany: (ids: string[]) => Promise<number>;
  applyRemoteCalendarChange: (change: CalendarChange) => void;
};

type CalendarStatus = {
  hydrated: boolean;
  loadError: string | null;
  requireAiApproval: boolean;
  pendingChanges: PendingAiChange[];
  approvalBusy: boolean;
};

type ChatActions = {
  activeChatRef: () => ChatSession | null;
  createChat: () => void;
  selectChat: (chatId: string) => void;
  renameChat: (chatId: string, title: string) => void;
  closeChat: (chatId: string) => void;
  reopenChat: (chatId: string) => void;
  deleteChat: (chatId: string) => void;
  reorderChats: (orderedIds: string[]) => void;
  setChatPinned: (chatId: string, pinned: boolean) => void;
  applyAutoTitle: (chatId: string, title: string) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  persistActiveChat: () => void;
  pruneEmptyChats: () => void;
};

type ChatStateValue = {
  chats: ChatSession[];
  activeChat: ChatSession | null;
};

type CalendarContextValue = CalendarStatus &
  CalendarActions &
  ChatActions &
  ChatStateValue & {
    items: CalendarItemDoc[];
    displayItems: CalendarItemDoc[];
  };

type ChatState = { chats: ChatSession[]; activeChatId: string | null };

const CalendarActionsContext = createContext<CalendarActions | null>(null);
const CalendarStatusContext = createContext<CalendarStatus | null>(null);
const ChatActionsContext = createContext<ChatActions | null>(null);
const ChatStateContext = createContext<ChatStateValue | null>(null);

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
    pinned: false,
  };
}

//pinned open tabs stay on the left. closed chats keep their order.
function preferOpenPinned(chats: ChatSession[]): ChatSession[] {
  const openPinned: ChatSession[] = [];
  const openRest: ChatSession[] = [];
  const closed: ChatSession[] = [];
  for (const chat of chats) {
    if (!chat.open) closed.push(chat);
    else if (chat.pinned) openPinned.push(chat);
    else openRest.push(chat);
  }
  return [...openPinned, ...openRest, ...closed];
}

function chatIsStored(chat: ChatSession): boolean {
  return chat.messages.some(
    (message) =>
      message.content.trim().length > 0 ||
      (message.calendarIds?.length ?? 0) > 0 ||
      (message.activity?.length ?? 0) > 0,
  );
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

function useRequiredContext<T>(context: Context<T | null>): T {
  const value = useContext(context);
  if (!value) throw new Error("useCalendar must be used within CalendarProvider");
  return value;
}

export function CalendarProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const storeRef = useRef<EventStore | null>(null);
  if (!storeRef.current) storeRef.current = createEventStore();
  const store = storeRef.current;
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chatState, setChatState] = useState<ChatState>({ chats: [], activeChatId: null });
  const [requireAiApproval, setRequireAiApprovalState] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<PendingAiChange[]>([]);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const pendingChangesRef = useRef(pendingChanges);
  pendingChangesRef.current = pendingChanges;
  const chatStateRef = useRef(chatState);
  const enqueueSave = useRef(
    createSaveQueue<ChatSession>((chatId, snapshot) => {
      const pinned = chatStateRef.current.chats.find((chat) => chat.id === chatId)?.pinned ?? snapshot.pinned;
      const chat = { ...snapshot, pinned };
      return saveChatSession(chat).then(
        () => {
          ackLocalChat(userId, chatId);
        },
        (err: unknown) => {
          if (!isLockdownError(err) || !noteLocalChat(userId, chat)) throw err;
          noteLockdown(true);
        },
      );
    }),
  );
  const noticeListeners = useRef(new Set<NoticeListener>());

  const raiseNotice = useCallback((message: string) => {
    for (const listener of noticeListeners.current) listener(message);
  }, []);

  const subscribeNotice = useCallback((listener: NoticeListener) => {
    noticeListeners.current.add(listener);
    return () => {
      noticeListeners.current.delete(listener);
    };
  }, []);

  const updateChats = useCallback((patch: (state: ChatState) => ChatState) => {
    const next = patch(chatStateRef.current);
    chatStateRef.current = next;
    setChatState(next);
  }, []);

  const commitPending = useCallback(
    (next: PendingAiChange[]) => {
      pendingChangesRef.current = next;
      setPendingChanges(next);
      store.setAiPending(next);
    },
    [store],
  );

  const refresh = useCallback(async () => {
    try {
      const loaded = await listCalendarItems();
      store.reconcileAll(mergeServerItems(userId, loaded));
      setLoadError(null);
    } catch (err: unknown) {
      if (isLockdownError(err)) {
        noteLockdown(true);
        const local = localItems(userId);
        if (local) store.reconcileAll(local);
        setLoadError(null);
        return;
      }
      setLoadError("Unable to load your calendar.");
    }
  }, [store, userId]);

  const hideImport = useCallback(
    (source: string) => {
      store.hideImport(source);
    },
    [store],
  );

  const stageImport = useCallback(
    (source: string, docs: CalendarItemDoc[]) => {
      store.stageImport(source, docs);
    },
    [store],
  );

  const releaseImport = useCallback(
    (source: string) => {
      store.releaseImport(source);
    },
    [store],
  );

  const refreshPending = useCallback(async () => {
    try {
      commitPending(await listPendingChanges());
    } catch {
      logFailure("pending load")();
    }
  }, [commitPending]);

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
        const chats = mergeServerChats(userId, await loadChatSessions());
        if (cancelled) return;
        //the list comes back pins first. open the chat that was actually touched last.
        let recentId: string | null = null;
        let recentAt = -1;
        for (const chat of chats) {
          if (chat.updatedAt >= recentAt) {
            recentAt = chat.updatedAt;
            recentId = chat.id;
          }
        }
        const opened = preferOpenPinned(chats.map((chat) => ({ ...chat, open: chat.id === recentId })));
        updateChats(() => ({ chats: opened, activeChatId: recentId }));
      } catch (err: unknown) {
        if (isLockdownError(err)) {
          noteLockdown(true);
          const local = localChats(userId);
          if (!cancelled && local && local.length > 0) {
            let recentId: string | null = null;
            let recentAt = -1;
            for (const chat of local) {
              if (chat.updatedAt >= recentAt) {
                recentAt = chat.updatedAt;
                recentId = chat.id;
              }
            }
            const opened = preferOpenPinned(local.map((chat) => ({ ...chat, open: chat.id === recentId })));
            updateChats(() => ({ chats: opened, activeChatId: recentId }));
          }
        } else logFailure("chat load")();
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, refreshPending, refreshSettings, updateChats, userId]);

  const flushing = useRef(false);
  const flushLocal = useCallback(async () => {
    if (flushing.current || !hasLocalPending(userId)) return;
    flushing.current = true;
    try {
      for (const op of pendingItemOps(userId)) {
        const id = op.kind === "delete" ? op.id : op.item.id;
        try {
          if (op.kind === "delete") await deleteCalendarItem(id);
          else {
            await upsertCalendarItem({
              id: op.item.id,
              title: op.item.title,
              calendar: op.item.calendar,
              createdAt: op.item.createdAt,
            });
          }
          ackItemOp(userId, id);
        } catch (err: unknown) {
          if (isLockdownError(err)) {
            noteLockdown(true);
            return;
          }
          raiseNotice("Some calendar changes saved on this device could not sync yet.");
          return;
        }
      }
      for (const id of deletedChatIds(userId)) {
        try {
          await deleteChatSession(id);
          ackChatDelete(userId, id);
        } catch (err: unknown) {
          if (isLockdownError(err)) {
            noteLockdown(true);
            return;
          }
          raiseNotice("Some chats saved on this device could not sync yet.");
          return;
        }
      }
      for (const chat of dirtyChats(userId)) {
        try {
          await saveChatSession(chat);
          ackLocalChat(userId, chat.id);
        } catch (err: unknown) {
          if (isLockdownError(err)) {
            noteLockdown(true);
            return;
          }
          raiseNotice("Some chats saved on this device could not sync yet.");
          return;
        }
      }
      await refresh();
      const remote = await loadChatSessions();
      const chats = mergeServerChats(userId, remote);
      updateChats((state) => {
        const openIds = new Set(state.chats.filter((chat) => chat.open).map((chat) => chat.id));
        return {
          ...state,
          chats: preferOpenPinned(
            chats.map((chat) => ({ ...chat, open: openIds.has(chat.id) || state.activeChatId === chat.id })),
          ),
        };
      });
    } catch (err: unknown) {
      if (isLockdownError(err)) noteLockdown(true);
      else logFailure("sync local changes")();
    } finally {
      flushing.current = false;
    }
  }, [raiseNotice, refresh, updateChats, userId]);

  useEffect(() => {
    let stop = false;
    const unsub = subscribeLockdown((locked) => {
      if (!locked && !stop) void flushLocal();
    });
    const look = () => {
      void readApiHealth().then((locked) => {
        if (stop || locked !== false || !hasLocalPending(userId)) return;
        void flushLocal();
      });
    };
    look();
    const timer = window.setInterval(look, 20_000);
    return () => {
      stop = true;
      unsub();
      window.clearInterval(timer);
    };
  }, [flushLocal, userId]);

  const syncFromGoogle = useCallback(
    async (range: { rangeStartUTC: number; rangeEndUTC: number }) => {
      const result = await syncGoogleCalendar(range);
      const drop = new Set(result.deletedIds);
      store.batch(() => {
        //purge google rows only inside this chunk so other weeks stay put
        store.reconcileGoogleRange(range, result.overlayEvents, result.busyBlocks);
        for (const id of result.deletedIds) {
          if (store.hasPendingWrite(id)) continue;
          store.applyRemove(id);
        }
        for (const item of result.items) {
          if (drop.has(item.id) || store.hasPendingWrite(item.id)) continue;
          store.applyUpsert(item);
        }
      });
      return {
        calendars: result.calendars,
        lastSyncedAt: result.lastSyncedAt,
      };
    },
    [store],
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
      const existing = store.getItem(id);
      const now = Date.now();
      const doc: CalendarItemDoc = {
        id,
        title,
        calendar: {
          ...input.calendar,
          googleEventId: existing?.calendar.googleEventId,
          icsImportId: existing?.calendar.icsImportId,
          importSource: existing?.calendar.importSource,
        },
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const seq = store.beginWrite(id, "upsert");
      //external store updates render sync; startTransition cannot defer them
      store.applyUpsert(doc);
      void upsertCalendarItem({
        id,
        title,
        calendar: input.calendar,
        createdAt: existing?.createdAt ?? now,
      })
        .then((saved) => {
          store.settleWrite(id, seq, saved);
          wrote();
        })
        .catch((err: unknown) => {
          if (isLockdownError(err) && noteLocalItemUpsert(userId, doc)) {
            noteLockdown(true);
            store.settleWrite(id, seq, doc);
            return;
          }
          console.error("[calendar] save failed", err);
          const note = store.rollbackWrite(id, seq);
          if (note) raiseNotice(note);
        });
    },
    [raiseNotice, store, userId, wrote],
  );

  const completeTask = useCallback(
    (id: string, completed: boolean) => {
      const current = store.getItem(id);
      if (!current || current.calendar.kind !== "task") return;
      upsert({ id, title: current.title, calendar: { ...current.calendar, completed } });
    },
    [store, upsert],
  );

  const remove = useCallback(
    (id: string) => {
      const seq = store.beginWrite(id, "remove");
      store.applyRemove(id);
      void deleteCalendarItem(id)
        .then(() => {
          store.settleWrite(id, seq, null);
          wrote();
        })
        .catch((err: unknown) => {
          if (isLockdownError(err) && noteLocalItemDelete(userId, id)) {
            noteLockdown(true);
            store.settleWrite(id, seq, null);
            return;
          }
          console.error("[calendar] delete failed", err);
          const note = store.rollbackWrite(id, seq);
          if (note) raiseNotice(note);
        });
    },
    [raiseNotice, store, userId, wrote],
  );

  const removeMany = useCallback(
    async (ids: string[]) => {
      const jobs: { id: string; seq: number }[] = [];
      store.batch(() => {
        for (const id of ids) {
          const seq = store.beginWrite(id, "remove");
          store.applyRemove(id);
          jobs.push({ id, seq });
        }
      });
      const queue = [...jobs];
      let failed = 0;
      const notes: string[] = [];
      const worker = async () => {
        for (let job = queue.shift(); job; job = queue.shift()) {
          try {
            await deleteCalendarItem(job.id);
            store.settleWrite(job.id, job.seq, null);
          } catch (err: unknown) {
            if (isLockdownError(err) && noteLocalItemDelete(userId, job.id)) {
              noteLockdown(true);
              store.settleWrite(job.id, job.seq, null);
              continue;
            }
            console.error("[calendar] delete failed", err);
            failed += 1;
            const note = store.rollbackWrite(job.id, job.seq);
            if (note) notes.push(note);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
      if (notes.length === 1) raiseNotice(notes[0]);
      else if (notes.length > 1) raiseNotice(`Couldn't delete ${notes.length} items. Those changes were undone.`);
      wrote();
      return failed;
    },
    [raiseNotice, store, userId, wrote],
  );

  const applyRemoteCalendarChange = useCallback(
    (change: CalendarChange) => {
      if (change.pending) {
        void refreshPending();
        return;
      }
      if (change.action === "delete") {
        store.applyRemove(change.id);
        wrote();
        return;
      }
      const calendar = parseCalendarMeta(change.calendar);
      if (!calendar) return;
      const existing = store.getItem(change.id);
      const now = Date.now();
      store.applyUpsert({
        id: change.id,
        title: change.title?.trim() || (calendar.kind === "task" ? "Task" : "Event"),
        calendar,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      wrote();
    },
    [refreshPending, store, wrote],
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
      const nextPending = pendingChangesRef.current.filter((change) => !approvedIds.has(change.id));
      const beforeIds = store.getAllItems().map((item) => item.id);
      const nextItems = commitApprovedPendingChanges(store.getAllItems(), approving);
      const nextIds = new Set(nextItems.map((item) => item.id));
      store.batch(() => {
        store.setAiPending(nextPending);
        for (const item of nextItems) store.applyUpsert(item);
        for (const id of beforeIds) if (!nextIds.has(id)) store.applyRemove(id);
      });
      pendingChangesRef.current = nextPending;
      setPendingChanges(nextPending);

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
    [refresh, refreshPending, store, wrote],
  );

  const rejectPendingChanges = useCallback(
    async (input: { ids?: string[]; all?: boolean }) => {
      const rejecting = pendingChangesMatching(pendingChangesRef.current, input);
      if (rejecting.length === 0) return;
      const rejectedIds = new Set(rejecting.map((change) => change.id));
      commitPending(pendingChangesRef.current.filter((change) => !rejectedIds.has(change.id)));

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
    [commitPending, refreshPending],
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
          state.activeChatId === chatId ? (chats.find((chat) => chat.open)?.id ?? null) : state.activeChatId;
        return { chats, activeChatId };
      });
    },
    [updateChats],
  );

  const reopenChat = useCallback(
    (chatId: string) => {
      updateChats((state) => ({
        chats: preferOpenPinned(state.chats.map((chat) => (chat.id === chatId ? { ...chat, open: true } : chat))),
        activeChatId: chatId,
      }));
    },
    [updateChats],
  );

  const deleteChat = useCallback(
    (chatId: string) => {
      void deleteChatSession(chatId).then(
        () => {
          ackChatDelete(userId, chatId);
        },
        (err: unknown) => {
          if (isLockdownError(err)) {
            noteLockdown(true);
            noteLocalChatDelete(userId, chatId);
            return;
          }
          logFailure("chat delete")();
        },
      );
      updateChats((state) => {
        const chats = state.chats.filter((chat) => chat.id !== chatId);
        return {
          chats,
          activeChatId:
            state.activeChatId === chatId ? (chats.find((chat) => chat.open)?.id ?? null) : state.activeChatId,
        };
      });
    },
    [updateChats, userId],
  );

  const reorderChats = useCallback(
    (orderedIds: string[]) => {
      updateChats((state) => {
        const byId = new Map(state.chats.map((chat) => [chat.id, chat]));
        const ordered = orderedIds.map((id) => byId.get(id)).filter((chat): chat is ChatSession => Boolean(chat));
        const rest = state.chats.filter((chat) => !orderedIds.includes(chat.id));
        return { ...state, chats: preferOpenPinned([...ordered, ...rest]) };
      });
    },
    [updateChats],
  );

  const setChatPinned = useCallback(
    (chatId: string, pinned: boolean) => {
      const previous = chatStateRef.current.chats.find((chat) => chat.id === chatId);
      if (!previous || previous.pinned === pinned) return;
      updateChats((state) => ({
        ...state,
        chats: preferOpenPinned(state.chats.map((chat) => (chat.id === chatId ? { ...chat, pinned } : chat))),
      }));
      //a brand new chat is not a row yet. the next message save carries the flag.
      if (!chatIsStored(previous)) return;
      void enqueueSave.current
        .after(chatId, async () => {
          const live = chatStateRef.current.chats.find((chat) => chat.id === chatId);
          if (!live || live.pinned !== pinned) return;
          try {
            await saveChatPin(chatId, pinned);
            ackLocalChat(userId, chatId);
          } catch (err: unknown) {
            if (isLockdownError(err)) {
              noteLockdown(true);
              const live = chatStateRef.current.chats.find((chat) => chat.id === chatId);
              if (live && noteLocalChat(userId, live)) return;
            }
            const current = chatStateRef.current.chats.find((chat) => chat.id === chatId);
            if (current?.pinned === pinned) {
              updateChats((state) => ({
                ...state,
                chats: preferOpenPinned(
                  state.chats.map((chat) => (chat.id === chatId ? { ...chat, pinned: !pinned } : chat)),
                ),
              }));
              raiseNotice(pinned ? "Couldn't pin that chat." : "Couldn't unpin that chat.");
            }
          }
        })
        .catch(logFailure("chat pin"));
    },
    [raiseNotice, updateChats, userId],
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

  const actions = useMemo<CalendarActions>(
    () => ({
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
      subscribeNotice,
      upsert,
      completeTask,
      remove,
      removeMany,
      applyRemoteCalendarChange,
    }),
    [
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
      subscribeNotice,
      upsert,
      completeTask,
      remove,
      removeMany,
      applyRemoteCalendarChange,
    ],
  );

  const status = useMemo<CalendarStatus>(
    () => ({ hydrated, loadError, requireAiApproval, pendingChanges, approvalBusy }),
    [hydrated, loadError, requireAiApproval, pendingChanges, approvalBusy],
  );

  const chatActions = useMemo<ChatActions>(
    () => ({
      activeChatRef,
      createChat,
      selectChat,
      renameChat,
      closeChat,
      reopenChat,
      deleteChat,
      reorderChats,
      setChatPinned,
      applyAutoTitle,
      setChatMessages,
      persistActiveChat,
      pruneEmptyChats,
    }),
    [
      activeChatRef,
      createChat,
      selectChat,
      renameChat,
      closeChat,
      reopenChat,
      deleteChat,
      reorderChats,
      setChatPinned,
      applyAutoTitle,
      setChatMessages,
      persistActiveChat,
      pruneEmptyChats,
    ],
  );

  const chatStateValue = useMemo<ChatStateValue>(
    () => ({ chats: chatState.chats, activeChat }),
    [chatState.chats, activeChat],
  );

  return (
    <EventStoreProvider store={store}>
      <CalendarActionsContext.Provider value={actions}>
        <CalendarStatusContext.Provider value={status}>
          <ChatActionsContext.Provider value={chatActions}>
            <ChatStateContext.Provider value={chatStateValue}>{children}</ChatStateContext.Provider>
          </ChatActionsContext.Provider>
        </CalendarStatusContext.Provider>
      </CalendarActionsContext.Provider>
    </EventStoreProvider>
  );
}

export function useCalendarActions(): CalendarActions {
  return useRequiredContext(CalendarActionsContext);
}

export function useCalendarStatus(): CalendarStatus {
  return useRequiredContext(CalendarStatusContext);
}

export function useChatActions(): ChatActions {
  return useRequiredContext(ChatActionsContext);
}

export function useChatState(): ChatStateValue {
  return useRequiredContext(ChatStateContext);
}

export function useCalendar(): CalendarContextValue {
  const actions = useCalendarActions();
  const status = useCalendarStatus();
  const chatActions = useChatActions();
  const chatState = useChatState();
  const items = useAllItems();
  const displayItems = useMemo(
    () => mergePendingIntoItems(items, status.pendingChanges),
    [items, status.pendingChanges],
  );
  return useMemo(
    () => ({ ...status, ...actions, ...chatState, ...chatActions, items, displayItems }),
    [status, actions, chatState, chatActions, items, displayItems],
  );
}
