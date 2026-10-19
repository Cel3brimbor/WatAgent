"use client";

import { CommitTextInput } from "@/shared/responsive-text-input";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CALENDAR_PALETTE } from "@/calendar/preferences";
import {
  SMART_TAG_COVERS,
  SMART_TAG_FIELDS,
  SMART_TAG_LIMITS,
  SMART_TAG_OPERATORS,
  compileSmartTag,
  newSmartTag,
  newSmartTagRule,
  smartTagGlance,
  smartTagLabel,
  smartTagPatternError,
  type SmartTag,
  type SmartTagField,
  type SmartTagOperator,
  type SmartTagRule,
  type SmartTagTarget,
} from "@/calendar/smart-tags";
import { ChevronIcon, GoogleCalendarIcon, PlusIcon } from "@/calendar/sidebar-icons";
import { ArrowDownIcon, ArrowUpIcon, CloseIcon } from "@/shared/icons";
import { Disclosure } from "@/shared/disclosure";
import { Expandable } from "@/shared/expandable";
import { SegmentedControl } from "@/shared/segmented-control";
import { Switch } from "@/shared/switch";
import { useFlip } from "@/shared/use-flip";

export type SmartTagCalendarOption = { id: string; name: string; google: boolean };

type Props = {
  tags: SmartTag[];
  onChange: (next: SmartTag[]) => void;
  calendars: SmartTagCalendarOption[];
  samples: SmartTagTarget[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupOn?: boolean;
  onToggleGroup?: (on: boolean) => void;
  heading?: string;
  emptyCopy?: string;
  footnote?: string;
  namePlaceholder?: string;
};

export function SmartTagsPanel({
  tags,
  onChange,
  calendars,
  samples,
  open,
  onOpenChange,
  groupOn = true,
  onToggleGroup,
  heading = "Smart tags",
  emptyCopy = "Color events automatically by words in their title, location, or description.",
  footnote = "Colors only show in WatAgent.",
  namePlaceholder = "Tag name (e.g. Workouts)",
}: Props) {
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
    <section className="smart-tags">
      <div className="smart-tags-head">
        <button
          type="button"
          className="smart-tags-title"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          <span className="smart-tags-title-text">
            <span className="smart-tags-heading">{heading}</span>
            {onToggleGroup && !groupOn ? <span className="smart-tags-paused">Paused</span> : null}
          </span>
          <ChevronIcon open={open} />
        </button>
        {onToggleGroup ? (
          <Switch
            checked={groupOn}
            onChange={onToggleGroup}
            aria-label={`${groupOn ? "Pause" : "Turn on"} every smart tag`}
          />
        ) : null}
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
            <p>{emptyCopy}</p>
            <button type="button" className="smart-tag-link" onClick={add}>
              New smart tag
            </button>
          </div>
        ) : (
          <ul className="smart-tag-list" ref={listRef}>
            {tags.map((tag, index) => {
              const editing = editingId === tag.id;
              const label = smartTagLabel(tag);
              const live = groupOn && tag.enabled;
              return (
                <li
                  key={tag.id}
                  data-flip-id={tag.id}
                  className={`smart-tag${editing ? " is-editing" : ""}${live ? "" : " is-paused"}`}
                  style={{ "--tag-color": tag.color } as CSSProperties}
                >
                  <div className="smart-tag-row">
                    <button
                      type="button"
                      className={`smart-tag-lens${live ? " is-on" : ""}`}
                      aria-pressed={live}
                      aria-label={
                        groupOn
                          ? `${tag.enabled ? "Pause" : "Turn on"} ${label}`
                          : `${label} stays paused until smart tags are on`
                      }
                      disabled={!groupOn}
                      onClick={() => patch(tag.id, { enabled: !tag.enabled })}
                    />
                    <button
                      type="button"
                      className="smart-tag-open"
                      aria-expanded={editing}
                      onClick={() => setEditingId(editing ? null : tag.id)}
                    >
                      <span className="smart-tag-name">{label}</span>
                      <span className="smart-tag-glance">{smartTagGlance(tag)}</span>
                    </button>
                  </div>
                  <Expandable open={editing}>
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
                      footnote={footnote}
                      namePlaceholder={namePlaceholder}
                    />
                  </Expandable>
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
  footnote,
  namePlaceholder,
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
  footnote: string;
  namePlaceholder: string;
}) {
  const [skipOpen, setSkipOpen] = useState(tag.exemptCalendarIds.length > 0);
  const matched = useMemo(() => {
    const test = compileSmartTag(tag);
    return test ? samples.filter(test).length : 0;
  }, [tag, samples]);
  const hasRuleValue = tag.rules.some((rule) => rule.value.trim());
  const exemptCount = tag.exemptCalendarIds.length;
  const color = tag.color.toLowerCase();
  const custom = !CALENDAR_PALETTE.some((swatch) => swatch === color);

  function patchRule(id: string, next: Partial<SmartTagRule>) {
    onPatch({ rules: tag.rules.map((rule) => (rule.id === id ? { ...rule, ...next } : rule)) });
  }

  function toggleExempt(id: string, exempt: boolean) {
    const rest = tag.exemptCalendarIds.filter((item) => item !== id);
    onPatch({ exemptCalendarIds: exempt ? [...rest, id] : rest });
  }

  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    //the editor mounts while the disclosure is still inert, so wait until it can take a caret
    const root = editorRef.current;
    if (!root) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        const input = root.querySelector<HTMLInputElement>("input");
        if (!input || input.value || root.closest("[inert]")) return;
        input.focus();
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  return (
    <div className="smart-tag-editor" ref={editorRef}>
      <CommitTextInput
        type="text"
        className="smart-tag-input smart-tag-name-input"
        value={tag.name}
        placeholder={namePlaceholder}
        aria-label="Tag name"
        maxLength={SMART_TAG_LIMITS.name}
        onCommit={(name) => onPatch({ name })}
      />

      <div className="smart-tag-field">
        <span>Color</span>
        <div className="smart-tag-colors" role="group" aria-label="Tag color">
          {CALENDAR_PALETTE.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className={`smart-tag-color${color === swatch ? " is-current" : ""}`}
              style={{ background: swatch }}
              aria-label={swatch}
              aria-pressed={color === swatch}
              onClick={() => onPatch({ color: swatch })}
            />
          ))}
          <label className={`smart-tag-custom${custom ? " is-current" : ""}`} title="Custom color">
            <input
              type="color"
              value={color}
              aria-label="Custom color"
              onChange={(event) => onPatch({ color: event.target.value.toLowerCase() })}
            />
            {custom ? null : <span className="smart-tag-custom-mark" aria-hidden="true" />}
          </label>
        </div>
      </div>

      <div className="smart-tag-field">
        <span>Paint</span>
        <SegmentedControl
          className="smart-tag-cover"
          label="How much of the event the tag colors"
          value={tag.cover ?? "full"}
          options={SMART_TAG_COVERS.map((option) => ({
            value: option.id,
            label: option.label,
            hint: option.hint,
          }))}
          onChange={(cover) => onPatch({ cover })}
        />
      </div>

      {tag.rules.length > 1 ? (
        <div className="smart-tag-field">
          <span>Match</span>
          <SegmentedControl
            label="Match mode"
            value={tag.match}
            options={[
              { value: "any", label: "Any rule" },
              { value: "all", label: "All rules" },
            ]}
            onChange={(match) => onPatch({ match })}
          />
        </div>
      ) : null}

      <div className="smart-tag-field">
        <span>{tag.rules.length > 1 ? "Rules" : "When an event’s"}</span>
        <ul className="smart-tag-rules">
          {tag.rules.map((rule, ruleIndex) => {
            const error = rule.operator === "regex" ? smartTagPatternError(rule.value) : null;
            return (
              <li key={rule.id} className="smart-tag-rule">
                {ruleIndex > 0 ? (
                  <span className="smart-tag-joiner">{tag.match === "all" ? "and" : "or"}</span>
                ) : null}
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
                  <CommitTextInput
                    type="text"
                    className={`smart-tag-input${error ? " is-invalid" : ""}`}
                    value={rule.value}
                    placeholder={rule.operator === "regex" ? "e.g. ^(gym|run)\\b" : "e.g. gym, workout, run"}
                    aria-label="Text to match"
                    aria-invalid={Boolean(error)}
                    maxLength={SMART_TAG_LIMITS.value}
                    spellCheck={false}
                    onCommit={(value) => patchRule(rule.id, { value })}
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
      </div>
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
        {footnote}
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
