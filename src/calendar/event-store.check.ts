import assert from "node:assert/strict";
import type { CalendarItemDoc } from "@/calendar/types";
import type { BusyBlock, OverlayEvent } from "@/calendar/timeline";
import { createEventStore } from "./event-store";

process.env.TZ = "America/Toronto";

const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const dayKey = (day: number) => `2026-10-${String(day).padStart(2, "0")}`;

function item(id: string, title: string, startUTC: number, endUTC: number): CalendarItemDoc {
  return {
    id,
    title,
    createdAt: 1,
    updatedAt: 1,
    calendar: { kind: "event", startUTC, endUTC, allDay: false },
  };
}

function overlay(id: string, startUTC: number, endUTC: number): OverlayEvent {
  return {
    id,
    calendarId: "g",
    eventId: id,
    editable: false,
    deletable: false,
    title: id,
    startUTC,
    endUTC,
    allDay: false,
  };
}

//unaffected day buckets keep their array and snapshot
{
  const store = createEventStore();
  const morning = item("swim", "Swim", at(18, 9), at(18, 10));
  const later = item("dinner", "Dinner", at(20, 18), at(20, 19));
  store.applyUpsert(morning);
  store.applyUpsert(later);
  const ids = store.dayIds(dayKey(20));
  const snap = store.getDayBucket(dayKey(20));
  let hits = 0;
  store.subscribeDay(dayKey(20), () => {
    hits += 1;
  });
  store.applyUpsert({ ...morning, title: "Laps", updatedAt: 2 });
  assert.equal(store.dayIds(dayKey(20)), ids);
  assert.equal(store.getDayBucket(dayKey(20)), snap);
  assert.equal(hits, 0);
  assert.equal(store.getDayBucket(dayKey(18)).docs[0]?.title, "Laps");
}

//an echo that matches what is on screen does not notify
{
  const store = createEventStore();
  const doc = item("a", "Swim", at(18, 9), at(18, 10));
  store.applyUpsert(doc);
  const seq = store.beginWrite(doc.id, "upsert");
  const edited = { ...doc, title: "Laps", updatedAt: 2 };
  store.applyUpsert(edited);
  const snap = store.getDayBucket(dayKey(18));
  let hits = 0;
  store.subscribeDay(dayKey(18), () => {
    hits += 1;
  });
  store.subscribeAll(() => {
    hits += 1;
  });
  const saved = { ...edited, updatedAt: 9, calendar: { ...edited.calendar, googleEventId: "g1" } };
  store.settleWrite(doc.id, seq, saved);
  assert.equal(hits, 0);
  assert.equal(store.getDayBucket(dayKey(18)), snap);
  assert.equal(store.getItem(doc.id)?.calendar.googleEventId, "g1");
  assert.equal(store.pendingWrite(doc.id), undefined);
  assert.equal(store.getDayBucket(dayKey(18)).docs[0]?.calendar.googleEventId, "g1");
}

//rollback puts the base item back
{
  const store = createEventStore();
  const doc = item("a", "Swim", at(18, 9), at(18, 10));
  store.applyUpsert(doc);
  const seq = store.beginWrite(doc.id, "upsert");
  store.applyUpsert({ ...doc, title: "Laps", updatedAt: 2 });
  const note = store.rollbackWrite(doc.id, seq);
  assert.equal(store.getItem(doc.id), doc);
  assert.equal(note, "Couldn't save “Laps”. Your change was undone.");
  assert.equal(store.rollbackWrite(doc.id, seq), null);
}

//a newer edit keeps the original base, and an older success moves that base forward
{
  const store = createEventStore();
  const base = item("a", "Swim", at(18, 9), at(18, 10));
  store.applyUpsert(base);
  const seq1 = store.beginWrite(base.id, "upsert");
  const mid = { ...base, title: "Laps", updatedAt: 2 };
  store.applyUpsert(mid);
  const seq2 = store.beginWrite(base.id, "upsert");
  store.applyUpsert({ ...base, title: "Race", updatedAt: 3 });
  assert.equal(store.rollbackWrite(base.id, seq1), null);
  assert.equal(store.getItem(base.id)?.title, "Race");
  const echoed = { ...mid, updatedAt: 8, calendar: { ...mid.calendar, googleEventId: "echo" } };
  store.settleWrite(base.id, seq1, echoed);
  assert.equal(store.getItem(base.id)?.title, "Race");
  assert.equal(store.pendingWrite(base.id)?.base?.calendar.googleEventId, "echo");
  store.rollbackWrite(base.id, seq2);
  assert.equal(store.getItem(base.id)?.title, "Laps");
  assert.equal(store.getItem(base.id)?.calendar.googleEventId, "echo");
}

