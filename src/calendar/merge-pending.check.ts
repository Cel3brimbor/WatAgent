import assert from "node:assert/strict";
import type { PendingAiChange } from "@/calendar/approval-client";
import type { CalendarItemDoc } from "@/calendar/types";
import {
  commitApprovedPendingChanges,
  mergePendingIntoItems,
  pendingChangesMatching,
} from "./merge-pending";

const start = new Date(2026, 9, 1, 12).getTime();
const eventMeta = {
  kind: "event" as const,
  startUTC: start,
  endUTC: start + 3600000,
  allDay: false,
  completed: false,
};

const committed: CalendarItemDoc[] = [
  { id: "a", title: "Old", calendar: eventMeta, createdAt: 1, updatedAt: 1 },
];

const addPending: PendingAiChange = {
  id: "p1",
  sourceId: "new",
  action: "upsert",
  title: "New event",
  calendar: { ...eventMeta, startUTC: start + 86400000 },
  createdAt: 2,
};

const editPending: PendingAiChange = {
  id: "p2",
  sourceId: "a",
  action: "upsert",
  title: "Renamed",
  calendar: eventMeta,
  previousTitle: "Old",
  previousCalendar: eventMeta,
  createdAt: 3,
};

assert.equal(pendingChangesMatching([addPending, editPending], { ids: ["p2"] }).length, 1);
assert.equal(pendingChangesMatching([addPending, editPending], { all: true }).length, 2);

const withPending = mergePendingIntoItems(committed, [editPending, addPending]);
assert.equal(withPending.find((row) => row.id === "a")?.title, "Renamed");
assert.equal(withPending.find((row) => row.id === "new")?.pendingApproval, true);

const afterAdd = commitApprovedPendingChanges(committed, [addPending]);
assert.equal(afterAdd.length, 2);
assert.equal(afterAdd.find((row) => row.id === "new")?.pendingApproval, undefined);

const afterEdit = commitApprovedPendingChanges(committed, [editPending]);
assert.equal(afterEdit.find((row) => row.id === "a")?.title, "Renamed");
assert.equal(afterEdit.find((row) => row.id === "a")?.pendingApproval, undefined);

const deletePending: PendingAiChange = {
  id: "p3",
  sourceId: "a",
  action: "delete",
  title: "Old",
  createdAt: 4,
};
const afterDelete = commitApprovedPendingChanges(committed, [deletePending]);
assert.equal(afterDelete.length, 0);

console.log("merge-pending.check ok");
