"use client";

import { useNowMs } from "@/calendar/calendar-item-editor";
import { nowLineTop } from "@/calendar/calendar-grid";

//the 30s tick stays inside this line so the day column does not re-render
export function NowLine({ dayStartMs, hourPx }: { dayStartMs: number; hourPx: number }) {
  const now = useNowMs();
  const top = nowLineTop(now, dayStartMs, hourPx);
  if (top == null) return null;
  return <div className="calendar-now-line" style={{ top }} />;
}
