"use client";

import { useMemo, useState } from "react";
import {
  KEYWORD_TASK_LIMITS,
  keywordTaskRuleLabel,
  matchedKeyword,
  newKeywordTaskRule,
  type KeywordTaskRule,
  type KeywordTasks,
  type KeywordTaskSource,
} from "@/calendar/keyword-tasks";
import { smartTagTerms } from "@/calendar/smart-tags";
import { CheckIcon, PlusIcon } from "@/shared/icons";
import { Switch } from "@/shared/switch";

export type KeywordTaskCalendarOption = { id: string; name: string; group: "WatAgent" | "Imported" | "Google" };

type Props = {
  config: KeywordTasks;
  onChange: (next: KeywordTasks) => void;
  calendars: KeywordTaskCalendarOption[];
  sources: KeywordTaskSource[];
};

export function KeywordTaskRules({ config, onChange, calendars, sources }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const { rules } = config;

  function patch(id: string, next: Partial<KeywordTaskRule>) {
    onChange({ ...config, rules: rules.map((rule) => (rule.id === id ? { ...rule, ...next } : rule)) });
  }

  function add() {
    if (rules.length >= KEYWORD_TASK_LIMITS.rules) return;
    //imported school calendars are the usual place assignments come from
    const imported = calendars.filter((calendar) => calendar.group === "Imported").map((calendar) => calendar.id);
    const rule = newKeywordTaskRule(imported);
    onChange({ ...config, rules: [...rules, rule] });
    setEditingId(rule.id);
  }

  function remove(id: string) {
    onChange({ ...config, rules: rules.filter((rule) => rule.id !== id) });
    setEditingId(null);
  }

  const nameOf = (id: string) => calendars.find((calendar) => calendar.id === id)?.name ?? "Removed calendar";

  return (
    <section className="ktask-rules" aria-labelledby="ktask-rules-heading">
      <div className="ktask-rules-head">
        <div>
          <h3 id="ktask-rules-heading">From your calendars</h3>
          <p>Events on your chosen calendars that hold a keyword become tasks with due dates.</p>
        </div>
        <button type="button" className="ghost-btn" disabled={rules.length >= KEYWORD_TASK_LIMITS.rules} onClick={add}>
          <PlusIcon />
          New rule
        </button>
      </div>
      {rules.length === 0 ? (
        <p className="ktask-empty">
          Pick calendars like LEARN and keywords like “assignment” or “quiz”, and each matching event shows up here as a task.
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
                  <button type="button" className="ghost-btn ktask-edit" aria-expanded={editing} onClick={() => setEditingId(editing ? null : rule.id)}>
                    {editing ? "Done" : "Edit"}
                  </button>
                </div>
                {editing ? (
                  <RuleEditor rule={rule} calendars={calendars} sources={sources} onPatch={(next) => patch(rule.id, next)} onDelete={() => remove(rule.id)} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
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
  const groups = (["Imported", "Google", "WatAgent"] as const)
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
        <input
          type="text"
          className="smart-tag-input"
          value={rule.name}
          placeholder="e.g. Coursework"
          maxLength={KEYWORD_TASK_LIMITS.name}
          onChange={(event) => onPatch({ name: event.target.value })}
        />
      </label>
      <label className="ktask-field">
        <span>Keywords</span>
        <input
          type="text"
          className="smart-tag-input"
          value={rule.keywords}
          placeholder="assignment, quiz, exam"
          maxLength={KEYWORD_TASK_LIMITS.keywords}
          spellCheck={false}
          onChange={(event) => onPatch({ keywords: event.target.value })}
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
