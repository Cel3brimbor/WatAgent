import assert from "node:assert/strict";
import { createSaveQueue } from "./chat-save-queue";
import { settleCallingTools } from "./settle-tools";
import type { ToolEventRecord } from "./types";

const calling: ToolEventRecord = {
  id: "t1",
  tool: "list_calendar_items",
  state: "calling",
  callLabel: "list_calendar_items(oct 11th)",
};

settleCallingTools([calling], "succeeded");
assert.equal(calling.state, "succeeded");
assert.equal(calling.resultSummary, undefined);

const stopped: ToolEventRecord = { id: "t2", tool: "add_calendar_item", state: "calling" };
const done: ToolEventRecord = { id: "t3", tool: "add_calendar_item", state: "succeeded", resultSummary: "Added" };
settleCallingTools([stopped, done], "failed", "Stopped.");
assert.equal(stopped.state, "failed");
assert.equal(stopped.resultSummary, "Stopped.");
assert.equal(done.state, "succeeded");
assert.equal(done.resultSummary, "Added");

async function main(): Promise<void> {
  const saved: string[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const enqueue = createSaveQueue<string>(async (_id, snapshot) => {
    saved.push(snapshot);
    await gate;
  });

  const first = enqueue("chat", "partial");
  const second = enqueue("chat", "finished reply");
  await Promise.resolve();
  assert.deepEqual(saved, []);
  release();
  await first;
  await second;
  assert.deepEqual(saved, ["finished reply"]);
}

main().then(
  () => {
    console.log("settle-tools.check ok");
  },
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
