export type MentionCalendar = {
  id: string;
  name: string;
  kind: "event" | "task";
  color: string;
  readOnly?: boolean;
  /** ics: ids of a merged calendar, so its chip can list those events. */
  memberIds?: string[];
};

const ATTACHABLE_ID =
  /^(events|tasks|google|cal-[0-9a-f-]{36}|merge-[0-9a-f-]{36}|ics:(learn|portal|other|feed-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))$/;
function tokenPattern(): RegExp {
  return /\uE000([^\uE001]{1,80})\uE001/g;
}

export function isAttachableCalendarId(id: string): boolean {
  return ATTACHABLE_ID.test(id);
}

export function calendarToken(id: string): string {
  return `\uE000${id}\uE001`;
}

export type MessagePiece = { kind: "text"; text: string } | { kind: "calendar"; id: string };

export function splitCalendarTokens(text: string): MessagePiece[] {
  const pieces: MessagePiece[] = [];
  let cursor = 0;
  for (const match of text.matchAll(tokenPattern())) {
    const index = match.index ?? 0;
    if (index > cursor) pieces.push({ kind: "text", text: text.slice(cursor, index) });
    const id = match[1] ?? "";
    if (isAttachableCalendarId(id)) pieces.push({ kind: "calendar", id });
    else pieces.push({ kind: "text", text: match[0] });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) pieces.push({ kind: "text", text: text.slice(cursor) });
  return pieces;
}

/** Chips already in the text stay put. Older messages stored ids beside the text, so those chips lead. */
export function messagePieces(content: string, calendarIds: string[] | undefined): MessagePiece[] {
  const pieces = splitCalendarTokens(content);
  const used = new Set(pieces.flatMap((piece) => (piece.kind === "calendar" ? [piece.id] : [])));
  const leading = (calendarIds ?? []).filter((id) => isAttachableCalendarId(id) && !used.has(id));
  return [...leading.map((id) => ({ kind: "calendar" as const, id })), ...pieces];
}

export function textForModel(text: string, nameOf: (id: string) => string): string {
  const named = text.replace(tokenPattern(), (_match, id: string) => `@${nameOf(id)}`);
  const words = named.replace(/@\S+/g, "").trim();
  if (!words) {
    const mentions = named.trim();
    return mentions ? `Use the attached calendar ${mentions}.` : "";
  }
  return named.replace(/[ \t]{2,}/g, " ").trim();
}

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
    if (!isAttachableCalendarId(id) || list.includes(id)) continue;
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
