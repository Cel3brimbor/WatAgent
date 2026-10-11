"use client";

import { CommitTextInput } from "@/shared/responsive-text-input";

import { useMemo, useState } from "react";
import {
  KEYWORD_TASK_LIMITS,
  keywordTaskRuleLabel,
  keywordTasksOf,
  matchedKeyword,
  newKeywordTaskRule,
  type KeywordTaskRule,
  type KeywordTasks,
  type KeywordTaskSource,
} from "@/calendar/keyword-tasks";
import { smartTagTerms } from "@/calendar/smart-tags";
import { ChevronIcon } from "@/calendar/sidebar-icons";
import { Disclosure } from "@/shared/disclosure";
import { CheckIcon, PlusIcon } from "@/shared/icons";
import { Switch } from "@/shared/switch";

export type KeywordTaskCalendarOption = { id: string; name: string; group: "WatAgent" | "Imported" | "UWaterloo Events" | "Google" };

type Props = {
  config: KeywordTasks;
  onChange: (next: KeywordTasks) => void;
  calendars: KeywordTaskCalendarOption[];
  sources: KeywordTaskSource[];
};

export function KeywordTaskRules({ config, onChange, calendars, sources }: Props) {
  const { rules } = config;
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  //a deleted rule can come back until the next change
  const [removed, setRemoved] = useState<{ rule: KeywordTaskRule; index: number } | null>(null);
  const taskCount = useMemo(() => keywordTasksOf(config, sources).length, [config, sources]);

  function update(next: KeywordTaskRule[]) {
    setRemoved(null);
    onChange({ ...config, rules: next });
  }

  function patch(id: string, next: Partial<KeywordTaskRule>) {
    update(rules.map((rule) => (rule.id === id ? { ...rule, ...next } : rule)));
  }

  function add() {
    if (rules.length >= KEYWORD_TASK_LIMITS.rules) return;
    //imported school calendars are the usual place assignments come from
    const imported = calendars.filter((calendar) => calendar.group === "Imported").map((calendar) => calendar.id);
    const rule = newKeywordTaskRule(imported);
    update([...rules, rule]);
    setOpen(true);
    setEditingId(rule.id);
  }

  function remove(id: string) {
    const index = rules.findIndex((rule) => rule.id === id);
    if (index < 0) return;
    onChange({ ...config, rules: rules.filter((rule) => rule.id !== id) });
    setRemoved({ rule: rules[index], index });
    setEditingId(null);
  }

  function undoRemove() {
    if (!removed) return;
    const next = [...rules];
    next.splice(Math.min(removed.index, next.length), 0, removed.rule);
    update(next);
  }

  const nameOf = (id: string) => calendars.find((calendar) => calendar.id === id)?.name ?? "Removed calendar";
  const watched = [...new Set(rules.filter((rule) => rule.enabled).flatMap((rule) => rule.calendarIds))].map(nameOf);
  const deadlinesOn = config.includeDeadlines !== false;
  const deadlineNote = deadlinesOn ? "" : " · deadlines off";
  const summary =
    rules.length === 0
      ? deadlinesOn
        ? "Tasks you add always stay. Course deadlines stay on."
        : "Tasks you add always stay. Course deadlines are off."
      : watched.length === 0
        ? `Every rule is paused.${deadlineNote}`
        : `Watching ${watched.slice(0, 2).join(", ")}${watched.length > 2 ? ` +${watched.length - 2}` : ""} · ${taskCount} match${taskCount === 1 ? "" : "es"}${deadlineNote}`;

  return (
    <section className={`ktask-rules${open ? " is-open" : ""}`} aria-labelledby="ktask-rules-heading">
      <div className="ktask-rules-head">
        <button type="button" className="ktask-rules-toggle" aria-expanded={open} aria-controls="ktask-rules-body" onClick={() => setOpen((current) => !current)}>
          <span className="ktask-rules-text">
            <span id="ktask-rules-heading" className="ktask-rules-title">From your calendars</span>
            <span>{summary}</span>
          </span>
          <ChevronIcon open={open} />
        </button>
      </div>
      <Disclosure open={open} id="ktask-rules-body">
        <div className="ktask-rules-body">
          <div className="ktask-deadlines">
            <Switch
              id="ktask-deadlines"
              checked={deadlinesOn}
              aria-label="Include course deadlines"
              onChange={(includeDeadlines) => onChange({ ...config, includeDeadlines })}
            />
            <label htmlFor="ktask-deadlines">
              <strong>Course deadlines</strong>
              <small>End-of-day dues on LEARN and Portal stay in this list. This is on unless you turn it off.</small>
            </label>
          </div>
          <p className="ktask-always">Tasks you add always stay here, whether or not a rule matches.</p>
          {rules.length === 0 ? (
            <p className="ktask-empty">
              Pick calendars like LEARN and keywords like “assignment” or “quiz”. Each matching event shows up as a task, due when it starts. Color them from Smart tags in the side panel.
            </p>
          ) : (
            <ul className="ktask-rule-list">
              {rules.map((rule) => {
                const editing = editingId === rule.id;
                const label = keywordTaskRuleLabel(rule);
                const terms = smartTagTerms(rule.keywords);
                return (
                  <li key={rule.id} className={`ktask-rule${editing ? " is-editing" : ""}${rule.enabled ? "" : " is-paused"}`}>
                    <div className="ktask-rule-row">
                      <Switch checked={rule.enabled} onChange={(enabled) => patch(rule.id, { enabled })} aria-label={`${rule.enabled ? "Pause" : "Turn on"} ${label}`} />
                      <button type="button" className="ktask-rule-summary" aria-expanded={editing} onClick={() => setEditingId(editing ? null : rule.id)}>
                        <span className="ktask-rule-name">{label}</span>
                        <small>
                          {terms.length > 0 ? terms.slice(0, 4).join(", ") + (terms.length > 4 ? ` +${terms.length - 4}` : "") : "No keywords yet"}
                          {" · "}
                          {rule.calendarIds.length === 0
                            ? "no calendars picked"
                            : rule.calendarIds.length === 1
                              ? nameOf(rule.calendarIds[0])
                              : `${rule.calendarIds.length} calendars`}
                        </small>
                      </button>
                      <ChevronIcon open={editing} />
                    </div>
                    <Disclosure open={editing}>
                      <RuleEditor rule={rule} calendars={calendars} sources={sources} onPatch={(next) => patch(rule.id, next)} onDelete={() => remove(rule.id)} />
                    </Disclosure>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="ktask-rules-foot">
            {removed ? (
              <p className="ktask-undo" role="status">
                Deleted {keywordTaskRuleLabel(removed.rule)}.
                <button type="button" className="smart-tag-link" onClick={undoRemove}>Undo</button>
              </p>
            ) : <span />}
            <button type="button" className="ghost-btn" disabled={rules.length >= KEYWORD_TASK_LIMITS.rules} onClick={add}>
              <PlusIcon />
              New rule
            </button>
          </div>
        </div>
      </Disclosure>
    </section>
  );
}

function RuleEditor({
  rule,
  calendars,
  sources,
  onPatch,
  onDelete,
}: {
  rule: KeywordTaskRule;
  calendars: KeywordTaskCalendarOption[];
  sources: KeywordTaskSource[];
  onPatch: (next: Partial<KeywordTaskRule>) => void;
  onDelete: () => void;
}) {
  const matches = useMemo(() => sources.filter((source) => matchedKeyword(rule, source)).length, [rule, sources]);
  const groups = (["Imported", "UWaterloo Events", "Google", "WatAgent"] as const)
    .map((group) => ({ group, options: calendars.filter((calendar) => calendar.group === group) }))
    .filter((entry) => entry.options.length > 0);
  //a calendar that was removed stays picked until you clear it, so the rule doesn't silently change
  const missing = rule.calendarIds.filter((id) => !calendars.some((calendar) => calendar.id === id));

  function toggleCalendar(id: string, on: boolean) {
    const rest = rule.calendarIds.filter((entry) => entry !== id);
    onPatch({ calendarIds: on ? [...rest, id] : rest });
  }

  return (
    <div className="ktask-editor">
      <label className="ktask-field">
        <span>Name</span>
        <CommitTextInput
          type="text"
          className="smart-tag-input"
          value={rule.name}
          placeholder="e.g. Coursework"
          maxLength={KEYWORD_TASK_LIMITS.name}
          onCommit={(name) => onPatch({ name })}
        />
      </label>
      <label className="ktask-field">
        <span>Keywords</span>
        <CommitTextInput
          type="text"
          className="smart-tag-input"
          value={rule.keywords}
          placeholder="assignment, quiz, exam"
          maxLength={KEYWORD_TASK_LIMITS.keywords}
          spellCheck={false}
          onCommit={(keywords) => onPatch({ keywords })}
        />
        <small>Separate keywords with commas. Case doesn’t matter.</small>
      </label>
      <div className="ktask-field-row">
        <label className="ktask-field">
          <span>Look in</span>
          <select className="smart-tag-input" value={rule.field} onChange={(event) => onPatch({ field: event.target.value === "any" ? "any" : "title" })}>
            <option value="title">Event title</option>
            <option value="any">Title, location and description</option>
          </select>
        </label>
        <label className="ktask-field">
          <span>Due</span>
          <select className="smart-tag-input" value={rule.due} onChange={(event) => onPatch({ due: event.target.value === "end" ? "end" : "start" })}>
            <option value="start">When the event starts</option>
            <option value="end">When the event ends</option>
          </select>
        </label>
      </div>
      <fieldset className="ktask-calendars">
        <legend>Calendars</legend>
        {groups.length === 0 ? <p className="ktask-empty">No calendars yet. Import one from the Calendars tab.</p> : null}
        {groups.map(({ group, options }) => (
          <div key={group} className="ktask-calendar-group">
            <span className="ktask-calendar-group-label">{group}</span>
            <div className="ktask-chips">
              {options.map((calendar) => {
                const on = rule.calendarIds.includes(calendar.id);
                return (
                  <button
                    key={calendar.id}
                    type="button"
                    className={`ktask-chip${on ? " is-on" : ""}`}
                    aria-pressed={on}
                    onClick={() => toggleCalendar(calendar.id, !on)}
                  >
                    {on ? <CheckIcon /> : null}
                    {calendar.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {missing.length > 0 ? (
          <button type="button" className="smart-tag-link" onClick={() => onPatch({ calendarIds: rule.calendarIds.filter((id) => !missing.includes(id)) })}>
            Forget {missing.length === 1 ? "a removed calendar" : `${missing.length} removed calendars`}
          </button>
        ) : null}
      </fieldset>
      <div className="ktask-editor-foot">
        <span className="ktask-matches" aria-live="polite">
          {matches === 0 ? "No events match yet" : `${matches} event${matches === 1 ? "" : "s"} match`}
        </span>
        <button type="button" className="danger-btn" onClick={onDelete}>
          Delete rule
        </button>
      </div>
    </div>
  );
}
