import assert from "node:assert/strict";
import type { CalendarItemDoc } from "@/calendar/types";
import { aggregateTimeline } from "./timeline";

process.env.TZ = "America/Toronto";

const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();

function event(id: string, startUTC: number, endUTC: number): CalendarItemDoc {
  return {
    id,
    title: id,
    createdAt: 0,
    updatedAt: 0,
    calendar: { kind: "event", startUTC, endUTC, allDay: false },
  };
}

const ids = (day: number, events: CalendarItemDoc[]) =>
  aggregateTimeline({ focus: new Date(2026, 9, day), events }).map((item) => item.id);

//6:30pm Saturday through 12:30am Sunday stays on Saturday
const overnight = event("badminton", at(17, 18, 30), at(18, 0, 30));
assert.deepEqual(ids(17, [overnight]), ["badminton"]);
assert.deepEqual(ids(18, [overnight]), []);

//warrior-rec feed stamps for the same session (Toronto)
const cif = event("cif", Date.parse("2026-10-17T22:30:00Z"), Date.parse("2026-10-18T04:30:00Z"));
const pac = event("pac", Date.parse("2026-10-18T01:30:00Z"), Date.parse("2026-10-18T04:30:00Z"));
assert.deepEqual(ids(17, [cif, pac]), ["cif", "pac"]);
assert.deepEqual(ids(18, [cif, pac]), []);

//still going after morning shows on the next day too
const late = event("tournament", at(17, 18, 30), at(18, 8));
assert.deepEqual(ids(17, [late]), ["tournament"]);
assert.deepEqual(ids(18, [late]), ["tournament"]);

//a same-day session is unchanged
const daytime = event("swim", at(18, 9), at(18, 10));
assert.deepEqual(ids(18, [daytime, overnight]), ["swim"]);

console.log("overnight sessions stay on the day they start");
