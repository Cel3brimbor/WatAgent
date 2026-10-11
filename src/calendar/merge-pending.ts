import type { PendingAiChange } from "@/calendar/approval-client";
import type { CalendarItemDoc } from "@/calendar/types";

function sortItems(items: CalendarItemDoc[]): CalendarItemDoc[] {
  return [...items].sort((a, b) => a.calendar.startUTC - b.calendar.startUTC);
}

export function pendingChangesMatching(
  pending: PendingAiChange[],
  input: { ids?: string[]; all?: boolean },
): PendingAiChange[] {
  if (input.all) return pending;
  const ids = new Set(input.ids ?? []);
  return pending.filter((change) => ids.has(change.id));
}

/**apply approved proposals to committed items (no pending overlay fields).*/
export function commitApprovedPendingChanges(
  committed: CalendarItemDoc[],
  approved: PendingAiChange[],
): CalendarItemDoc[] {
  if (approved.length === 0) return committed;
  let next = committed;
  for (const change of approved) {
    if (change.action === "delete") {
      next = next.filter((row) => row.id !== change.sourceId);
      continue;
    }
    if (!change.calendar) continue;
    const existing = next.find((row) => row.id === change.sourceId);
    const now = Date.now();
    const doc: CalendarItemDoc = {
      id: change.sourceId,
      title: change.title,
      calendar: {
        ...change.calendar,
        googleEventId: existing?.calendar.googleEventId,
        icsImportId: existing?.calendar.icsImportId,
        importSource: existing?.calendar.importSource,
      },
      createdAt: existing?.createdAt ?? change.createdAt,
      updatedAt: now,
    };
    next = [...next.filter((row) => row.id !== change.sourceId), doc];
  }
  return sortItems(next);
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
        pendingVerb: "delete",
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
      pendingVerb: "edit",
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
      pendingVerb: "add",
    });
  }
  return sortItems(merged);
}
