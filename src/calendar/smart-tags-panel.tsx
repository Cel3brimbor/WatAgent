"use client";

import { useMemo, useRef, useState } from "react";
import { CALENDAR_PALETTE } from "@/calendar/preferences";
import {
  SMART_TAG_FIELDS,
  SMART_TAG_LIMITS,
  SMART_TAG_OPERATORS,
  compileSmartTag,
  newSmartTag,
  newSmartTagRule,
  smartTagLabel,
  smartTagPatternError,
  type SmartTag,
  type SmartTagField,
  type SmartTagOperator,
  type SmartTagRule,
  type SmartTagTarget,
} from "@/calendar/smart-tags";
import { CheckIcon, ChevronIcon, DotsIcon, GoogleCalendarIcon, PlusIcon } from "@/calendar/sidebar-icons";
import { ArrowDownIcon, ArrowUpIcon, CloseIcon } from "@/shared/icons";
import { Disclosure } from "@/shared/disclosure";
import { useFlip } from "@/shared/use-flip";

export type SmartTagCalendarOption = { id: string; name: string; google: boolean };

type Props = {
  tags: SmartTag[];
  onChange: (next: SmartTag[]) => void;
  calendars: SmartTagCalendarOption[];
  samples: SmartTagTarget[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SmartTagsPanel({ tags, onChange, calendars, samples, open, onOpenChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useFlip(listRef, tags.map((tag) => tag.id).join("|"));

  function patch(id: string, next: Partial<SmartTag>) {
    onChange(tags.map((tag) => (tag.id === id ? { ...tag, ...next } : tag)));
  }

  function add() {
    if (tags.length >= SMART_TAG_LIMITS.tags) return;
    const tag = newSmartTag(tags);
    onChange([...tags, tag]);
    setEditingId(tag.id);
    onOpenChange(true);
  }

  function remove(id: string) {
    onChange(tags.filter((tag) => tag.id !== id));
    setEditingId(null);
  }

  function move(id: string, delta: -1 | 1) {
    const index = tags.findIndex((tag) => tag.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= tags.length) return;
    const next = [...tags];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <section className="side-cal-list smart-tags">
      <div className="smart-tags-head">
        <button
          type="button"
          className="side-cal-heading"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          <span>Smart tags</span>
          <ChevronIcon open={open} />
        </button>
        <button
          type="button"
          className="smart-tags-add"
          aria-label="New smart tag"
          title="New smart tag"
          disabled={tags.length >= SMART_TAG_LIMITS.tags}
          onClick={add}
        >
          <PlusIcon />
        </button>
      </div>
      <Disclosure open={open}>
        {tags.length === 0 ? (
          <div className="smart-tags-empty">
            <p>Color events automatically by words in their title, location, or description.</p>
            <button type="button" className="smart-tag-link" onClick={add}>
              New smart tag
            </button>
          </div>
        ) : (
          <ul ref={listRef}>
            {tags.map((tag, index) => {
              const editing = editingId === tag.id;
              const label = smartTagLabel(tag);
              return (
                <li key={tag.id} data-flip-id={tag.id} className={`smart-tag${editing ? " is-editing" : ""}`}>
                  <div className={`side-cal-row${tag.enabled ? "" : " is-paused"}`}>
                    <button
                      type="button"
                      className={`side-cal-check${tag.enabled ? " is-on" : ""}`}
                      style={{ color: tag.color, background: tag.enabled ? tag.color : "transparent" }}
                      aria-pressed={tag.enabled}
                      aria-label={`${tag.enabled ? "Pause" : "Turn on"} ${label}`}
                      onClick={() => patch(tag.id, { enabled: !tag.enabled })}
                    >
                      {tag.enabled ? <CheckIcon /> : null}
                    </button>
                    <button
                      type="button"
                      className="side-cal-name smart-tag-name"
                      aria-expanded={editing}
                      onClick={() => setEditingId(editing ? null : tag.id)}
                    >
                      {label}
                    </button>
                    <button
                      type="button"
                      className="side-cal-more"
                      aria-label={`Edit ${label}`}
                      aria-expanded={editing}
                      onClick={() => setEditingId(editing ? null : tag.id)}
                    >
                      <DotsIcon />
                    </button>
                  </div>
                  {editing ? (
                    <SmartTagEditor
                      tag={tag}
                      first={index === 0}
                      last={index === tags.length - 1}
                      calendars={calendars}
                      samples={samples}
                      onPatch={(next) => patch(tag.id, next)}
                      onMove={(delta) => move(tag.id, delta)}
                      onDelete={() => remove(tag.id)}
                      onDone={() => setEditingId(null)}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Disclosure>
    </section>
  );
}

function SmartTagEditor({
  tag,
  first,
  last,
  calendars,
  samples,
  onPatch,
  onMove,
  onDelete,
  onDone,
}: {
  tag: SmartTag;
  first: boolean;
  last: boolean;
  calendars: SmartTagCalendarOption[];
  samples: SmartTagTarget[];
  onPatch: (next: Partial<SmartTag>) => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
  onDone: () => void;
}) {
  const [skipOpen, setSkipOpen] = useState(tag.exemptCalendarIds.length > 0);
  const matched = useMemo(() => {
    const test = compileSmartTag(tag);
    return test ? samples.filter(test).length : 0;
  }, [tag, samples]);
  const hasRuleValue = tag.rules.some((rule) => rule.value.trim());
  const exemptCount = tag.exemptCalendarIds.length;
  const color = tag.color.toLowerCase();

  function patchRule(id: string, next: Partial<SmartTagRule>) {
    onPatch({ rules: tag.rules.map((rule) => (rule.id === id ? { ...rule, ...next } : rule)) });
  }

  function toggleExempt(id: string, exempt: boolean) {
    const rest = tag.exemptCalendarIds.filter((item) => item !== id);
    onPatch({ exemptCalendarIds: exempt ? [...rest, id] : rest });
  }

  return (
    <div className="smart-tag-editor">
      <input
        type="text"
        className="smart-tag-input"
        value={tag.name}
        placeholder="Tag name (e.g. Workouts)"
        aria-label="Tag name"
        maxLength={SMART_TAG_LIMITS.name}
        autoFocus={!tag.name}
        onChange={(event) => onPatch({ name: event.target.value })}
      />

      <div className="side-cal-swatches smart-tag-swatches" role="group" aria-label="Tag color">
        {CALENDAR_PALETTE.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className={`side-cal-swatch${color === swatch ? " is-current" : ""}`}
            style={{ background: swatch }}
            aria-label={swatch}
            aria-pressed={color === swatch}
            onClick={() => onPatch({ color: swatch })}
          />
        ))}
      </div>
      <label className="smart-tag-custom-color">
        <input type="color" value={color} onChange={(event) => onPatch({ color: event.target.value.toLowerCase() })} />
        <span>Custom color</span>
      </label>

      <div className="smart-tag-section-label">
        {tag.rules.length > 1 ? (
          <>
            <span>Match</span>
            <select
              value={tag.match}
              aria-label="Match mode"
              onChange={(event) => onPatch({ match: event.target.value === "all" ? "all" : "any" })}
            >
              <option value="any">any rule</option>
              <option value="all">all rules</option>
            </select>
          </>
        ) : (
          <span>When an event’s</span>
        )}
      </div>

      <ul className="smart-tag-rules">
        {tag.rules.map((rule) => {
          const error = rule.operator === "regex" ? smartTagPatternError(rule.value) : null;
          return (
            <li key={rule.id} className="smart-tag-rule">
              <div className="smart-tag-rule-row">
                <select
                  value={rule.field}
                  aria-label="Field"
                  onChange={(event) => patchRule(rule.id, { field: event.target.value as SmartTagField })}
                >
                  {SMART_TAG_FIELDS.map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.label}
                    </option>
                  ))}
                </select>
                <select
                  value={rule.operator}
                  aria-label="Condition"
                  onChange={(event) => patchRule(rule.id, { operator: event.target.value as SmartTagOperator })}
                >
                  {SMART_TAG_OPERATORS.map((operator) => (
                    <option key={operator.id} value={operator.id}>
                      {operator.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="smart-tag-rule-row is-value">
                <input
                  type="text"
                  className={`smart-tag-input${error ? " is-invalid" : ""}`}
                  value={rule.value}
                  placeholder={rule.operator === "regex" ? "e.g. ^(gym|run)\\b" : "e.g. gym, workout, run"}
                  aria-label="Text to match"
                  aria-invalid={Boolean(error)}
                  maxLength={SMART_TAG_LIMITS.value}
                  spellCheck={false}
                  onChange={(event) => patchRule(rule.id, { value: event.target.value })}
                />
                {tag.rules.length > 1 ? (
                  <button
                    type="button"
                    className="smart-tag-icon-btn"
                    aria-label="Remove rule"
                    onClick={() => onPatch({ rules: tag.rules.filter((item) => item.id !== rule.id) })}
                  >
                    <CloseIcon />
                  </button>
                ) : null}
              </div>
              {error ? <p className="smart-tag-error">{error}</p> : null}
            </li>
          );
        })}
      </ul>
      {tag.rules.length < SMART_TAG_LIMITS.rules ? (
        <button
          type="button"
          className="smart-tag-link"
          onClick={() => onPatch({ rules: [...tag.rules, newSmartTagRule()] })}
        >
          Add rule
        </button>
      ) : null}

      <div className="smart-tag-skip">
        <button
          type="button"
          className="smart-tag-link"
          aria-expanded={skipOpen}
          onClick={() => setSkipOpen((value) => !value)}
        >
          {exemptCount > 0 ? `Skipping ${exemptCount} calendar${exemptCount === 1 ? "" : "s"}` : "Skip calendars…"}
        </button>
        <Disclosure open={skipOpen}>
          <ul className="smart-tag-skip-list">
            {calendars.map((calendar) => (
              <li key={calendar.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={tag.exemptCalendarIds.includes(calendar.id)}
                    onChange={(event) => toggleExempt(calendar.id, event.target.checked)}
                  />
                  {calendar.google ? <GoogleCalendarIcon /> : null}
                  <span>{calendar.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </Disclosure>
      </div>

      <p className="smart-tag-hint">
        {hasRuleValue
          ? `Matches ${matched} loaded event${matched === 1 ? "" : "s"}${tag.enabled ? "" : " (paused)"}.`
          : "Separate words with commas to match any of them."}{" "}
        Colors only show in WatAgent.
      </p>

      <div className="smart-tag-actions">
        <button type="button" className="smart-tag-icon-btn" aria-label="Move up" title="Higher priority" disabled={first} onClick={() => onMove(-1)}>
          <ArrowUpIcon />
        </button>
        <button type="button" className="smart-tag-icon-btn" aria-label="Move down" title="Lower priority" disabled={last} onClick={() => onMove(1)}>
          <ArrowDownIcon />
        </button>
        <button type="button" className="smart-tag-delete" onClick={onDelete}>
          Delete
        </button>
        <button type="button" className="smart-tag-done" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
