import { externalCalendarId } from "@/calendar/external-calendars";
import { HEX_COLOR } from "@/calendar/preferences";
import type { ImportedCalendar } from "@/calendar/types";
import { campusCalendarsOf } from "@/campus/campus-events";

export const CAMPUS_COLOR_PREFIX = "campus:";

export type CampusSubscriptionPref = { categoryId: string; color?: string };

const CATEGORY_ID = /^[a-z][a-z-]{0,39}$/;

export function campusColorKey(categoryId: string): string {
  return `${CAMPUS_COLOR_PREFIX}${categoryId}`;
}

/** Enabled UWaterloo category calendars and their stable colors for calendar preferences sync. */
export function campusSubscriptionsOf(
  imported: ImportedCalendar[],
  colorOverrides: Record<string, string>,
): CampusSubscriptionPref[] {
  return campusCalendarsOf(imported).flatMap((entry) => {
    if (entry.categories.length !== 1) return [];
    const categoryId = entry.categories[0];
    const feedKey = externalCalendarId(entry.calendar.id);
    const color = colorOverrides[feedKey] ?? colorOverrides[campusColorKey(categoryId)];
    if (color && !HEX_COLOR.test(color)) return [{ categoryId }];
    return [{ categoryId, ...(color ? { color: color.toLowerCase() } : {}) }];
  });
}

export function parseCampusSubscriptions(raw: unknown): CampusSubscriptionPref[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const list: CampusSubscriptionPref[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const categoryId = typeof rec.categoryId === "string" ? rec.categoryId : "";
    if (!CATEGORY_ID.test(categoryId) || seen.has(categoryId)) continue;
    seen.add(categoryId);
    const color = typeof rec.color === "string" && HEX_COLOR.test(rec.color) ? rec.color.toLowerCase() : undefined;
    list.push({ categoryId, ...(color ? { color } : {}) });
  }
  return list.slice(0, 40);
}

export function campusSubscriptionsMatch(imported: ImportedCalendar[], subs: CampusSubscriptionPref[]): boolean {
  const wanted = new Set(subs.map((sub) => sub.categoryId));
  const current = campusCalendarsOf(imported).flatMap((entry) => (entry.categories.length === 1 ? [entry.categories[0]] : []));
  if (wanted.size !== current.length) return false;
  for (const id of current) if (!wanted.has(id)) return false;
  return true;
}

export function colorOverridesWithCampusSubscriptions(
  overrides: Record<string, string>,
  subs: CampusSubscriptionPref[],
): Record<string, string> {
  const next = { ...overrides };
  for (const sub of subs) {
    if (!sub.color) continue;
    next[campusColorKey(sub.categoryId)] = sub.color;
  }
  return next;
}

export function withCampusFeedColor(
  overrides: Record<string, string>,
  categoryId: string,
  feedCalendarId: string,
): Record<string, string> {
  const stable = overrides[campusColorKey(categoryId)];
  if (!stable) return overrides;
  return { ...overrides, [feedCalendarId]: stable };
}

const STORAGE_KEY = "watagent.calendar.campusSubscriptions.v1";

export function readCampusSubscriptions(): CampusSubscriptionPref[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return parseCampusSubscriptions(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeCampusSubscriptions(subs: CampusSubscriptionPref[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(subs));
  } catch {
    return;
  }
}
