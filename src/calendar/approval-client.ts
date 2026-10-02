import { apiJson } from "@/shared/api-base";
import { parseCalendarMeta, type CalendarItemMeta } from "@/calendar/types";
import type { ColorSchemePreference, TeaThemeId } from "@/shared/tea-theme";

export type PendingAiChange = {
  id: string;
  sourceId: string;
  action: "upsert" | "delete";
  title: string;
  calendar?: CalendarItemMeta;
  previousTitle?: string;
  previousCalendar?: CalendarItemMeta;
  createdAt: number;
};

function pendingOf(raw: unknown): PendingAiChange | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string" || typeof rec.sourceId !== "string") return null;
  if (rec.action !== "upsert" && rec.action !== "delete") return null;
  const calendar = rec.action === "upsert" ? parseCalendarMeta(rec.calendar) : undefined;
  return {
    id: rec.id,
    sourceId: rec.sourceId,
    action: rec.action,
    title: typeof rec.title === "string" ? rec.title.slice(0, 200) : "Calendar item",
    calendar,
    previousTitle: typeof rec.previousTitle === "string" ? rec.previousTitle.slice(0, 200) : undefined,
    previousCalendar: parseCalendarMeta(rec.previousCalendar),
    createdAt: Number(rec.createdAt) || Date.now(),
  };
}

const TEA_THEME_IDS = new Set([
  "earl-grey",
  "lady-grey",
  "assam",
  "ceylon",
  "matcha",
  "sunrouge",
  "hojicha",
  "sakura",
  "yuzu",
  "omija",
  "longjing",
  "jasmine",
  "puerh",
  "tieguanyin",
]);

function teaThemeOf(raw: unknown): TeaThemeId | null {
  return typeof raw === "string" && TEA_THEME_IDS.has(raw) ? (raw as TeaThemeId) : null;
}

function colorSchemeOf(raw: unknown): ColorSchemePreference | null {
  return raw === "light" || raw === "dark" || raw === "system" ? raw : null;
}

export type CalendarSettings = {
  requireAiApproval: boolean;
  teaTheme: TeaThemeId | null;
  colorScheme: ColorSchemePreference | null;
};

export async function getCalendarSettings(): Promise<CalendarSettings> {
  const payload = await apiJson<Record<string, unknown>>("/api/calendar/settings");
  return {
    requireAiApproval: payload.requireAiApproval === true,
    teaTheme: teaThemeOf(payload.teaTheme),
    colorScheme: colorSchemeOf(payload.colorScheme),
  };
}

export async function patchCalendarSettings(patch: {
  requireAiApproval?: boolean;
  teaTheme?: TeaThemeId | null;
  colorScheme?: ColorSchemePreference | null;
}): Promise<CalendarSettings> {
  const payload = await apiJson<Record<string, unknown>>("/api/calendar/settings", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return {
    requireAiApproval: payload.requireAiApproval === true,
    teaTheme: teaThemeOf(payload.teaTheme),
    colorScheme: colorSchemeOf(payload.colorScheme),
  };
}

export async function setRequireAiApproval(requireAiApproval: boolean): Promise<void> {
  await patchCalendarSettings({ requireAiApproval });
}

export async function listPendingChanges(): Promise<PendingAiChange[]> {
  const payload = await apiJson<{ items?: unknown }>("/api/calendar/pending-changes");
  if (!Array.isArray(payload.items)) return [];
  return payload.items.map(pendingOf).filter((item): item is PendingAiChange => item != null);
}

function timeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export async function approvePending(input: { ids?: string[]; all?: boolean }): Promise<void> {
  await apiJson("/api/calendar/pending-changes/approve", {
    method: "POST",
    body: JSON.stringify({ ...input, timeZone: timeZone() }),
  });
}

export async function rejectPending(input: { ids?: string[]; all?: boolean }): Promise<void> {
  await apiJson("/api/calendar/pending-changes/reject", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
