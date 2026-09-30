export const EXCLUDED_GOOGLE_CALENDAR_NAMES = new Set(["polaris"]);

export function isExcludedGoogleCalendarName(name: string | undefined): boolean {
  const trimmed = (name ?? "").trim().toLowerCase();
  return trimmed.length > 0 && EXCLUDED_GOOGLE_CALENDAR_NAMES.has(trimmed);
}
