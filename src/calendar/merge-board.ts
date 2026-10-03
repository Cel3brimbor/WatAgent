import type { MergedCalendar } from "@/calendar/types";

/** Imported calendars that aren't in any box. */
export const TRAY = "tray";

/**
 * A box on the board. With two or more calendars it's a merged calendar; with fewer it's a draft,
 * kept on this device until it fills, so an empty box you added doesn't vanish.
 */
export type MergeBox = MergedCalendar;

/** Box id → the imported calendars (ics:<feed>) in it, in priority order, plus the tray. */
export type Boxes = Record<string, string[]>;

/** Merged calendars first, then drafts, each calendar in one box at most. */
export function boxesOf(feedIds: string[], boxList: MergeBox[]): Boxes {
  const known = new Set(feedIds);
  const placed = new Set<string>();
  const boxes: Boxes = {};
  for (const box of boxList) {
    boxes[box.id] = box.members.filter((member) => known.has(member) && !placed.has(member));
    boxes[box.id].forEach((member) => placed.add(member));
  }
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
  /** Boxes with two or more calendars, saved as merged calendars. */
  merged: MergedCalendar[];
  /** Boxes with fewer, kept on this device. */
  drafts: MergeBox[];
  /** Boxes that just became merged calendars. */
  created: MergedCalendar[];
  /** What changed, for the status line. Empty when nothing did. */
  changes: string[];
};

/** Splits the boxes back into merged calendars (two or more) and drafts, describing what changed. */
export function commitBoxes(
  boxes: Boxes,
  merged: MergedCalendar[],
  drafts: MergeBox[],
  nameOf: (id: string) => string,
): BoardCommit {
  const changes: string[] = [];
  const result: BoardCommit = { merged: [], drafts: [], created: [], changes };
  const wasMerged = new Set(merged.map((box) => box.id));
  for (const box of [...merged, ...drafts]) {
    const members = boxes[box.id] ?? [];
    const before = box.members;
    const added = members.filter((member) => !before.includes(member));
    const removed = before.filter((member) => !members.includes(member));
    if (added.length) changes.push(`${added.map(nameOf).join(" and ")} added to ${box.name}`);
    if (removed.length) changes.push(`${removed.map(nameOf).join(" and ")} taken out of ${box.name}`);
    const kept = before.filter((member) => members.includes(member));
    const sameOrder = kept.join() === members.filter((member) => kept.includes(member)).join();
    if (!added.length && !removed.length && !sameOrder) changes.push(`${box.name} reordered: ${nameOf(members[0])} first`);
    const next = added.length || removed.length || !sameOrder ? { ...box, members } : box;
    if (members.length >= 2) {
      result.merged.push(next);
      if (!wasMerged.has(box.id)) {
        result.created.push(next);
        changes.push(`${box.name} now merges ${members.map(nameOf).join(", ")}, ${nameOf(members[0])}'s copy first`);
      }
    } else {
      result.drafts.push(next);
      if (wasMerged.has(box.id)) changes.push(`${box.name} needs two calendars to merge, so its events show on their own for now`);
    }
  }
  return result;
}

/** A name for a new box that no other box has. */
export function newBoxName(taken: string[]): string {
  const names = new Set(taken);
  for (let count = 1; ; count += 1) {
    const name = `Merged calendar ${count}`;
    if (!names.has(name)) return name;
  }
}
