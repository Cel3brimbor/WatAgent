import type { UserCalendarPreferencesV1 } from "@/calendar/calendar-preferences-doc";
import { apiJson } from "@/shared/api-base";

export type CalendarPreferencesResponse = {
  preferences: unknown;
  updatedAt: string;
};

export async function fetchCalendarPreferences(): Promise<CalendarPreferencesResponse> {
  const payload = await apiJson<Record<string, unknown>>("/api/calendar/preferences");
  return {
    preferences: payload.preferences,
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : "",
  };
}

export async function saveCalendarPreferences(
  doc: UserCalendarPreferencesV1,
): Promise<CalendarPreferencesResponse> {
  const payload = await apiJson<Record<string, unknown>>("/api/calendar/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(doc),
  });
  return {
    preferences: payload.preferences,
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : "",
  };
}
