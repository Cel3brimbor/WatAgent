"use client";

import { createContext, createElement, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { PendingAiChange } from "@/calendar/approval-client";
import type { CalendarItemDoc } from "@/calendar/types";
import { localDaysTouched, rangesOverlap, type BusyBlock, type OverlayEvent } from "@/calendar/timeline";

export type WriteOp = "upsert" | "remove";

export type PendingWrite = {
  base: CalendarItemDoc | null;
  seq: number;
  op: WriteOp;
};

export type SyncRange = { rangeStartUTC: number; rangeEndUTC: number };

export type DayBucket = {
  docs: CalendarItemDoc[];
  google: OverlayEvent[];
  busy: BusyBlock[];
  aiPending: PendingAiChange[];
};

const NO_DOCS: CalendarItemDoc[] = [];
const NO_GOOGLE: OverlayEvent[] = [];
const NO_BUSY: BusyBlock[] = [];
const NO_PENDING: PendingAiChange[] = [];
const EMPTY_BUCKET: DayBucket = { docs: NO_DOCS, google: NO_GOOGLE, busy: NO_BUSY, aiPending: NO_PENDING };
const NO_IDS: string[] = [];

type Listener = () => void;

function sameIdList(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function sameStrings(a: string[] | undefined, b: string[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

export function sameVisibleItem(a: CalendarItemDoc, b: CalendarItemDoc): boolean {
  const left = a.calendar;
  const right = b.calendar;
  return (
    a.title === b.title &&
    left.kind === right.kind &&
    left.startUTC === right.startUTC &&
    left.endUTC === right.endUTC &&
    left.allDay === right.allDay &&
    left.completed === right.completed &&
    left.icsImportId === right.icsImportId &&
    left.importSource === right.importSource &&
    left.calendarId === right.calendarId &&
    left.location === right.location &&
    left.description === right.description
  );
}

function metadataDiffers(current: CalendarItemDoc, saved: CalendarItemDoc): boolean {
  return (
    current.createdAt !== saved.createdAt ||
    current.updatedAt !== saved.updatedAt ||
    current.calendar.googleEventId !== saved.calendar.googleEventId
  );
}

function sameOverlay(a: OverlayEvent, b: OverlayEvent): boolean {
  return (
    a.id === b.id &&
    a.calendarId === b.calendarId &&
    a.eventId === b.eventId &&
    a.editable === b.editable &&
    a.deletable === b.deletable &&
    a.title === b.title &&
    a.startUTC === b.startUTC &&
    a.endUTC === b.endUTC &&
    a.allDay === b.allDay &&
    a.location === b.location &&
    a.description === b.description &&
    a.calendarName === b.calendarName &&
    a.calendarColor === b.calendarColor &&
    a.htmlLink === b.htmlLink &&
    a.meetLink === b.meetLink &&
    a.reminder === b.reminder &&
    sameStrings(a.guests, b.guests)
  );
}

function busyKey(block: BusyBlock): string {
  return `${block.startUTC}:${block.endUTC}`;
}

function sameBusy(a: readonly BusyBlock[], b: readonly BusyBlock[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].startUTC !== b[i].startUTC || a[i].endUTC !== b[i].endUTC) return false;
  }
  return true;
}

function inFetchedRange(startUTC: number, endUTC: number, range: SyncRange): boolean {
  return rangesOverlap(startUTC, endUTC, range.rangeStartUTC, range.rangeEndUTC);
}

function sortIds(ids: string[], rank: (id: string) => number): string[] {
  const next = [...ids].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  return sameIdList(ids, next) ? ids : next;
}

function retargetIds(
  buckets: Record<string, string[]>,
  id: string,
  oldDays: string[],
  newDays: string[],
  rank: (id: string) => number,
): Record<string, string[]> {
  const next: Record<string, string[]> = { ...buckets };
  let structural = false;
  const fresh = new Set(newDays);
  for (const day of oldDays) {
    if (fresh.has(day)) continue;
    const filtered = (next[day] ?? []).filter((entry) => entry !== id);
    structural = true;
    if (filtered.length === 0) delete next[day];
    else next[day] = filtered;
  }
  for (const day of newDays) {
    const without = (next[day] ?? []).filter((entry) => entry !== id);
    const ordered = sortIds([...without, id], rank);
    const prev = buckets[day];
    if (prev && sameIdList(prev, ordered)) {
      next[day] = prev;
      continue;
    }
    structural = true;
    next[day] = ordered;
  }
  return structural ? next : buckets;
}

export type EventStore = {
  applyUpsert: (doc: CalendarItemDoc) => void;
  applyRemove: (id: string) => void;
  beginWrite: (id: string, op: WriteOp) => number;
  settleWrite: (id: string, seq: number, saved: CalendarItemDoc | null) => void;
  rollbackWrite: (id: string, seq: number) => string | null;
  reconcileAll: (serverDocs: CalendarItemDoc[]) => void;
  reconcileGoogleRange: (range: SyncRange, events: OverlayEvent[], busy: BusyBlock[]) => void;
  applyGoogleUpsert: (event: OverlayEvent) => void;
  applyGoogleRemove: (id: string) => void;
  findGoogle: (calendarId: string, eventId: string) => OverlayEvent | undefined;
  getAllGoogle: () => OverlayEvent[];
  getGoogleEpoch: () => number;
  hideImport: (source: string) => void;
  stageImport: (source: string, docs: CalendarItemDoc[]) => void;
  releaseImport: (source: string) => void;
  setAiPending: (changes: PendingAiChange[]) => void;
  hasPendingWrite: (id: string) => boolean;
  pendingWrite: (id: string) => PendingWrite | undefined;
  getItem: (id: string) => CalendarItemDoc | undefined;
  getAllItems: () => CalendarItemDoc[];
  getDayBucket: (dayKey: string) => DayBucket;
  dayIds: (dayKey: string) => readonly string[];
  batch: (fn: () => void) => void;
  subscribeDay: (dayKey: string, listener: Listener) => () => void;
  subscribeItem: (id: string, listener: Listener) => () => void;
  subscribeAll: (listener: Listener) => () => void;
  subscribeGoogle: (listener: Listener) => () => void;
  //visibility lives outside the buckets. wake mounted days without copying them
  noteVisibility: () => void;
};

export function createEventStore(): EventStore {
  let eventsById: Record<string, CalendarItemDoc> = {};
  let eventsByDate: Record<string, string[]> = {};
  let googleById: Record<string, OverlayEvent> = {};
  let googleByDate: Record<string, string[]> = {};
  let busyByDate: Record<string, BusyBlock[]> = {};
  let aiPendingBySource: Record<string, PendingAiChange> = {};
  let aiPendingByDate: Record<string, string[]> = {};
  let pendingWrites: Record<string, PendingWrite> = {};
  const hiddenImports = new Set<string>();
  const stagedImports = new Map<string, CalendarItemDoc[]>();
  const voided = new Set<string>();
  const sealed: Record<string, number> = {};

  let allItems: CalendarItemDoc[] = NO_DOCS;
  let allItemsDirty = false;
  let allGoogle: OverlayEvent[] = NO_GOOGLE;
  let allGoogleDirty = false;
  let googleEpoch = 0;
  const daySnapshots = new Map<string, DayBucket>();

  const dayListeners = new Map<string, Set<Listener>>();
  const itemListeners = new Map<string, Set<Listener>>();
  const allListeners = new Set<Listener>();
  const googleListeners = new Set<Listener>();
  let depth = 0;
  let flushing = false;
  const dirtyDays = new Set<string>();
  const dirtyItems = new Set<string>();
  let dirtyAll = false;
  let dirtyGoogle = false;
  //whole-list listeners rebuild side panels. they wait until the day paint has landed
  let listTimer: ReturnType<typeof setTimeout> | null = null;
  let queuedAll = false;
  let queuedGoogle = false;

  function subscribeKey(map: Map<string, Set<Listener>>, key: string, listener: Listener): () => void {
    const set = map.get(key) ?? new Set<Listener>();
    map.set(key, set);
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) map.delete(key);
    };
  }

  function flush() {
    if (flushing) return;
    flushing = true;
    try {
      while (dirtyDays.size > 0 || dirtyItems.size > 0 || dirtyAll || dirtyGoogle) {
        const days = [...dirtyDays];
        const ids = [...dirtyItems];
        const all = dirtyAll;
        const google = dirtyGoogle;
        dirtyDays.clear();
        dirtyItems.clear();
        dirtyAll = false;
        dirtyGoogle = false;
        for (const day of days) {
          const set = dayListeners.get(day);
          if (!set) continue;
          for (const listener of [...set]) listener();
        }
        for (const id of ids) {
          const set = itemListeners.get(id);
          if (!set) continue;
          for (const listener of [...set]) listener();
        }
        //day columns paint first. the full-list rebuild follows on the next task, after that frame
        if (all || google) queueListNotify(all, google);
      }
    } finally {
      flushing = false;
    }
  }

  function queueListNotify(all: boolean, google: boolean) {
    if (all) queuedAll = true;
    if (google) queuedGoogle = true;
    if (listTimer != null) return;
    const timer = setTimeout(runListNotify, 0);
    listTimer = timer;
    if (typeof timer === "object" && timer !== null && "unref" in timer) timer.unref();
  }

  function runListNotify() {
    listTimer = null;
    const all = queuedAll;
    const google = queuedGoogle;
    queuedAll = false;
    queuedGoogle = false;
    if (all) for (const listener of [...allListeners]) listener();
    if (google) for (const listener of [...googleListeners]) listener();
    if (dirtyDays.size > 0 || dirtyItems.size > 0 || dirtyAll || dirtyGoogle) flush();
  }

  function touch(days: readonly string[], ids: readonly string[], all: boolean) {
    for (const day of days) {
      dirtyDays.add(day);
      daySnapshots.delete(day);
    }
    for (const id of ids) dirtyItems.add(id);
    if (all) {
      dirtyAll = true;
      allItemsDirty = true;
    }
    if (depth === 0 && !flushing) flush();
  }

  //show or hide a calendar. buckets stay put; each mounted day re-filters itself
  function noteVisibility() {
    if (flushing) {
      for (const day of dayListeners.keys()) dirtyDays.add(day);
      return;
    }
    const seen = new Set<Listener>();
    const listeners: Listener[] = [];
    for (const set of dayListeners.values()) {
      for (const listener of set) {
        if (seen.has(listener)) continue;
        seen.add(listener);
        listeners.push(listener);
      }
    }
    //one call per hook, even when it subscribed to every visible day
    flushing = true;
    try {
      for (const listener of listeners) listener();
    } finally {
      flushing = false;
    }
    if (dirtyDays.size > 0 || dirtyItems.size > 0 || dirtyAll || dirtyGoogle) flush();
  }

  function batch(fn: () => void) {
    depth += 1;
    try {
      fn();
    } finally {
      depth -= 1;
      if (depth === 0) flush();
    }
  }

  function patchCachedDoc(next: CalendarItemDoc) {
    if (!allItemsDirty) {
      const index = allItems.findIndex((item) => item.id === next.id);
      if (index >= 0) allItems[index] = next;
    }
    //keep the day snapshot identity so an echo does not re-render the column
    for (const day of localDaysTouched(next.calendar.startUTC, next.calendar.endUTC)) {
      const snap = daySnapshots.get(day);
      if (!snap) continue;
      const index = snap.docs.findIndex((item) => item.id === next.id);
      if (index >= 0) snap.docs[index] = next;
    }
  }

  function absorbMetadata(current: CalendarItemDoc, saved: CalendarItemDoc) {
    if (!metadataDiffers(current, saved)) return;
    const next: CalendarItemDoc = {
      ...current,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
      calendar: { ...current.calendar, googleEventId: saved.calendar.googleEventId },
    };
    eventsById = { ...eventsById, [current.id]: next };
    patchCachedDoc(next);
  }

  function docRank(id: string): number {
    return eventsById[id]?.calendar.startUTC ?? 0;
  }

  function googleRank(id: string): number {
    return googleById[id]?.startUTC ?? 0;
  }

  function applyUpsert(doc: CalendarItemDoc) {
    const prev = eventsById[doc.id];
    if (prev === doc) return;
    if (prev && sameVisibleItem(prev, doc)) {
      absorbMetadata(prev, doc);
      return;
    }
    const oldDays = prev ? localDaysTouched(prev.calendar.startUTC, prev.calendar.endUTC) : [];
    const newDays = localDaysTouched(doc.calendar.startUTC, doc.calendar.endUTC);
    eventsById = { ...eventsById, [doc.id]: doc };
    eventsByDate = retargetIds(eventsByDate, doc.id, oldDays, newDays, docRank);
    touch([...new Set([...oldDays, ...newDays])], [doc.id], true);
  }

  function applyRemove(id: string) {
    const prev = eventsById[id];
    if (!prev) return;
    const oldDays = localDaysTouched(prev.calendar.startUTC, prev.calendar.endUTC);
    const rest = { ...eventsById };
    delete rest[id];
    eventsById = rest;
    eventsByDate = retargetIds(eventsByDate, id, oldDays, [], docRank);
    touch(oldDays, [id], true);
  }

  //list subscribers only when the overlay rows change; epoch also covers busy-only pulls
  function markGoogle(listChanged: boolean) {
    googleEpoch += 1;
    dirtyGoogle = true;
    if (listChanged) allGoogleDirty = true;
  }

  function applyGoogleUpsert(event: OverlayEvent) {
    const prev = googleById[event.id];
    if (prev && sameOverlay(prev, event)) return;
    const oldDays = prev ? localDaysTouched(prev.startUTC, prev.endUTC) : [];
    const newDays = localDaysTouched(event.startUTC, event.endUTC);
    googleById = { ...googleById, [event.id]: event };
    googleByDate = retargetIds(googleByDate, event.id, oldDays, newDays, googleRank);
    markGoogle(true);
    touch([...new Set([...oldDays, ...newDays])], [], false);
  }

  function applyGoogleRemove(id: string) {
    const prev = googleById[id];
    if (!prev) return;
    const oldDays = localDaysTouched(prev.startUTC, prev.endUTC);
    const rest = { ...googleById };
    delete rest[id];
    googleById = rest;
    googleByDate = retargetIds(googleByDate, id, oldDays, [], googleRank);
    markGoogle(true);
    touch(oldDays, [], false);
  }

  function findGoogle(calendarId: string, eventId: string): OverlayEvent | undefined {
    for (const event of Object.values(googleById)) {
      if (event.calendarId === calendarId && event.eventId === eventId) return event;
    }
    return undefined;
  }

  function allBusy(): BusyBlock[] {
    const seen = new Set<string>();
    const out: BusyBlock[] = [];
    for (const blocks of Object.values(busyByDate)) {
      for (const block of blocks) {
        const key = busyKey(block);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(block);
      }
    }
    return out;
  }

  function publishBusy(blocks: BusyBlock[]) {
    const grouped = new Map<string, BusyBlock[]>();
    for (const block of blocks) {
      for (const day of localDaysTouched(block.startUTC, block.endUTC)) {
        const list = grouped.get(day);
        if (list) list.push(block);
        else grouped.set(day, [block]);
      }
    }
    const next: Record<string, BusyBlock[]> = {};
    const affected: string[] = [];
    const days = new Set([...Object.keys(busyByDate), ...grouped.keys()]);
    let changed = false;
    for (const day of days) {
      const prev = busyByDate[day];
      const incoming = grouped.get(day) ?? [];
      if (prev && sameBusy(prev, incoming)) {
        next[day] = prev;
        continue;
      }
      changed = true;
      if (incoming.length > 0) next[day] = incoming;
      affected.push(day);
    }
    if (!changed) return;
    busyByDate = next;
    markGoogle(false);
    touch(affected, [], false);
  }

  function pendingDays(change: PendingAiChange): string[] {
    const keys = new Set<string>();
    const add = (startUTC: number, endUTC: number) => {
      for (const key of localDaysTouched(startUTC, endUTC)) keys.add(key);
    };
    if (change.calendar) add(change.calendar.startUTC, change.calendar.endUTC);
    if (change.previousCalendar) add(change.previousCalendar.startUTC, change.previousCalendar.endUTC);
    const existing = eventsById[change.sourceId];
    if (existing) add(existing.calendar.startUTC, existing.calendar.endUTC);
    return [...keys];
  }

  function setAiPending(changes: PendingAiChange[]) {
    const nextSource: Record<string, PendingAiChange> = {};
    const grouped = new Map<string, string[]>();
    for (const change of changes) {
      nextSource[change.sourceId] = change;
      for (const day of pendingDays(change)) {
        const list = grouped.get(day);
        if (list) list.push(change.sourceId);
        else grouped.set(day, [change.sourceId]);
      }
    }
    const nextDate: Record<string, string[]> = {};
    const affected: string[] = [];
    const days = new Set([...Object.keys(aiPendingByDate), ...grouped.keys()]);
    for (const day of days) {
      const prevIds = aiPendingByDate[day] ?? NO_IDS;
      const nextIds = grouped.get(day) ?? NO_IDS;
      const same =
        sameIdList(prevIds, nextIds) && nextIds.every((id) => aiPendingBySource[id] === nextSource[id]);
      if (same) {
        if (prevIds.length > 0) nextDate[day] = aiPendingByDate[day];
        continue;
      }
      if (nextIds.length > 0) nextDate[day] = nextIds;
      affected.push(day);
    }
    aiPendingBySource = nextSource;
    aiPendingByDate = nextDate;
    if (affected.length > 0) touch(affected, [], false);
  }

  function beginWrite(id: string, op: WriteOp): number {
    const existing = pendingWrites[id];
    //later edits keep the original base so an older success can advance it
    const base = existing ? existing.base : (eventsById[id] ?? null);
    const seq = (existing?.seq ?? 0) + 1;
    pendingWrites = { ...pendingWrites, [id]: { base, seq, op } };
    return seq;
  }

  function settleWrite(id: string, seq: number, saved: CalendarItemDoc | null) {
    if (voided.has(`${id}:${seq}`)) return;
    const pending = pendingWrites[id];
    if (pending && seq < pending.seq) {
      pendingWrites = { ...pendingWrites, [id]: { ...pending, base: saved } };
      return;
    }
    if (pending && seq === pending.seq) {
      const rest = { ...pendingWrites };
      delete rest[id];
      pendingWrites = rest;
      sealed[id] = seq;
      if (saved) applyUpsert(saved);
      else applyRemove(id);
      return;
    }
    //a newer write was rolled back, so this older success is the server copy
    if (!pending && seq > (sealed[id] ?? 0)) {
      sealed[id] = seq;
      if (saved) applyUpsert(saved);
      else applyRemove(id);
    }
  }

  function rollbackWrite(id: string, seq: number): string | null {
    const pending = pendingWrites[id];
    if (!pending || pending.seq !== seq) return null;
    voided.add(`${id}:${seq}`);
    const title =
      (pending.op === "remove" ? pending.base?.title : eventsById[id]?.title) || pending.base?.title || "Item";
    const verb = pending.op === "remove" ? "delete" : "save";
    const rest = { ...pendingWrites };
    delete rest[id];
    pendingWrites = rest;
    if (pending.base) applyUpsert(pending.base);
    else applyRemove(id);
    return `Couldn't ${verb} “${title}”. Your change was undone.`;
  }

  function reconcileAll(serverDocs: CalendarItemDoc[]) {
    batch(() => {
      const visible = serverDocs.filter(
        (doc) => !doc.calendar.importSource || !hiddenImports.has(doc.calendar.importSource),
      );
      const present = new Set<string>();
      for (const doc of visible) if (doc.calendar.importSource) present.add(doc.calendar.importSource);
      const keep = new Map<string, CalendarItemDoc>();
      for (const doc of visible) keep.set(doc.id, doc);
      for (const [source, docs] of stagedImports) {
        if (hiddenImports.has(source) || present.has(source)) continue;
        for (const doc of docs) if (!keep.has(doc.id)) keep.set(doc.id, doc);
      }
      for (const id of Object.keys(pendingWrites)) {
        const pending = pendingWrites[id];
        const local = eventsById[id];
        if (pending.op === "remove" || !local) keep.delete(id);
        else keep.set(id, local);
      }
      for (const doc of keep.values()) {
        if (pendingWrites[doc.id]) continue;
        applyUpsert(doc);
      }
      for (const id of Object.keys(eventsById)) {
        if (keep.has(id) || pendingWrites[id]) continue;
        applyRemove(id);
      }
    });
  }

  function reconcileGoogleRange(range: SyncRange, events: OverlayEvent[], busy: BusyBlock[]) {
    batch(() => {
      const incoming = new Map(events.map((event) => [event.id, event]));
      for (const event of Object.values(googleById)) {
        if (!inFetchedRange(event.startUTC, event.endUTC, range)) continue;
        if (!incoming.has(event.id)) applyGoogleRemove(event.id);
      }
      for (const event of events) applyGoogleUpsert(event);
      const incomingBusy = new Set(busy.map(busyKey));
      const merged = allBusy().filter(
        (block) =>
          !incomingBusy.has(busyKey(block)) &&
          !inFetchedRange(block.startUTC, block.endUTC, range),
      );
      const seen = new Set(merged.map(busyKey));
      for (const block of busy) {
        const key = busyKey(block);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(block);
      }
      publishBusy(merged);
    });
  }

  function hideImport(source: string) {
    const staged = stagedImports.get(source) ?? [];
    stagedImports.delete(source);
    hiddenImports.add(source);
    const drop = new Set(staged.map((doc) => doc.id));
    batch(() => {
      for (const [id, doc] of Object.entries(eventsById)) {
        if (doc.calendar.importSource === source || drop.has(id)) applyRemove(id);
      }
    });
  }

  function stageImport(source: string, docs: CalendarItemDoc[]) {
    const previous = stagedImports.get(source) ?? [];
    hiddenImports.delete(source);
    stagedImports.set(source, docs);
    const nextIds = new Set(docs.map((doc) => doc.id));
    batch(() => {
      for (const doc of previous) if (!nextIds.has(doc.id)) applyRemove(doc.id);
      for (const [id, doc] of Object.entries(eventsById)) {
        if (doc.calendar.importSource === source && !nextIds.has(id)) applyRemove(id);
      }
      for (const doc of docs) applyUpsert(doc);
    });
  }

  function releaseImport(source: string) {
    hiddenImports.delete(source);
    stagedImports.delete(source);
  }

  function getAllGoogle(): OverlayEvent[] {
    if (!allGoogleDirty) return allGoogle;
    const next = Object.values(googleById).sort(
      (a, b) => a.startUTC - b.startUTC || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    allGoogle = next.length === 0 ? NO_GOOGLE : next;
    allGoogleDirty = false;
    return allGoogle;
  }

  function getAllItems(): CalendarItemDoc[] {
    if (!allItemsDirty) return allItems;
    allItems = Object.values(eventsById).sort(
      (a, b) => a.calendar.startUTC - b.calendar.startUTC || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    allItemsDirty = false;
    return allItems;
  }

  function getDayBucket(dayKey: string): DayBucket {
    const cached = daySnapshots.get(dayKey);
    if (cached) return cached;
    const docIds = eventsByDate[dayKey];
    const googleIds = googleByDate[dayKey];
    const busy = busyByDate[dayKey];
    const pendingIds = aiPendingByDate[dayKey];
    const docs = docIds?.length
      ? docIds.map((id) => eventsById[id]).filter((doc): doc is CalendarItemDoc => doc != null)
      : NO_DOCS;
    const google = googleIds?.length
      ? googleIds.map((id) => googleById[id]).filter((event): event is OverlayEvent => event != null)
      : NO_GOOGLE;
    const aiPending = pendingIds?.length
      ? pendingIds.map((id) => aiPendingBySource[id]).filter((change): change is PendingAiChange => change != null)
      : NO_PENDING;
    if (docs.length === 0 && google.length === 0 && !busy?.length && aiPending.length === 0) {
      daySnapshots.set(dayKey, EMPTY_BUCKET);
      return EMPTY_BUCKET;
    }
    const bucket: DayBucket = { docs, google, busy: busy ?? NO_BUSY, aiPending };
    daySnapshots.set(dayKey, bucket);
    return bucket;
  }

  return {
    applyUpsert,
    applyRemove,
    beginWrite,
    settleWrite,
    rollbackWrite,
    reconcileAll,
    reconcileGoogleRange,
    applyGoogleUpsert,
    applyGoogleRemove,
    findGoogle,
    getAllGoogle,
    getGoogleEpoch: () => googleEpoch,
    hideImport,
    stageImport,
    releaseImport,
    setAiPending,
    hasPendingWrite: (id) => pendingWrites[id] != null,
    pendingWrite: (id) => pendingWrites[id],
    getItem: (id) => eventsById[id],
    getAllItems,
    getDayBucket,
    dayIds: (dayKey) => eventsByDate[dayKey] ?? NO_IDS,
    batch,
    subscribeDay: (dayKey, listener) => subscribeKey(dayListeners, dayKey, listener),
    subscribeItem: (id, listener) => subscribeKey(itemListeners, id, listener),
    subscribeAll: (listener) => {
      allListeners.add(listener);
      return () => allListeners.delete(listener);
    },
    subscribeGoogle: (listener) => {
      googleListeners.add(listener);
      return () => googleListeners.delete(listener);
    },
    noteVisibility,
  };
}

const EventStoreContext = createContext<EventStore | null>(null);

export function EventStoreProvider({ store, children }: { store: EventStore; children: ReactNode }) {
  return createElement(EventStoreContext.Provider, { value: store }, children);
}

export function useOptionalEventStore(): EventStore | null {
  return useContext(EventStoreContext);
}

export function useEventStore(): EventStore {
  const store = useOptionalEventStore();
  if (!store) throw new Error("useCalendar must be used within CalendarProvider");
  return store;
}

export function useDayBucket(dayKey: string): DayBucket {
  const store = useEventStore();
  const subscribe = useCallback((onStoreChange: Listener) => store.subscribeDay(dayKey, onStoreChange), [store, dayKey]);
  const getSnapshot = useCallback(() => store.getDayBucket(dayKey), [store, dayKey]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useCalendarItem(id: string): CalendarItemDoc | undefined {
  const store = useEventStore();
  const subscribe = useCallback((onStoreChange: Listener) => store.subscribeItem(id, onStoreChange), [store, id]);
  const getSnapshot = useCallback(() => store.getItem(id), [store, id]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useAllItems(): CalendarItemDoc[] {
  const store = useEventStore();
  const subscribe = useCallback((onStoreChange: Listener) => store.subscribeAll(onStoreChange), [store]);
  const getSnapshot = useCallback(() => store.getAllItems(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useAllGoogle(): OverlayEvent[] {
  const store = useEventStore();
  const subscribe = useCallback((onStoreChange: Listener) => store.subscribeGoogle(onStoreChange), [store]);
  const getSnapshot = useCallback(() => store.getAllGoogle(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

//bumps on overlay and busy changes so scroll lead can follow a google pull
export function useGoogleEpoch(): number {
  const store = useEventStore();
  const subscribe = useCallback((onStoreChange: Listener) => store.subscribeGoogle(onStoreChange), [store]);
  const getSnapshot = useCallback(() => store.getGoogleEpoch(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