//purge leaves in-flight ids alone
{
  const store = createEventStore();
  const kept = item("kept", "Keep", at(18, 9), at(18, 10));
  const gone = item("gone", "Gone", at(18, 11), at(18, 12));
  store.applyUpsert(kept);
  store.applyUpsert(gone);
  const seq = store.beginWrite("fresh", "upsert");
  const fresh = item("fresh", "Fresh", at(18, 13), at(18, 14));
  store.applyUpsert(fresh);
  store.reconcileAll([kept]);
  assert.equal(store.getItem("fresh")?.title, "Fresh");
  assert.equal(store.getItem("gone"), undefined);
  assert.equal(store.getItem("kept")?.title, "Keep");
  store.settleWrite("fresh", seq, fresh);
  store.reconcileAll([kept]);
  assert.equal(store.getItem("fresh"), undefined);
}

//google purge only drops events that overlap the fetched range
{
  const store = createEventStore();
  const inside = overlay("inside", at(18, 9), at(18, 10));
  const outside = overlay("outside", at(20, 9), at(20, 10));
  const insideBusy: BusyBlock = { startUTC: at(18, 12), endUTC: at(18, 13) };
  const outsideBusy: BusyBlock = { startUTC: at(20, 12), endUTC: at(20, 13) };
  const wide = { rangeStartUTC: at(1, 0), rangeEndUTC: at(28, 0) };
  store.reconcileGoogleRange(wide, [inside, outside], [insideBusy, outsideBusy]);
  const outsideSnap = store.getDayBucket(dayKey(20));
  const october = { rangeStartUTC: at(18, 0), rangeEndUTC: at(19, 0) };
  store.reconcileGoogleRange(october, [], []);
  assert.equal(store.getDayBucket(dayKey(18)).google.length, 0);
  assert.equal(store.getDayBucket(dayKey(18)).busy.length, 0);
  assert.equal(store.getDayBucket(dayKey(20)), outsideSnap);
  assert.equal(outsideSnap.google[0]?.id, "outside");
  assert.equal(outsideSnap.busy.length, 1);
}

//a session still going after 6am sits on both local days. one that ends at 12:30am does not
{
  const store = createEventStore();
  store.applyUpsert(item("tournament", "Tournament", at(17, 18, 30), at(18, 8)));
  store.applyUpsert(item("badminton", "Badminton", at(17, 18, 30), at(18, 0, 30)));
  assert.deepEqual(store.dayIds(dayKey(17)), ["badminton", "tournament"]);
  assert.deepEqual(store.dayIds(dayKey(18)), ["tournament"]);
}

//an unchanged google chunk notifies nobody and keeps the day snapshot
{
  const store = createEventStore();
  const event = overlay("meet", at(18, 9), at(18, 10));
  const busy: BusyBlock = { startUTC: at(18, 11), endUTC: at(18, 12) };
  const range = { rangeStartUTC: at(18, 0), rangeEndUTC: at(19, 0) };
  store.reconcileGoogleRange(range, [event], [busy]);
  let notes = 0;
  const stop = store.subscribeGoogle(() => {
    notes += 1;
  });
  const snap = store.getDayBucket(dayKey(18));
  const list = store.getAllGoogle();
  store.reconcileGoogleRange(range, [{ ...event }], [{ ...busy }]);
  assert.equal(notes, 0);
  assert.equal(store.getDayBucket(dayKey(18)), snap);
  assert.equal(store.getAllGoogle(), list);
  stop();
}

//a failed google edit puts the snapshot card back
{
  const store = createEventStore();
  const event = overlay("meet", at(18, 9), at(18, 10));
  store.applyGoogleUpsert(event);
  const snapshot = store.findGoogle("g", "meet");
  assert.equal(snapshot?.title, "meet");
  store.applyGoogleUpsert({ ...event, title: "Moved" });
  assert.equal(store.findGoogle("g", "meet")?.title, "Moved");
  if (snapshot) store.applyGoogleUpsert(snapshot);
  assert.equal(store.findGoogle("g", "meet")?.title, "meet");
  store.applyGoogleRemove(event.id);
  assert.equal(store.findGoogle("g", "meet"), undefined);
  store.applyGoogleUpsert(event);
  assert.equal(store.getDayBucket(dayKey(18)).google.length, 1);
}

//showing a calendar wakes listeners and leaves the bucket object alone
{
  const store = createEventStore();
  store.applyUpsert(item("swim", "Swim", at(18, 9), at(18, 10)));
  const snap = store.getDayBucket(dayKey(18));
  let notes = 0;
  store.subscribeDay(dayKey(18), () => {
    notes += 1;
  });
  const unlisten = store.subscribeDay(dayKey(20), () => {
    notes += 10;
  });
  store.noteVisibility();
  assert.equal(notes, 11);
  assert.equal(store.getDayBucket(dayKey(18)), snap, "a visibility note does not copy the day");
  unlisten();
  store.noteVisibility();
  assert.equal(notes, 12, "a day with no listener stays quiet");
}

console.log("event store buckets, echo, and rollback");
