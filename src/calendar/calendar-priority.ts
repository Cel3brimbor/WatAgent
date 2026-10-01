import type { CalendarNames, CalendarPriorityOrder } from "./types";

export const DEFAULT_CALENDAR_PRIORITY: CalendarPriorityOrder = ["learn", "portal"];

export function calendarPriorityOrderOf(raw: unknown, legacy?: unknown): CalendarPriorityOrder {
  if (Array.isArray(raw) && raw.length <= 2 && raw.every((source) => source === "learn" || source === "portal") && new Set(raw).size === raw.length) {
    return [...raw] as CalendarPriorityOrder;
  }
  return legacy === "portal" ? ["portal", "learn"] : [...DEFAULT_CALENDAR_PRIORITY];
}

export function showDuplicateEventsOf(raw: unknown, legacy?: unknown): boolean {
  return typeof raw === "boolean" ? raw : legacy === "show_all";
}

export function reorderCalendarPriority(order: CalendarPriorityOrder, active: string, over: string): CalendarPriorityOrder {
  if (active === over || !order.includes(active as typeof order[number]) || !order.includes(over as typeof order[number])) return order;
  const next = [...order];
  const from = next.indexOf(active as typeof order[number]);
  const to = next.indexOf(over as typeof order[number]);
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

export function calendarNamesOf(raw: unknown): CalendarNames {
  if (!raw || typeof raw !== "object") return {};
  const record = raw as Record<string, unknown>;
  const names: CalendarNames = {};
  for (const source of ["learn", "portal"] as const) {
    const value = record[source];
    if (typeof value === "string" && value.trim().length > 0 && value.trim().length <= 80) names[source] = value.trim();
  }
  return names;
}
