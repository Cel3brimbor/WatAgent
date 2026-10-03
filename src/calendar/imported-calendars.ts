import { isFeedId, type ImportedCalendar, type ImportedCalendarSource, type MergedCalendar } from "./types";

export function isCalendarLink(value: string): boolean {
  return value.length <= 4096 && /^(https|webcal):\/\/\S+$/i.test(value);
}

export function detectCalendarLink(url: string): "learn" | "portal" | "other" {
  if (/\b(learn|brightspace|d2l)\b/i.test(url)) return "learn";
  if (/\bportal\b/i.test(url)) return "portal";
  return "other";
}

const DETECTED_NAMES = { learn: "LEARN / Brightspace", portal: "Portal", other: "Imported calendar" } as const;

export function importedCalendarId(source: string): string {
  return `ics:${source}`;
}

/** The feed behind an ics:<feed> calendar id. */
export function feedOfCalendarId(id: string): ImportedCalendarSource | null {
  const feed = id.startsWith("ics:") ? id.slice(4) : "";
  return isFeedId(feed) ? feed : null;
}

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

export function newFeedId(): ImportedCalendarSource {
  return `feed-${uuid()}`;
}

export function newMergedCalendarId(): string {
  return `merge-${uuid()}`;
}

/** A name for a new link: what it was detected as, numbered when that name is taken. */
export function defaultImportedName(url: string, existing: Pick<ImportedCalendar, "name">[]): string {
  const base = DETECTED_NAMES[detectCalendarLink(url)];
  const taken = new Set(existing.map((calendar) => calendar.name));
  if (!taken.has(base)) return base;
  for (let count = 2; ; count += 1) {
    if (!taken.has(`${base} ${count}`)) return `${base} ${count}`;
  }
}

function linkOf(raw: unknown): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  return isCalendarLink(value) ? value : null;
}

/**
 * Saved calendar links. Before importedCalendars existed, links and names lived in fixed
 * learn/portal/other slots, so a doc without the list reads those instead.
 */
export function importedCalendarsOf(raw: unknown, legacyLinks?: unknown, legacyNames?: unknown): ImportedCalendar[] {
  if (Array.isArray(raw)) {
    const seen = new Set<string>();
    const list: ImportedCalendar[] = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const rec = entry as Record<string, unknown>;
      const url = linkOf(rec.url);
      const name = typeof rec.name === "string" ? rec.name.trim().slice(0, 80) : "";
      if (!isFeedId(rec.id) || seen.has(rec.id) || !url || !name) continue;
      seen.add(rec.id);
      list.push({ id: rec.id, name, url });
    }
    return list.slice(0, 50);
  }
  const links = legacyLinks && typeof legacyLinks === "object" ? (legacyLinks as Record<string, unknown>) : {};
  const names = legacyNames && typeof legacyNames === "object" ? (legacyNames as Record<string, unknown>) : {};
  return (["learn", "portal", "other"] as const).flatMap((id) => {
    const url = linkOf(links[id]);
    if (!url) return [];
    const custom = typeof names[id] === "string" ? (names[id] as string).trim().slice(0, 80) : "";
    return [{ id, name: custom || DETECTED_NAMES[id], url }];
  });
}

/** Each imported calendar joins one merged calendar at most, and a merged calendar needs two members. */
export function mergedCalendarsOf(raw: unknown): MergedCalendar[] {
  if (!Array.isArray(raw)) return [];
  const taken = new Set<string>();
  const ids = new Set<string>();
  const list: MergedCalendar[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const id = typeof rec.id === "string" && /^merge-[0-9a-f-]{36}$/.test(rec.id) ? rec.id : "";
    const name = typeof rec.name === "string" ? rec.name.trim().slice(0, 80) : "";
    if (!id || ids.has(id) || !name || !Array.isArray(rec.members)) continue;
    const members = [
      ...new Set(rec.members.filter((member): member is string => typeof member === "string" && feedOfCalendarId(member) != null)),
    ].filter((member) => !taken.has(member));
    if (members.length < 2) continue;
    members.forEach((member) => taken.add(member));
    ids.add(id);
    list.push({ id, name, members: members.slice(0, 50) });
  }
  return list.slice(0, 50);
}

//a fixed id, so migrating the same doc twice can't make two copies
export const LEGACY_MERGED_ID = "merge-00000000-0000-4000-8000-000000000001";

/**
 * Before merged calendars, LEARN and Portal were ranked and the lower one's duplicate copies hidden.
 * That becomes one merged calendar in the same order, so the calendar looks the same after the change.
 */
export function legacyMergedCalendars(order: unknown, showDuplicates: unknown, legacy: unknown, imported: ImportedCalendar[]): MergedCalendar[] {
  const show = typeof showDuplicates === "boolean" ? showDuplicates : legacy === "show_all";
  if (show) return [];
  const ranked = Array.isArray(order) ? order : legacy === "portal" ? ["portal", "learn"] : ["learn", "portal"];
  const feeds = ranked.filter((source): source is "learn" | "portal" => source === "learn" || source === "portal");
  if (!feeds.includes("learn")) feeds.push("learn");
  if (!feeds.includes("portal")) feeds.push("portal");
  if (!feeds.every((feed) => imported.some((calendar) => calendar.id === feed))) return [];
  const name = feeds.map((feed) => imported.find((calendar) => calendar.id === feed)!.name).join(" + ");
  return [{ id: LEGACY_MERGED_ID, name: name.slice(0, 80), members: feeds.map(importedCalendarId) }];
}

/** The merged calendar an imported calendar belongs to, by ics:<feed> id. */
export function mergedByMember(merged: MergedCalendar[]): Map<string, MergedCalendar> {
  const out = new Map<string, MergedCalendar>();
  for (const calendar of merged) for (const member of calendar.members) out.set(member, calendar);
  return out;
}
