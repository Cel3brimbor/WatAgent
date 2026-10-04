import { CALENDAR_PALETTE, HEX_COLOR } from "@/calendar/preferences";
import { uid } from "@/shared/ids";

export type SmartTagField = "title" | "location" | "description" | "any";

export type SmartTagOperator = "contains" | "not_contains" | "is" | "starts_with" | "ends_with" | "regex";

export type SmartTagRule = {
  id: string;
  field: SmartTagField;
  operator: SmartTagOperator;
  value: string;
};

/** How much of a matching event the tag color paints. Half and quarter stay left of the diagonal. */
export type SmartTagCover = "full" | "half" | "quarter";

export type SmartTag = {
  id: string;
  name: string;
  color: string;
  enabled: boolean;
  match: "any" | "all";
  cover: SmartTagCover;
  rules: SmartTagRule[];
  exemptCalendarIds: string[];
};

/** What a smart tag can see about an event. */
export type SmartTagTarget = {
  calendarId: string;
  title: string;
  location?: string;
  description?: string;
};

export type SmartTagHit = { id: string; name: string; color: string; cover: SmartTagCover };

export type SmartTagMatcher = (target: SmartTagTarget) => SmartTagHit | null;

export const SMART_TAG_FIELDS: Array<{ id: SmartTagField; label: string }> = [
  { id: "title", label: "Title" },
  { id: "location", label: "Location" },
  { id: "description", label: "Description" },
  { id: "any", label: "Any field" },
];

export const SMART_TAG_COVERS: Array<{ id: SmartTagCover; label: string; hint: string }> = [
  { id: "quarter", label: "Quarter", hint: "Tag color on a quarter of the event, left of the diagonal" },
  { id: "half", label: "Half", hint: "Tag color on the left of the diagonal" },
  { id: "full", label: "Full", hint: "Tag color fills the event" },
];

export const SMART_TAG_OPERATORS: Array<{ id: SmartTagOperator; label: string }> = [
  { id: "contains", label: "contains" },
  { id: "not_contains", label: "doesn't contain" },
  { id: "is", label: "is exactly" },
  { id: "starts_with", label: "starts with" },
  { id: "ends_with", label: "ends with" },
  { id: "regex", label: "matches regex" },
];

const STORAGE_KEY = "watagent.calendar.smartTags.v1";
const MAX_TAGS = 50;
const MAX_RULES = 20;
const MAX_VALUE = 300;
const MAX_NAME = 60;
const FIELDS = new Set<SmartTagField>(SMART_TAG_FIELDS.map((field) => field.id));
const OPERATORS = new Set<SmartTagOperator>(SMART_TAG_OPERATORS.map((operator) => operator.id));
const COVERS = new Set<SmartTagCover>(SMART_TAG_COVERS.map((cover) => cover.id));

export function smartTagLabel(tag: SmartTag): string {
  const name = tag.name.trim();
  if (name) return name;
  const firstValue = tag.rules.find((rule) => rule.value.trim())?.value.trim();
  return firstValue ? `“${firstValue}”` : "Untitled tag";
}

/** Comma-separated values are alternatives: "gym, run" matches either word. */
export function smartTagTerms(value: string): string[] {
  return value
    .split(",")
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);
}

export function smartTagPatternError(value: string): string | null {
  if (!value.trim()) return null;
  try {
    new RegExp(value.trim(), "i");
    return null;
  } catch {
    return "This pattern isn't a valid regular expression.";
  }
}

function fieldTexts(target: SmartTagTarget, field: SmartTagField): string[] {
  if (field === "title") return [target.title];
  if (field === "location") return [target.location ?? ""];
  if (field === "description") return [target.description ?? ""];
  return [target.title, target.location ?? "", target.description ?? ""];
}

const TERM_TESTS: Record<Exclude<SmartTagOperator, "regex" | "not_contains">, (text: string, term: string) => boolean> = {
  contains: (text, term) => text.includes(term),
  is: (text, term) => text === term,
  starts_with: (text, term) => text.startsWith(term),
  ends_with: (text, term) => text.endsWith(term),
};

function compileRule(rule: SmartTagRule): ((target: SmartTagTarget) => boolean) | null {
  const raw = rule.value.trim();
  if (!raw) return null;
  if (rule.operator === "regex") {
    let pattern: RegExp;
    try {
      pattern = new RegExp(raw, "i");
    } catch {
      return null;
    }
    return (target) => fieldTexts(target, rule.field).some((text) => pattern.test(text));
  }
  const terms = smartTagTerms(raw);
  if (terms.length === 0) return null;
  const lowered = (target: SmartTagTarget) => fieldTexts(target, rule.field).map((text) => text.trim().toLowerCase());
  if (rule.operator === "not_contains") {
    return (target) => {
      const texts = lowered(target);
      return !terms.some((term) => texts.some((text) => text.includes(term)));
    };
  }
  const test = TERM_TESTS[rule.operator];
  return (target) => {
    const texts = lowered(target);
    return texts.some((text) => terms.some((term) => test(text, term)));
  };
}

