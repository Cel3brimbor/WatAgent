import assert from "node:assert/strict";
import { boxesOf, commitBoxes, moveInBoxes, NEW_BOX, TRAY } from "./merge-board";
import type { MergedCalendar } from "./types";

const [L, P, C, D] = ["ics:learn", "ics:portal", "ics:club", "ics:dept"];
const names: Record<string, string> = { [L]: "LEARN", [P]: "Portal", [C]: "Club", [D]: "Dept" };
const nameOf = (id: string) => names[id] ?? id;
const newId = () => "merge-new-id";
const school: MergedCalendar = { id: "merge-school", name: "School", members: [L, P] };
const feeds = [L, P, C, D];

//layout
assert.deepEqual(boxesOf(feeds, [], []), { [NEW_BOX]: [], [TRAY]: [L, P, C, D] });
assert.deepEqual(boxesOf(feeds, [school], [C]), { "merge-school": [L, P], [NEW_BOX]: [C], [TRAY]: [D] });
assert.deepEqual(boxesOf([P, C], [school], []), { "merge-school": [P], [NEW_BOX]: [], [TRAY]: [C] }, "a removed calendar drops out of its box");

//moving
const start = boxesOf(feeds, [school], []);
assert.deepEqual(moveInBoxes(start, C, NEW_BOX)[NEW_BOX], [C], "onto an empty box lands last");
assert.deepEqual(moveInBoxes(start, C, P)["merge-school"], [L, C, P], "onto a calendar lands in front of it");
assert.deepEqual(moveInBoxes(start, P, L)["merge-school"], [P, L], "moving up within a box");
assert.deepEqual(moveInBoxes(start, L, P)["merge-school"], [P, L], "moving down within a box");
assert.deepEqual(moveInBoxes(start, L, TRAY)[TRAY], [C, D, L], "back to the tray");
assert.equal(moveInBoxes(start, L, L), start, "dropping on itself changes nothing");
assert.equal(moveInBoxes(start, "ics:gone", TRAY), start);
const three = { ...start, "merge-school": [L, P, C], [TRAY]: [D] };
assert.deepEqual(moveInBoxes(three, L, C)["merge-school"], [P, C, L], "first to last");
assert.deepEqual(moveInBoxes(three, C, L)["merge-school"], [C, L, P], "last to first");

//committing
assert.deepEqual(commitBoxes(start, [school], nameOf, newId), { merged: [school], draft: [], changes: [] }, "untouched board, no change");
const one = commitBoxes({ ...start, [NEW_BOX]: [C], [TRAY]: [D] }, [school], nameOf, newId);
assert.deepEqual([one.merged, one.draft, one.created], [[school], [C], undefined], "one calendar waits in the new box");
const made = commitBoxes({ ...start, [NEW_BOX]: [D, C], [TRAY]: [] }, [school], nameOf, newId);
assert.deepEqual(made.created, { id: "merge-new-id", name: "Dept + Club", members: [D, C] }, "two make a merged calendar, in drop order");
assert.deepEqual([made.merged.length, made.draft], [2, []]);
const reordered = commitBoxes({ ...start, "merge-school": [P, L] }, [school], nameOf, newId);
assert.deepEqual(reordered.merged[0].members, [P, L]);
assert.deepEqual(reordered.changes, ["School reordered: Portal first"]);
const shrunk = commitBoxes({ ...start, "merge-school": [L], [TRAY]: [C, D, P] }, [school], nameOf, newId);
assert.deepEqual([shrunk.merged, shrunk.changes], [[], ["School unmerged"]], "one calendar left unmerges");
const grown = commitBoxes({ ...start, "merge-school": [L, C, P], [TRAY]: [D] }, [school], nameOf, newId);
assert.deepEqual([grown.merged[0].members, grown.changes], [[L, C, P], ["Club added to School"]]);

console.log("Merge board layout, moves and commits checks passed.");
