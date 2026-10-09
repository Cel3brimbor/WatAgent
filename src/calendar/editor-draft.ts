import type { CalendarDraft } from "@/calendar/calendar-item-editor";
import { localDayBounds } from "@/calendar/date-utils";
import { calendarIdField } from "@/calendar/local-calendars";
import type { CalendarItemDoc } from "@/calendar/types";

export const EDITOR_DRAFT_ID = "__editor_draft";

export function isEditorDraftId(id: string): boolean {
  return id === EDITOR_DRAFT_ID;
}

function draftDoc(draft: CalendarDraft, createdAt: number): CalendarItemDoc {
  return {
    id: draft.id ?? EDITOR_DRAFT_ID,
    title: draft.title.trim() || (draft.kind === "task" ? "Task" : "Event"),
    calendar: {
      kind: draft.kind,
      startUTC: draft.startUTC,
      endUTC: draft.endUTC,
      allDay: draft.allDay,
      completed: draft.kind === "task" ? Boolean(draft.completed) : undefined,
      calendarId: draft.calendarId ? calendarIdField(draft.calendarId) : undefined,
      location: draft.location?.replace(/\s+/g, " ").trim().slice(0, 300) || undefined,
      description: draft.description?.replace(/\r\n/g, "\n").trim().slice(0, 4000) || undefined,
    },
    createdAt,
    updatedAt: Date.now(),
    editorDraft: true,
  };
}

//keep the item visible behind the editor instead of dropping the drag preview when the modal opens
export function mergeEditorDraft(items: CalendarItemDoc[], draft: CalendarDraft | null): CalendarItemDoc[] {
  if (!draft || draft.google) return items;
  if (draft.id) {
    const existing = items.find((row) => row.id === draft.id);
    const createdAt = existing?.createdAt ?? Date.now();
    return items.map((row) => (row.id === draft.id ? { ...draftDoc(draft, createdAt), id: draft.id } : row));
  }
  const withoutGhost = items.filter((row) => !isEditorDraftId(row.id));
  return [...withoutGhost, draftDoc(draft, Date.now())];
}

export function timedDraftSlotForDay(
  draft: CalendarDraft | null,
  day: Date,
): { start: number; end: number } | null {
  if (!draft || draft.google || draft.allDay) return null;
  const { startDateUTC, endDateUTC } = localDayBounds(day);
  if (draft.endUTC <= startDateUTC || draft.startUTC >= endDateUTC) return null;
  const clampStart = Math.max(draft.startUTC, startDateUTC);
  const clampEnd = Math.min(draft.endUTC, endDateUTC);
  const startHour = Math.max(0, Math.min(23, Math.floor((clampStart - startDateUTC) / 3_600_000)));
  const endHour = Math.max(
    startHour,
    Math.min(23, Math.ceil((clampEnd - startDateUTC) / 3_600_000) - 1),
  );
  return { start: startHour, end: endHour };
}