/** Ignores `enabled` so the editor can preview a paused tag. */
export function compileSmartTag(tag: SmartTag): ((target: SmartTagTarget) => boolean) | null {
  const rules = tag.rules.flatMap((rule) => {
    const compiled = compileRule(rule);
    return compiled ? [compiled] : [];
  });
  if (rules.length === 0) return null;
  const exempt = new Set(tag.exemptCalendarIds);
  const matchAll = tag.match === "all";
  return (target) => {
    if (exempt.has(target.calendarId)) return false;
    return matchAll ? rules.every((rule) => rule(target)) : rules.some((rule) => rule(target));
  };
}

/** The first enabled tag (in list order) that matches wins. */
export function compileSmartTags(tags: SmartTag[]): SmartTagMatcher {
  const compiled = tags.flatMap((tag) => {
    if (!tag.enabled) return [];
    const test = compileSmartTag(tag);
    return test
      ? [{ hit: { id: tag.id, name: smartTagLabel(tag), color: tag.color, cover: tag.cover }, test }]
      : [];
  });
  if (compiled.length === 0) return () => null;
  return (target) => compiled.find((entry) => entry.test(target))?.hit ?? null;
}

export function newSmartTagRule(): SmartTagRule {
  return { id: uid("rule"), field: "title", operator: "contains", value: "" };
}

export function newSmartTag(existing: SmartTag[]): SmartTag {
  const used = new Set(existing.map((tag) => tag.color));
  const preferred = ["#f83a22", "#16a765", "#4986e7", "#ffad46", "#a47ae2", "#f691b2", "#42d692", "#ac725e"];
  const color =
    preferred.find((candidate) => !used.has(candidate)) ??
    CALENDAR_PALETTE.find((candidate) => !used.has(candidate)) ??
    preferred[existing.length % preferred.length];
  return {
    id: uid("tag"),
    name: "",
    color,
    enabled: true,
    match: "any",
    cover: "half",
    rules: [newSmartTagRule()],
    exemptCalendarIds: [],
  };
}

function text(raw: unknown, max: number): string {
  return typeof raw === "string" ? raw.slice(0, max) : "";
}

function ruleOf(raw: unknown): SmartTagRule | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  return {
    id: text(rec.id, 100) || uid("rule"),
    field: FIELDS.has(rec.field as SmartTagField) ? (rec.field as SmartTagField) : "title",
    operator: OPERATORS.has(rec.operator as SmartTagOperator) ? (rec.operator as SmartTagOperator) : "contains",
    value: text(rec.value, MAX_VALUE),
  };
}

function tagOf(raw: unknown): SmartTag | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const color = typeof rec.color === "string" && HEX_COLOR.test(rec.color) ? rec.color.toLowerCase() : null;
  if (!color) return null;
  const rules = Array.isArray(rec.rules)
    ? rec.rules.flatMap((rule) => {
        const parsed = ruleOf(rule);
        return parsed ? [parsed] : [];
      })
    : [];
  return {
    id: text(rec.id, 100) || uid("tag"),
    name: text(rec.name, MAX_NAME),
    color,
    enabled: rec.enabled !== false,
    match: rec.match === "all" ? "all" : "any",
    //tags saved before coverage existed painted the whole event
    cover: COVERS.has(rec.cover as SmartTagCover) ? (rec.cover as SmartTagCover) : "full",
    rules: rules.slice(0, MAX_RULES),
    exemptCalendarIds: Array.isArray(rec.exemptCalendarIds)
      ? rec.exemptCalendarIds
          .filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 1024)
          .slice(0, 200)
      : [],
  };
}

export const SMART_TAG_LIMITS = { tags: MAX_TAGS, rules: MAX_RULES, value: MAX_VALUE, name: MAX_NAME };

export function parseSmartTagsFromUnknown(raw: unknown): SmartTag[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((entry) => {
      const tag = tagOf(entry);
      return tag ? [tag] : [];
    })
    .slice(0, MAX_TAGS);
}

export function readSmartTags(): SmartTag[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return parseSmartTagsFromUnknown(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export function writeSmartTags(tags: SmartTag[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
  } catch {
    return;
  }
}
