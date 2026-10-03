import { runRulesAfterSync } from "@/agent/rules/rules-client";
import { importCalendarLink, type CalendarImportProgress, type CalendarImportResult } from "@/calendar/client";
import { academicImportRange } from "@/calendar/calendar-import-panel";
import type { ImportedCalendar } from "@/calendar/types";

export function academicImportRangeUtc(): { rangeStartUTC: number; rangeEndUTC: number } {
  const { from, to } = academicImportRange(new Date());
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return { rangeStartUTC: +start, rangeEndUTC: +end };
}

export function formatFeedSyncSummary(
  name: string,
  result: Pick<CalendarImportResult, "added" | "updated" | "removed" | "unchanged">,
): string {
  if (result.added === 0 && result.updated === 0 && result.removed === 0) {
    return `${name} is up to date (${result.unchanged} unchanged).`;
  }
  return `${name}: ${result.added} added, ${result.updated} updated, ${result.removed} removed, ${result.unchanged} unchanged.`;
}

export async function syncImportedFeed(
  calendar: Pick<ImportedCalendar, "id" | "url">,
  onProgress?: (progress: CalendarImportProgress) => void,
): Promise<CalendarImportResult> {
  const { rangeStartUTC, rangeEndUTC } = academicImportRangeUtc();
  const result = await importCalendarLink({ url: calendar.url, feedId: calendar.id, rangeStartUTC, rangeEndUTC }, onProgress);
  //fresh events may be what an Agent rule is waiting for; they run in the background
  runRulesAfterSync(result.source);
  return result;
}

export function feedSyncProgressLabel(name: string, progress: CalendarImportProgress): string {
  if (progress.total == null) return `Opening ${name}…`;
  if (progress.total === 0) return `No events in range for ${name}.`;
  return `Syncing ${name}… ${progress.done} of ${progress.total}`;
}
