import type { CalendarPriorityOrder, ImportedCalendarSource, TimelineItem } from "@/calendar/types";

export function normalizedCalendarTitle(title: string): string {
  return title.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

export function calendarSource(item: TimelineItem): ImportedCalendarSource | undefined {
  if (item.importSource) return item.importSource;
  const name = item.google?.calendarName ?? "";
  if (/\b(learn|brightspace|d2l)\b/i.test(name)) return "learn";
  if (/\bportal\b/i.test(name)) return "portal";
  return undefined;
}

function titleDayKey(item: TimelineItem): string {
  const date = new Date(item.startUTC);
  return `${normalizedCalendarTitle(item.title)}:${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// Hide the other source only; keep the underlying records and same-source distinct events intact.
export function dedupeCalendarTitles(items: TimelineItem[], order: CalendarPriorityOrder, showDuplicates = false): TimelineItem[] {
  const visible = items.filter((item) => {
    const source = calendarSource(item);
    return source !== "learn" && source !== "portal" || order.includes(source);
  });
  if (showDuplicates || order.length < 2) return visible;
  const priority = order[0];
  const preferred = new Set(visible.filter((item) => item.kind !== "task" && !item.editorDraft && !item.pendingApproval &&
    calendarSource(item) === priority && normalizedCalendarTitle(item.title)).map(titleDayKey));
  const other = priority === "learn" ? "portal" : "learn";
  return visible.filter((item) => item.kind === "task" || item.editorDraft || item.pendingApproval ||
    calendarSource(item) !== other || !preferred.has(titleDayKey(item)));
}
