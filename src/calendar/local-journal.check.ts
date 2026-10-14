import assert from "node:assert/strict";
import type { CalendarItemDoc } from "@/calendar/types";
import {
  ackItemOp,
  localItems,
  mergeServerItems,
  noteLocalItemDelete,
  noteLocalItemUpsert,
  pendingItemOps,
} from "@/calendar/local-journal";

const memory = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
  },
});

const userId = "11111111-1111-4111-8111-111111111111";

function item(id: string, title: string): CalendarItemDoc {
  return {
    id,
    title,
    calendar: { kind: "event", startUTC: 1_700_000_000_000, endUTC: 1_700_003_600_000, allDay: false },
    createdAt: 10,
    updatedAt: 20,
  };
}

assert.equal(localItems(userId), null);
const server = [item("a", "Class")];
assert.equal(mergeServerItems(userId, server)[0]?.title, "Class");
assert.equal(noteLocalItemUpsert(userId, item("b", "Local")), true);
assert.deepEqual(localItems(userId)?.map((row) => row.id).sort(), ["a", "b"]);
assert.equal(pendingItemOps(userId)[0]?.kind, "upsert");
assert.equal(noteLocalItemDelete(userId, "b"), true);
assert.deepEqual(pendingItemOps(userId), [], "a local-only create then delete never reaches the server");
assert.equal(noteLocalItemDelete(userId, "a"), true);
assert.equal(pendingItemOps(userId)[0]?.kind, "delete");
ackItemOp(userId, "a");
assert.deepEqual(pendingItemOps(userId), []);
assert.equal(mergeServerItems(userId, server)[0]?.id, "a");

console.log("local-journal.check ok");
