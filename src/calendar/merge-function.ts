import { boxesOf, commitBoxes, moveInBoxes, TRAY, type MergeBox } from "./merge-board";
import type { MergedCalendar } from "./types";

/** Apply Merge to an output calendar using the existing persisted calendar model. */
export function configureMerge(
  output: MergedCalendar,
  feedIds: string[],
  merged: MergedCalendar[],
  drafts: MergeBox[],
  nameOf: (id: string) => string,
) {
  const members = [...new Set(output.members)];
  if (!output.name.trim() || members.length < 2 || members.some((id) => !feedIds.includes(id))) {
    throw new Error("Choose a name and at least two available source calendars.");
  }
  const all = [...merged, ...drafts];
  const existing = all.some((calendar) => calendar.id === output.id);
  const nextDrafts = existing ? drafts : [...drafts, { ...output, members: [] }];
  const initial = boxesOf(feedIds, [...merged, ...nextDrafts]);
  let next = initial;
  for (const member of initial[output.id]) if (!members.includes(member)) next = moveInBoxes(next, member, TRAY);
  for (const member of members) next = moveInBoxes(next, member, output.id);
  next = { ...next, [output.id]: members };
  const result = commitBoxes(next, merged, nextDrafts, nameOf);
  return {
    ...result,
    merged: result.merged.map((calendar) => (calendar.id === output.id ? { ...calendar, name: output.name.trim() } : calendar)),
  };
}
