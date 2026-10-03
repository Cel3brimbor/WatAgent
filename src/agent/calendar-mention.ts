import { isLocalCalendarId } from "@/calendar/local-calendars";

export type MentionCalendar = {
  id: string;
  name: string;
  kind: "event" | "task";
  color: string;
  readOnly?: boolean;
};

const MAX_ATTACHED = 8;

export function mentionAtCaret(text: string, caret: number): { start: number; query: string } | null {
  const safe = Math.max(0, Math.min(caret, text.length));
  const upto = text.slice(0, safe);
  const at = upto.lastIndexOf("@");
  if (at < 0) return null;
  const previous = at > 0 ? upto[at - 1] : "";
  if (previous && !/\s/.test(previous)) return null;
  const query = upto.slice(at + 1);
  if (/[\n\r]/.test(query) || query.length > 60) return null;
  return { start: at, query };
}

function scoreName(name: string, query: string): number {
  if (!query) return 1;
  const folded = name.toLowerCase();
  if (folded === query) return 100;
  if (folded.startsWith(query)) return 80;
  if (folded.includes(query)) return 60;
  let index = 0;
  for (const char of folded) {
    if (char === query[index]) index += 1;
    if (index === query.length) return 40;
  }
  return 0;
}

/** Empty query keeps calendar order. A query ranks prefix, then substring, then in-order characters. */
export function matchCalendars(calendars: MentionCalendar[], query: string, taken: string[] = []): MentionCalendar[] {
  const needle = query.trim().toLowerCase();
  const used = new Set(taken);
  const available = calendars.filter((calendar) => !used.has(calendar.id));
  if (!needle) return available;
  return available
    .map((calendar) => ({ calendar, score: scoreName(calendar.name, needle) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.calendar.name.localeCompare(b.calendar.name))
    .map((row) => row.calendar);
}

export function attachedIdsOf(ids: string[] | undefined): string[] | undefined {
  if (!ids?.length) return undefined;
  const list: string[] = [];
  for (const id of ids) {
    if (!isLocalCalendarId(id) || list.includes(id)) continue;
    list.push(id);
    if (list.length >= MAX_ATTACHED) break;
  }
  return list.length ? list : undefined;
}

export function stripMention(text: string, start: number, query: string): string {
  const token = `@${query}`;
  if (text.slice(start, start + token.length) !== token) return text;
  return `${text.slice(0, start)}${text.slice(start + token.length)}`.replace(/[ \t]{2,}/g, " ");
}
