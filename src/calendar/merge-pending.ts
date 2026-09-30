import type { PendingAiChange } from "@/calendar/approval-client";
import type { CalendarItemDoc } from "@/calendar/types";

function sortItems(items: CalendarItemDoc[]): CalendarItemDoc[] {
  return [...items].sort((a, b) => a.calendar.startUTC - b.calendar.startUTC);
}

export function mergePendingIntoItems(
  committed: CalendarItemDoc[],
  pending: PendingAiChange[],
): CalendarItemDoc[] {
  if (pending.length === 0) return committed;
  const bySource = new Map(pending.map((change) => [change.sourceId, change]));
  const existingIds = new Set(committed.map((item) => item.id));
  const merged: CalendarItemDoc[] = committed.map((item) => {
    const change = bySource.get(item.id);
    if (!change) return item;
    if (change.action === "delete") {
      return {
        ...item,
        pendingApproval: true,
        pendingChangeId: change.id,
        pendingAction: "delete",
      };
    }
    if (!change.calendar) return item;
    return {
      ...item,
      title: change.title,
      calendar: change.calendar,
      pendingApproval: true,
      pendingChangeId: change.id,
      pendingAction: "upsert",
    };
  });

  for (const change of pending) {
    if (change.action !== "upsert" || existingIds.has(change.sourceId) || !change.calendar) continue;
    merged.push({
      id: change.sourceId,
      title: change.title,
      calendar: change.calendar,
      createdAt: change.createdAt,
      updatedAt: change.createdAt,
      pendingApproval: true,
      pendingChangeId: change.id,
      pendingAction: "upsert",
    });
  }
  return sortItems(merged);
}
