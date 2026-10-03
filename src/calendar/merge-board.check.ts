import assert from "node:assert/strict";
import { boxesOf, commitBoxes, moveInBoxes, newBoxName, TRAY, type MergeBox } from "./merge-board";
import { mergeDraftsOf } from "./preferences";
import type { MergedCalendar } from "./types";

const [L, P, C, D] = ["ics:learn", "ics:portal", "ics:club", "ics:dept"];
const names: Record<string, string> = { [L]: "LEARN", [P]: "Portal", [C]: "Club", [D]: "Dept" };
const nameOf = (id: string) => names[id] ?? id;
const school: MergedCalendar = { id: "merge-school", name: "School", members: [L, P] };
const empty: MergeBox = { id: "merge-empty", name: "Merged calendar 1", members: [] };
const feeds = [L, P, C, D];

//layout
assert.deepEqual(boxesOf(feeds, []), { [TRAY]: [L, P, C, D] });
assert.deepEqual(boxesOf(feeds, [school, empty]), { "merge-school": [L, P], "merge-empty": [], [TRAY]: [C, D] });
assert.deepEqual(boxesOf([P, C], [school]), { "merge-school": [P], [TRAY]: [C] }, "a removed calendar drops out of its box");
assert.deepEqual(boxesOf(feeds, [school, { ...empty, members: [L] }])["merge-empty"], [], "a calendar sits in one box only");

//moving
const start = boxesOf(feeds, [school, empty]);
assert.deepEqual(moveInBoxes(start, C, "merge-empty")["merge-empty"], [C], "onto an empty box lands last");
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
const none = commitBoxes(start, [school], [empty], nameOf);
assert.deepEqual([none.merged, none.drafts, none.created, none.changes], [[school], [empty], [], []], "untouched board, no change");
const one = commitBoxes({ ...start, "merge-empty": [C], [TRAY]: [D] }, [school], [empty], nameOf);
assert.deepEqual([one.merged, one.drafts[0].members, one.created], [[school], [C], []], "one calendar waits in its box");
const made = commitBoxes({ ...start, "merge-empty": [D, C], [TRAY]: [] }, [school], [empty], nameOf);
assert.deepEqual(made.created, [{ ...empty, members: [D, C] }], "two make a merged calendar, keeping the box's id and name, in drop order");
assert.deepEqual([made.merged.length, made.drafts], [2, []]);
const reordered = commitBoxes({ ...start, "merge-school": [P, L] }, [school], [empty], nameOf);
assert.deepEqual([reordered.merged[0].members, reordered.changes], [[P, L], ["School reordered: Portal first"]]);
const shrunk = commitBoxes({ ...start, "merge-school": [L], [TRAY]: [C, D, P] }, [school], [empty], nameOf);
assert.deepEqual(shrunk.merged, [], "one calendar left stops merging");
assert.deepEqual(shrunk.drafts.map((box) => [box.id, box.members]), [["merge-school", [L]], ["merge-empty", []]], "but its box stays");
const grown = commitBoxes({ ...start, "merge-school": [L, C, P], [TRAY]: [D] }, [school], [], nameOf);
assert.deepEqual([grown.merged[0].members, grown.changes], [[L, C, P], ["Club added to School"]]);

//names and saved drafts
assert.equal(newBoxName([]), "Merged calendar 1");
assert.equal(newBoxName(["Merged calendar 1", "School"]), "Merged calendar 2");
const id = "merge-0b5c2f8e-3a4d-4e1f-9c2b-7d6e5f4a3b2c";
assert.deepEqual(mergeDraftsOf([{ id, name: "Box", members: [L, P] }, { id, name: "Again", members: [] }, { id: "bad", name: "x", members: [] }]), [{ id, name: "Box", members: [L] }], "a draft holds one calendar at most");
assert.deepEqual(mergeDraftsOf("nope"), []);

console.log("Merge board layout, moves, commits and draft box checks passed.");
