"use client";

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";

export function createDraftTitleStore() {
  let title: string | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => title,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    set(next: string | null) {
      if (next === title) return;
      title = next;
      listeners.forEach(listener => listener());
    },
  };
}
const Context = createContext<ReturnType<typeof createDraftTitleStore> | null>(null);
const emptySubscribe = () => () => {};
const emptySnapshot = () => null;

export function DraftTitleProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createDraftTitleStore);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useDraftTitlePublisher() { return useContext(Context); }
export function DraftTitle({ fallback, placeholder = "New event" }: { fallback: string; placeholder?: string }) {
  const store = useContext(Context);
  const title = useSyncExternalStore(store?.subscribe ?? emptySubscribe, store?.getSnapshot ?? emptySnapshot, emptySnapshot);
  return <>{title == null ? fallback : title.trim() || placeholder}</>;
}
