import assert from "node:assert/strict";
import { dateKey, monthDays } from "./editor-date-picker";
for (const [year, month, count] of [[2024, 1, 29], [2026, 1, 28], [2026, 2, 31], [2026, 10, 30], [2026, 11, 31]]) {
  const days = monthDays(new Date(year, month, 1));
  assert.equal(days.length, 42);
  assert.equal(days[0].getDay(), 1);
  assert.equal(new Set(days.map(dateKey)).size, 42);
  assert.equal(days.filter(date => date.getMonth() === month && date.getFullYear() === year).length, count);
  for (let i = 1; i < days.length; i++) {
    const next = new Date(days[i - 1]); next.setDate(next.getDate() + 1);
    assert.equal(dateKey(days[i]), dateKey(next), "Calendar remains consecutive across DST and year boundaries");
  }
}
console.log("Date picker checks passed: leap years, month boundaries, DST, and complete weeks.");
