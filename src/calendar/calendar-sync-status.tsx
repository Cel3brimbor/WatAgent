import type { CalendarImportProgress } from "@/calendar/client";

/**same meter + label as settings imported calendars*/
export function CalendarSyncStatus({
  label,
  progress,
}: {
  label: string;
  progress: Pick<CalendarImportProgress, "done" | "total">;
}) {
  const open = progress.total == null;
  return (
    <div className="calendar-import-status calendar-priority-sync-status" role="status">
      <progress
        className="calendar-import-meter"
        aria-label={label}
        {...(open || progress.total == null ? {} : { value: progress.done, max: Math.max(progress.total, 1) })}
      />
      <p className="modal-hint">{label}</p>
    </div>
  );
}
