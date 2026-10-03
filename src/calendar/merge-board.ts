import type { MergedCalendar } from "@/calendar/types";

/** Imported calendars nobody merged yet. */
export const TRAY = "tray";
/** The empty box a new merged calendar starts in. */
export const NEW_BOX = "new";

/** Box id → the imported calendars (ics:<feed>) in it, in priority order. Merged calendars use their own id. */
export type Boxes = Record<string, string[]>;

/** Lays out the board: one box per merged calendar, the new box, and the tray holding the rest. */
export function boxesOf(feedIds: string[], merged: MergedCalendar[], draft: string[]): Boxes {
  const known = new Set(feedIds);
  const placed = new Set<string>();
  const boxes: Boxes = {};
  for (const calendar of merged) {
    boxes[calendar.id] = calendar.members.filter((member) => known.has(member) && !placed.has(member));
    boxes[calendar.id].forEach((member) => placed.add(member));
  }
  boxes[NEW_BOX] = draft.filter((member) => known.has(member) && !placed.has(member));
  boxes[NEW_BOX].forEach((member) => placed.add(member));
  boxes[TRAY] = feedIds.filter((id) => !placed.has(id));
  return boxes;
}

export function boxOf(boxes: Boxes, id: string): string | null {
  if (id in boxes) return id;
  return Object.keys(boxes).find((box) => boxes[box].includes(id)) ?? null;
}

/**
 * Moves a calendar to another box, or within its own. `over` is a calendar to land in front of,
 * or a box id to land last in. Returns the same object when nothing moves.
 */
export function moveInBoxes(boxes: Boxes, id: string, over: string): Boxes {
  const from = boxOf(boxes, id);
  const to = boxOf(boxes, over);
  if (!from || !to || id === over) return boxes;
  const source = boxes[from].filter((entry) => entry !== id);
  const target = from === to ? source : [...boxes[to]];
  const at = over in boxes ? target.length : target.indexOf(over);
  //moving down within one box lands after the calendar it's over, as a list drag does
  const ahead = from === to && boxes[from].indexOf(id) < boxes[from].indexOf(over);
  target.splice(at < 0 ? target.length : at + (ahead ? 1 : 0), 0, id);
  const next = { ...boxes, [from]: from === to ? target : source, [to]: target };
  return JSON.stringify(next) === JSON.stringify(boxes) ? boxes : next;
}

export type BoardCommit = {
  merged: MergedCalendar[];
  draft: string[];
  /** A merged calendar made from the new box. */
  created?: MergedCalendar;
  /** What changed, for the status line. Empty when nothing did. */
  changes: string[];
};

/**
 * Turns the boxes back into merged calendars. A box left with fewer than two calendars unmerges,
 * and the new box becomes a merged calendar once it holds two.
 */
export function commitBoxes(
  boxes: Boxes,
  merged: MergedCalendar[],
  nameOf: (id: string) => string,
  newId: () => string,
): BoardCommit {
  const changes: string[] = [];
  const next: MergedCalendar[] = [];
  for (const calendar of merged) {
    const members = boxes[calendar.id] ?? [];
    if (members.length < 2) {
      changes.push(`${calendar.name} unmerged`);
      continue;
    }
    const added = members.filter((member) => !calendar.members.includes(member));
    const removed = calendar.members.filter((member) => !members.includes(member));
    if (added.length) changes.push(`${added.map(nameOf).join(" and ")} added to ${calendar.name}`);
    if (removed.length) changes.push(`${removed.map(nameOf).join(" and ")} taken out of ${calendar.name}`);
    const kept = calendar.members.filter((member) => members.includes(member));
    const sameOrder = kept.every((member, index) => members.filter((entry) => kept.includes(entry))[index] === member);
    if (!added.length && !removed.length && !sameOrder) changes.push(`${calendar.name} reordered: ${nameOf(members[0])} first`);
    next.push(added.length || removed.length || !sameOrder ? { ...calendar, members } : calendar);
  }
  const waiting = boxes[NEW_BOX] ?? [];
  if (waiting.length >= 2) {
    const created: MergedCalendar = { id: newId(), name: waiting.map(nameOf).join(" + ").slice(0, 80), members: waiting };
    changes.push(`${created.name} made, ${nameOf(waiting[0])}'s copy first`);
    return { merged: [...next, created], draft: [], created, changes };
  }
  return { merged: next, draft: waiting, changes };
}
