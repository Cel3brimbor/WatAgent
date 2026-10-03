import { importedCalendarId, mergedByMember } from "@/calendar/imported-calendars";
import type { MergedCalendar, TimelineItem } from "@/calendar/types";

export function normalizedCalendarTitle(title: string): string {
  return title.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

//a Google calendar subscribed to a LEARN or Portal feed, recognised by its name
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

function memberOf(item: TimelineItem): string | null {
  return item.importSource ? importedCalendarId(item.importSource) : null;
}

//a feed can list one event twice under different UIDs; identical copies from one imported calendar show once
function dropSameFeedCopies(items: TimelineItem[]): TimelineItem[] {
  const copies = new Set<string>();
  return items.filter((item) => {
    if (!item.importSource || !competes(item)) return true;
    const key = [item.importSource, normalizedCalendarTitle(item.title), item.startUTC, item.endUTC, item.allDay,
      normalizedCalendarTitle(item.location ?? "")].join("|");
    if (copies.has(key)) return false;
    copies.add(key);
    return true;
  });
}

/**
 * Members of a merged calendar show as that calendar: each duplicate once, the copy from its earliest member.
 * Events from imported calendars outside any merge, WatAgent events and Google events pass through.
 */
export function mergeTimeline(items: TimelineItem[], merged: MergedCalendar[]): TimelineItem[] {
  const distinct = dropSameFeedCopies(items);
  const byMember = mergedByMember(merged);
  const kept = new Set<TimelineItem>();
  for (const calendar of merged) {
    const rank = (item: TimelineItem) => calendar.members.indexOf(memberOf(item) ?? "");
    const open = distinct.filter((item) => competes(item) && rank(item) >= 0);
    const find = groupDuplicates(open);
    const winner = new Map<number, TimelineItem>();
    open.forEach((item, index) => {
      const root = find(index);
      const current = winner.get(root);
      if (!current || rank(item) < rank(current)) winner.set(root, item);
    });
    for (const item of winner.values()) kept.add(item);
  }
  //Google calendars subscribed to both feeds: the Portal copy of a LEARN event hides
  const googleOpen = distinct.filter((item) => competes(item) && googleFeedOf(item));
  const findGoogle = groupDuplicates(googleOpen);
  const learnRoots = new Set(googleOpen.flatMap((item, index) => (googleFeedOf(item) === "learn" ? [findGoogle(index)] : [])));
  const googleHidden = new Set(googleOpen.filter((item, index) => googleFeedOf(item) === "portal" && learnRoots.has(findGoogle(index))));

  return distinct.flatMap((item) => {
    if (googleHidden.has(item)) return [];
    const member = memberOf(item);
    const calendar = member ? byMember.get(member) : undefined;
    if (!calendar) return [item];
    if (competes(item) && !kept.has(item)) return [];
    return [{ ...item, mergedCalendarId: calendar.id }];
  });
}

/** How many of each member's events have a copy in another member of the same merged calendar. */
export function sharedEventCounts(items: TimelineItem[], merged: MergedCalendar[]): Map<string, number> {
  const counts = new Map<string, number>();
  const distinct = dropSameFeedCopies(items);
  for (const calendar of merged) {
    for (const member of calendar.members) counts.set(member, 0);
    //every duplicate pair starts on the same local day, so grouping per day finds the same groups
    const byDay = new Map<string, TimelineItem[]>();
    for (const item of distinct) {
      if (!competes(item) || !calendar.members.includes(memberOf(item) ?? "")) continue;
      const date = new Date(item.startUTC);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const bucket = byDay.get(key);
      if (bucket) bucket.push(item);
      else byDay.set(key, [item]);
    }
    for (const open of byDay.values()) {
      const find = groupDuplicates(open);
      const groups = new Map<number, Set<string>>();
      open.forEach((item, index) => {
        const root = find(index);
        const group = groups.get(root) ?? new Set<string>();
        group.add(memberOf(item)!);
        groups.set(root, group);
      });
      for (const group of groups.values()) {
        if (group.size < 2) continue;
        for (const member of group) counts.set(member, (counts.get(member) ?? 0) + 1);
      }
    }
  }
  return counts;
}
