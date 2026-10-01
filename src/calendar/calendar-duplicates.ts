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

//hide lower-priority copies of the same event. a shorter title inside a longer one counts when the times match.
export function dedupeCalendarTitles(items: TimelineItem[], order: CalendarPriorityOrder, showDuplicates = false): TimelineItem[] {
  const visible = items.filter((item) => {
    const source = calendarSource(item);
    return source !== "learn" && source !== "portal" || order.includes(source);
  });
  if (showDuplicates) return visible;
  const open = visible.filter((item) => item.kind !== "task" && !item.editorDraft && !item.pendingApproval);
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
  return visible.filter((item) => {
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
