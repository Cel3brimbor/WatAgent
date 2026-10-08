import { smartTagTerms } from "@/calendar/smart-tags";
import { uid } from "@/shared/ids";

/** Events on the chosen calendars whose text holds a keyword show as tasks, due when the event starts (or ends). */
export type KeywordTaskRule = {
  id: string;
  name: string;
  /** Comma-separated alternatives: "assignment, quiz" matches either word. */
  keywords: string;
  field: "title" | "any";
  /** Calendar ids as the side panel lists them: events, cal-…, ics:…, merge-… or a Google calendar id. */
  calendarIds: string[];
  due: "start" | "end";
  enabled: boolean;
};

export type KeywordTasks = { rules: KeywordTaskRule[]; doneKeys: string[] };

/** An event a rule can turn into a task. key stays the same across syncs so a checked-off task stays checked. */
export type KeywordTaskSource = {
  key: string;
  calendarId: string;
  /** The merged calendar this imported event shows under, which a rule can pick instead of the member. */
  mergedCalendarId?: string;
  title: string;
  startUTC: number;
  endUTC: number;
  allDay: boolean;
  location?: string;
  description?: string;
};

export type KeywordTask = {
  key: string;
  title: string;
  dueUTC: number;
  allDay: boolean;
  calendarId: string;
  keyword: string;
  ruleId: string;
  ruleName: string;
  done: boolean;
  source: KeywordTaskSource;
};

export const KEYWORD_TASK_LIMITS = { rules: 30, doneKeys: 1000, keywords: 300, name: 60 };

export const EMPTY_KEYWORD_TASKS: KeywordTasks = { rules: [], doneKeys: [] };

export const SUGGESTED_KEYWORDS = "assignment, quiz, exam, midterm, due, deadline, project, lab";

const STORAGE_KEY = "watagent.calendar.keywordTasks.v1";

export function newKeywordTaskRule(calendarIds: string[] = []): KeywordTaskRule {
  return { id: uid("ktask"), name: "", keywords: SUGGESTED_KEYWORDS, field: "title", calendarIds, due: "start", enabled: true };
}

export function keywordTaskRuleLabel(rule: KeywordTaskRule): string {
  const name = rule.name.trim();
  if (name) return name;
  const first = smartTagTerms(rule.keywords)[0];
  return first ? `“${first}”` : "Untitled rule";
}

function searchText(source: KeywordTaskSource, field: KeywordTaskRule["field"]): string {
  const parts = field === "title" ? [source.title] : [source.title, source.location ?? "", source.description ?? ""];
  return parts.join("\n").toLowerCase();
}

/** The first keyword the event holds, or null. */
export function matchedKeyword(rule: KeywordTaskRule, source: KeywordTaskSource): string | null {
  const picked = rule.calendarIds.includes(source.calendarId)
    || (source.mergedCalendarId != null && rule.calendarIds.includes(source.mergedCalendarId));
  if (!picked) return null;
  const text = searchText(source, rule.field);
  return smartTagTerms(rule.keywords).find((term) => text.includes(term)) ?? null;
}

/**late school deadlines, already chosen, become tasks due at the deadline*/
export function deadlineTasksOf(sources: KeywordTaskSource[], doneKeys: string[]): KeywordTask[] {
  const done = new Set(doneKeys);
  return sources
    .map((source) => ({
      key: source.key,
      title: source.title,
      dueUTC: source.startUTC,
      allDay: false,
      calendarId: source.calendarId,
      keyword: "deadline",
      ruleId: "deadline",
      ruleName: "Due",
      done: done.has(source.key),
      source,
    }))
    .sort((a, b) => a.dueUTC - b.dueUTC || a.title.localeCompare(b.title));
}

/** One task per event, from the first enabled rule that matches it, soonest due first. */
export function keywordTasksOf(config: KeywordTasks, sources: KeywordTaskSource[]): KeywordTask[] {
  const rules = config.rules.filter((rule) => rule.enabled && rule.calendarIds.length > 0 && smartTagTerms(rule.keywords).length > 0);
  if (rules.length === 0) return [];
  const done = new Set(config.doneKeys);
  const seen = new Set<string>();
  const tasks: KeywordTask[] = [];
  for (const source of sources) {
    if (seen.has(source.key)) continue;
    for (const rule of rules) {
      const keyword = matchedKeyword(rule, source);
      if (!keyword) continue;
      seen.add(source.key);
      tasks.push({
        key: source.key,
        title: source.title,
        dueUTC: rule.due === "end" ? source.endUTC : source.startUTC,
        allDay: source.allDay,
        calendarId: source.calendarId,
        keyword,
        ruleId: rule.id,
        ruleName: keywordTaskRuleLabel(rule),
        done: done.has(source.key),
        source,
      });
      break;
    }
  }
  return tasks.sort((a, b) => a.dueUTC - b.dueUTC || a.title.localeCompare(b.title));
}

/** Checking a task off keeps its key; the oldest keys fall off past the limit. */
export function withKeywordTaskDone(config: KeywordTasks, key: string, done: boolean): KeywordTasks {
  const rest = config.doneKeys.filter((entry) => entry !== key);
  const doneKeys = done ? [...rest, key].slice(-KEYWORD_TASK_LIMITS.doneKeys) : rest;
  return { ...config, doneKeys };
}

function text(raw: unknown, max: number): string {
  return typeof raw === "string" ? raw.slice(0, max) : "";
}

function ruleOf(raw: unknown): KeywordTaskRule | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  return {
    id: text(rec.id, 100) || uid("ktask"),
    name: text(rec.name, KEYWORD_TASK_LIMITS.name),
    keywords: text(rec.keywords, KEYWORD_TASK_LIMITS.keywords),
    field: rec.field === "any" ? "any" : "title",
    calendarIds: Array.isArray(rec.calendarIds)
      ? [...new Set(rec.calendarIds.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 1024))].slice(0, 200)
      : [],
    due: rec.due === "end" ? "end" : "start",
    enabled: rec.enabled !== false,
  };
}

export function parseKeywordTasksFromUnknown(raw: unknown): KeywordTasks {
  if (!raw || typeof raw !== "object") return EMPTY_KEYWORD_TASKS;
  const rec = raw as Record<string, unknown>;
  const rules = Array.isArray(rec.rules)
    ? rec.rules.flatMap((entry) => {
        const rule = ruleOf(entry);
        return rule ? [rule] : [];
      })
    : [];
  const doneKeys = Array.isArray(rec.doneKeys)
    ? [...new Set(rec.doneKeys.filter((key): key is string => typeof key === "string" && key.length > 0 && key.length <= 1100))]
    : [];
  return { rules: rules.slice(0, KEYWORD_TASK_LIMITS.rules), doneKeys: doneKeys.slice(-KEYWORD_TASK_LIMITS.doneKeys) };
}

export function readKeywordTasks(): KeywordTasks {
  if (typeof window === "undefined") return EMPTY_KEYWORD_TASKS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? parseKeywordTasksFromUnknown(JSON.parse(raw) as unknown) : EMPTY_KEYWORD_TASKS;
  } catch {
    return EMPTY_KEYWORD_TASKS;
  }
}

export function writeKeywordTasks(config: KeywordTasks): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    return;
  }
}
