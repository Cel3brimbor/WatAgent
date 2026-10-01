import type { CalendarLinks, CalendarNames, CalendarPriorityOrder, CalendarPrioritySource } from "./types";

const PRIORITY_SOURCES = new Set<CalendarPrioritySource>(["learn", "portal", "google"]);

export function isCalendarLink(value: string): boolean {
  return value.length <= 4096 && /^(https|webcal):\/\/\S+$/i.test(value);
}

export function detectCalendarLink(url: string): "learn" | "portal" | "other" {
  if (/\b(learn|brightspace|d2l)\b/i.test(url)) return "learn";
  if (/\bportal\b/i.test(url)) return "portal";
  return "other";
}

export function calendarLinksOf(raw: unknown): CalendarLinks {
  if (!raw || typeof raw !== "object") return {};
  const record = raw as Record<string, unknown>;
  const links: CalendarLinks = {};
  for (const source of ["learn", "portal", "other"] as const) {
    const value = typeof record[source] === "string" ? record[source].trim() : "";
    if (isCalendarLink(value)) links[source] = value;
  }
  return links;
}

export function calendarPriorityOrderOf(raw: unknown, legacy?: unknown): CalendarPriorityOrder {
  if (Array.isArray(raw) && raw.length <= 3 && raw.every((source) => PRIORITY_SOURCES.has(source as CalendarPrioritySource)) && new Set(raw).size === raw.length) {
    return [...raw] as CalendarPriorityOrder;
  }
  return legacy === "portal" ? ["portal", "learn"] : [];
}

//learn and portal join only after a saved link has finished importing. google joins once the account is linked.
export function activeCalendarPriority(
  order: CalendarPriorityOrder,
  links: CalendarLinks,
  googleConnected: boolean | null,
  imported: Partial<Record<"learn" | "portal", boolean>> = {},
): CalendarPriorityOrder {
  const ready = (source: "learn" | "portal") => Boolean(links[source] && imported[source]);
  const next = order.filter((source) => (source === "google" ? googleConnected !== false : ready(source)));
  for (const source of ["learn", "portal"] as const) {
    if (!ready(source) || next.includes(source)) continue;
    const googleAt = next.indexOf("google");
    if (googleAt === -1) next.push(source);
    else next.splice(googleAt, 0, source);
  }
  if (googleConnected === true && !next.includes("google")) next.push("google");
  return next;
}

export function sameCalendarPriority(a: CalendarPriorityOrder, b: CalendarPriorityOrder): boolean {
  return a.length === b.length && a.every((source, index) => source === b[index]);
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
