import type { CalendarPriorityOrder, CalendarPrioritySource, ImportedCalendarSource, TimelineItem } from "@/calendar/types";

export function normalizedCalendarTitle(title: string): string {
  return title.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

//google stays its own source, so a subscribed learn or portal calendar competes in the priority list
export function calendarSource(item: TimelineItem): CalendarPrioritySource | ImportedCalendarSource | undefined {
  if (item.kind === "gcal_event") return "google";
  return item.importSource;
}

function googleFeedOf(item: TimelineItem): "learn" | "portal" | undefined {
  if (item.kind !== "gcal_event") return undefined;
  const name = item.google?.calendarName ?? "";
  if (/\b(learn|brightspace|d2l)\b/i.test(name)) return "learn";
  if (/\bportal\b/i.test(name)) return "portal";
  return undefined;
}

function sameLocalDay(a: number, b: number): boolean {
  const left = new Date(a);
  const right = new Date(b);
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function titlesNest(a: string, b: string): boolean {
  if (!a || !b || a === b) return false;
  return a.length < b.length ? b.includes(a) : a.includes(b);
}

function duplicatePair(a: TimelineItem, b: TimelineItem): boolean {
  const left = normalizedCalendarTitle(a.title);
  const right = normalizedCalendarTitle(b.title);
  if (!left || !right) return false;
  if (left === right && sameLocalDay(a.startUTC, b.startUTC)) return true;
  return titlesNest(left, right) && a.startUTC === b.startUTC && a.endUTC === b.endUTC;
}

function rankedSource(item: TimelineItem, order: CalendarPriorityOrder): CalendarPrioritySource | undefined {
  const source = calendarSource(item);
  if (source === "learn" || source === "portal" || source === "google") return order.includes(source) ? source : undefined;
  return undefined;
}

//tasks, the open editor's draft and pending Agent changes never hide or get hidden
function competes(item: TimelineItem): boolean {
  return item.kind !== "task" && !item.editorDraft && !item.pendingApproval;
}

//union-find over duplicate pairs; returns each item's group root
function groupDuplicates(open: TimelineItem[]): (index: number) => number {
  const parent = open.map((_, index) => index);
  const find = (index: number): number => {
    let cursor = index;
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor]];
      cursor = parent[cursor];
    }
    return cursor;
  };
  for (let left = 0; left < open.length; left += 1) {
    for (let right = left + 1; right < open.length; right += 1) {
      if (!duplicatePair(open[left], open[right])) continue;
      const a = find(left);
      const b = find(right);
      if (a !== b) parent[b] = a;
    }
  }
  return find;
}

function localDayKey(utc: number): string {
  const date = new Date(utc);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export type DuplicateOverlap = { a: CalendarPrioritySource; b: CalendarPrioritySource; count: number };

//how many events each pair of ranked sources shares, grouped exactly as dedupeCalendarTitles groups them.
//every duplicate pair starts on the same local day, so grouping per start day finds the same groups.
export function duplicateOverlaps(items: TimelineItem[], sources: CalendarPrioritySource[]): DuplicateOverlap[] {
  const byDay = new Map<string, TimelineItem[]>();
  for (const item of items) {
    if (!competes(item)) continue;
    const key = localDayKey(item.startUTC);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(item);
    else byDay.set(key, [item]);
  }
  const counts = new Map<string, number>();
  for (const bucket of byDay.values()) {
    const find = groupDuplicates(bucket);
    const present = new Map<number, Set<CalendarPrioritySource>>();
    bucket.forEach((item, index) => {
      const source = calendarSource(item);
      if (source !== "learn" && source !== "portal" && source !== "google") return;
      if (!sources.includes(source)) return;
      const root = find(index);
      const found = present.get(root);
      if (found) found.add(source);
      else present.set(root, new Set([source]));
    });
    for (const group of present.values()) {
      const ranked = sources.filter((source) => group.has(source));
      for (let left = 0; left < ranked.length; left += 1) {
        for (let right = left + 1; right < ranked.length; right += 1) {
          const key = `${ranked[left]}|${ranked[right]}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
    }
  }
  const pairs: DuplicateOverlap[] = [];
  for (let left = 0; left < sources.length; left += 1) {
    for (let right = left + 1; right < sources.length; right += 1) {
      pairs.push({ a: sources[left], b: sources[right], count: counts.get(`${sources[left]}|${sources[right]}`) ?? 0 });
    }
  }
  return pairs;
}

//hide lower-priority copies of the same event. a shorter title inside a longer one counts when the times match.
export function dedupeCalendarTitles(items: TimelineItem[], order: CalendarPriorityOrder, showDuplicates = false): TimelineItem[] {
  const visible = items.filter((item) => {
    const source = calendarSource(item);
    return source !== "learn" && source !== "portal" || order.includes(source);
  });
  if (showDuplicates) return visible;
  //a feed can list one event twice under different UIDs; identical copies from one imported calendar show once
  const copies = new Set<string>();
  const distinct = visible.filter((item) => {
    if (!item.importSource || item.kind === "task" || item.editorDraft || item.pendingApproval) return true;
    const key = [item.importSource, normalizedCalendarTitle(item.title), item.startUTC, item.endUTC, item.allDay,
      normalizedCalendarTitle(item.location ?? "")].join("|");
    if (copies.has(key)) return false;
    copies.add(key);
    return true;
  });
  const open = distinct.filter(competes);
  const find = groupDuplicates(open);
  const winnerOf = new Map<number, CalendarPrioritySource>();
  const learnGoogle = new Set<number>();
  for (let index = 0; index < open.length; index += 1) {
    const root = find(index);
    if (googleFeedOf(open[index]) === "learn") learnGoogle.add(root);
    const source = rankedSource(open[index], order);
    if (!source) continue;
    const current = winnerOf.get(root);
    if (!current || order.indexOf(source) < order.indexOf(current)) winnerOf.set(root, source);
  }
  const rootOf = new Map(open.map((item, index) => [item, find(index)]));
  return distinct.filter((item) => {
    if (item.kind === "task" || item.editorDraft || item.pendingApproval) return true;
    const root = rootOf.get(item);
    if (root == null) return true;
    if (googleFeedOf(item) === "portal" && learnGoogle.has(root)) return false;
    const source = rankedSource(item, order);
    if (!source) return true;
    const winner = winnerOf.get(root);
    return !winner || winner === source;
  });
}
