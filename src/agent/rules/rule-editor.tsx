"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import {
  createAgentRule,
  previewAgentRule,
  updateAgentRule,
  type AgentRule,
  type AgentRuleDraft,
  type RuleFeed,
  type RulePreview,
  type RuleProposal,
} from "@/agent/rules/rules-client";
import { Switch } from "@/shared/switch";
import { externalCalendarId } from "@/calendar/external-calendars";
import { useDialog } from "@/shared/use-dialog";

export type RuleEditorCalendar = { id: string; name: string; kind: "event" | "task"; readOnly: boolean };

type Props = {
  /** The rule being edited; absent for a new one. */
  rule?: AgentRule;
  /** Starting values for a new rule, such as the feed and calendar a line was drawn between. */
  initial?: Partial<AgentRuleDraft>;
  feeds: Array<{ feed: RuleFeed; name: string }>;
  calendars: RuleEditorCalendar[];
  /** False when the Agent can't see that calendar yet. */
  agentCanSee?: (calendarId: string) => boolean;
  onAllowAccess?: (calendarId: string) => void;
  //false while the exit transition plays
  open?: boolean;
  onCancel: () => void;
  onSaved: (rule: AgentRule) => void;
};

const LOOKAHEAD = [7, 14, 21, 30, 60];

const WHEN = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const TIME = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function whenOf(proposal: RuleProposal): string {
  const day = new Date(`${proposal.date}T12:00:00`);
  if (proposal.allDay || !proposal.startTime) return `${WHEN.format(day)}, all day`;
  const start = new Date(`${proposal.date}T${proposal.startTime}:00`);
  const end = proposal.endTime ? new Date(`${proposal.date}T${proposal.endTime}:00`) : null;
  return `${WHEN.format(start)}, ${TIME.format(start)}${end ? `–${TIME.format(end)}` : ""}`;
}

function previewHeadline(preview: RulePreview): string {
  if (preview.matched === 0) return "No upcoming events match right now, so nothing would be added yet.";
  const changes = preview.added + preview.updated;
  const matched = `${preview.matched} upcoming event${preview.matched === 1 ? "" : "s"} match`;
  if (changes === 0) return `${matched}. The Agent wouldn't add anything for them.`;
  return `${matched}. The Agent would ${preview.updated ? "add or update" : "add"} ${changes}:`;
}

//a draft can be previewed before it's saved: the Agent runs it once and nothing is written
export function RuleEditor({ rule, initial, feeds, calendars, agentCanSee, onAllowAccess, open = true, onCancel, onSaved }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const fieldId = useId();
  useDialog(ref, { open, onEscape: onCancel, initialFocus: nameRef });

  const writable = calendars.filter((calendar) => !calendar.readOnly);
  const [name, setName] = useState(rule?.name ?? initial?.name ?? "");
  const [sourceFeed, setSourceFeed] = useState<RuleFeed>(rule?.sourceFeed ?? initial?.sourceFeed ?? feeds[0]?.feed ?? "learn");
  const [targetCalendarId, setTargetCalendarId] = useState(
    rule?.targetCalendarId ?? initial?.targetCalendarId ?? writable[0]?.id ?? "events",
  );
  const [titleContains, setTitleContains] = useState(rule?.titleContains ?? initial?.titleContains ?? "");
  const [instruction, setInstruction] = useState(rule?.instruction ?? initial?.instruction ?? "");
  const [lookaheadDays, setLookaheadDays] = useState(rule?.lookaheadDays ?? initial?.lookaheadDays ?? 21);
  const [requireApproval, setRequireApproval] = useState(rule?.requireApproval ?? true);
  const [preview, setPreview] = useState<{ result: RulePreview; draft: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<Set<"name" | "instruction">>(new Set());

  const draft: AgentRuleDraft = {
    name: name.trim(),
    sourceFeed,
    targetCalendarId,
    instruction: instruction.trim(),
    titleContains: titleContains.trim() || null,
    lookaheadDays,
    requireApproval,
  };
  const draftKey = JSON.stringify(draft);
  const stale = preview != null && preview.draft !== draftKey;
  const target = calendars.find((calendar) => calendar.id === targetCalendarId);
  const blocked = [
    agentCanSee && !agentCanSee(externalCalendarId(sourceFeed))
      ? { id: externalCalendarId(sourceFeed), name: feeds.find((feed) => feed.feed === sourceFeed)?.name ?? "the watched calendar" }
      : null,
    agentCanSee && !agentCanSee(targetCalendarId)
      ? { id: targetCalendarId, name: target?.name ?? "the destination" }
      : null,
  ].filter((entry): entry is { id: string; name: string } => entry != null);
  const moved = rule != null && (rule.sourceFeed !== sourceFeed || rule.targetCalendarId !== targetCalendarId);

  function check(): boolean {
    const gaps = new Set<"name" | "instruction">();
    if (!draft.name) gaps.add("name");
    if (!draft.instruction) gaps.add("instruction");
    setMissing(gaps);
    return gaps.size === 0;
  }

  async function runPreview() {
    if (!check() || previewing || blocked.length > 0) return;
    setPreviewing(true);
    setError(null);
    try {
      setPreview({ result: await previewAgentRule({ ...draft, id: rule?.id }), draft: draftKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The preview didn't finish. Try again.");
    } finally {
      setPreviewing(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!check() || saving || blocked.length > 0) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(rule ? await updateAgentRule(rule.id, draft) : await createAgentRule(draft));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The rule wasn't saved. Try again.");
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" data-state={open ? "open" : "closed"} inert={!open} onClick={onCancel}>
      <div
        ref={ref}
        className="modal rule-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>{rule ? "Edit Agent rule" : "New Agent rule"}</h2>
        <p className="modal-hint">
          The Agent follows this whenever the feed syncs, adding only to the calendar you choose.
        </p>
        <form className="rule-editor-form" onSubmit={(event) => void submit(event)} noValidate>
          <label className="calendar-editor-field" htmlFor={`${fieldId}-name`}>
            Name
            <input
              ref={nameRef}
              id={`${fieldId}-name`}
              className="calendar-editor-input"
              value={name}
              maxLength={60}
              placeholder="Study blocks"
              aria-invalid={missing.has("name") || undefined}
              onChange={(event) => {
                setName(event.target.value);
                if (missing.has("name")) setMissing((gaps) => new Set([...gaps].filter((gap) => gap !== "name")));
              }}
            />
            {missing.has("name") ? <span className="rule-editor-error">Give the rule a name.</span> : null}
          </label>
          <div className="rule-editor-pair">
            <label className="calendar-editor-field" htmlFor={`${fieldId}-feed`}>
              Watch
              <select
                id={`${fieldId}-feed`}
                className="calendar-editor-input calendar-editor-select"
                value={sourceFeed}
                onChange={(event) => setSourceFeed(event.target.value as RuleFeed)}
              >
                {feeds.map((feed) => (
                  <option key={feed.feed} value={feed.feed}>
                    {feed.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="calendar-editor-field" htmlFor={`${fieldId}-target`}>
              Add to
              <select
                id={`${fieldId}-target`}
                className="calendar-editor-input calendar-editor-select"
                value={targetCalendarId}
                onChange={(event) => setTargetCalendarId(event.target.value)}
              >
                {targetCalendarId === "tasks" ? <option value="tasks">Agent Main</option> : null}
                {calendars.filter((calendar) => targetCalendarId !== "tasks" || calendar.id !== "events").map((calendar) => (
                  <option key={calendar.id} value={calendar.id} disabled={calendar.readOnly}>
                    {calendar.readOnly ? `${calendar.name} (read only)` : calendar.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {blocked.length > 0 ? (
            <div className="rule-editor-access">
              <p className="modal-hint">
                The Agent can’t see {blocked.map((entry) => entry.name).join(" or ")}. Allow access before this rule can be saved.
              </p>
              {blocked.map((entry) => (
                <button key={entry.id} type="button" className="ghost-btn" onClick={() => onAllowAccess?.(entry.id)}>
                  Allow access to {entry.name}
                </button>
              ))}
            </div>
          ) : null}
          <label className="calendar-editor-field" htmlFor={`${fieldId}-instruction`}>
            What should the Agent do?
            <textarea
              id={`${fieldId}-instruction`}
              className="calendar-editor-input calendar-editor-area"
              rows={3}
              maxLength={1000}
              value={instruction}
              placeholder={
                target?.kind === "task"
                  ? "Add a to-do a week before each exam to start reviewing."
                  : "Add a 2-hour study block the evening before each quiz."
              }
              aria-invalid={missing.has("instruction") || undefined}
              onChange={(event) => {
                setInstruction(event.target.value);
                if (missing.has("instruction")) setMissing((gaps) => new Set([...gaps].filter((gap) => gap !== "instruction")));
              }}
            />
            {missing.has("instruction") ? <span className="rule-editor-error">Tell the Agent what to do.</span> : null}
          </label>
          <div className="rule-editor-pair">
            <label className="calendar-editor-field" htmlFor={`${fieldId}-filter`}>
              Only titles containing
              <input
                id={`${fieldId}-filter`}
                className="calendar-editor-input"
                value={titleContains}
                maxLength={100}
                placeholder="quiz"
                onChange={(event) => setTitleContains(event.target.value)}
              />
            </label>
            <label className="calendar-editor-field" htmlFor={`${fieldId}-ahead`}>
              Look ahead
              <select
                id={`${fieldId}-ahead`}
                className="calendar-editor-input calendar-editor-select"
                value={lookaheadDays}
                onChange={(event) => setLookaheadDays(Number(event.target.value))}
              >
                {[...new Set([...LOOKAHEAD, lookaheadDays])].sort((a, b) => a - b).map((days) => (
                  <option key={days} value={days}>
                    {days} days
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="settings-toggle rule-editor-toggle">
            <label htmlFor={`${fieldId}-approval`}>Ask before adding</label>
            <Switch
              id={`${fieldId}-approval`}
              checked={requireApproval}
              aria-describedby={`${fieldId}-approval-hint`}
              onChange={setRequireApproval}
            />
          </div>
          <p id={`${fieldId}-approval-hint`} className="modal-hint">
            {requireApproval
              ? "What the rule adds waits in the approval queue until you say yes."
              : "What the rule adds goes straight onto your calendar."}
          </p>
          {moved ? (
            <p className="modal-hint">Moving a rule to another feed or calendar starts it fresh. Items it already added stay put.</p>
          ) : null}

          <section className="rule-preview" aria-live="polite" aria-busy={previewing}>
            {previewing ? (
              <p className="modal-hint">The Agent is trying the rule on your upcoming events…</p>
            ) : preview ? (
              <>
                <p className="rule-preview-headline">{previewHeadline(preview.result)}</p>
                {preview.result.proposals.length > 0 ? (
                  <ul className="rule-preview-list">
                    {preview.result.proposals.map((proposal) => (
                      <li key={proposal.sourceId}>
                        <span className="rule-preview-title">
                          {proposal.action === "update" ? "Update " : ""}
                          {proposal.title}
                        </span>
                        <span className="rule-preview-meta">
                          {whenOf(proposal)} · for {proposal.sourceTitle}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {preview.result.deferred > 0 ? (
                  <p className="modal-hint">{preview.result.deferred} more will be handled on the next sync.</p>
                ) : null}
                {preview.result.removed > 0 ? (
                  <p className="modal-hint">
                    {preview.result.removed} item{preview.result.removed === 1 ? "" : "s"} would be removed because the event is gone.
                  </p>
                ) : null}
                {stale ? <p className="modal-hint">You&rsquo;ve changed the rule since this preview.</p> : null}
              </>
            ) : (
              <p className="modal-hint">Preview to see what the Agent would add from your upcoming events. Nothing is saved.</p>
            )}
          </section>

          {error ? (
            <p className="rule-editor-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="modal-actions">
            <button type="button" className="ghost-btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="ghost-btn" disabled={previewing || blocked.length > 0} onClick={() => void runPreview()}>
              {previewing ? "Previewing…" : preview && !stale ? "Preview again" : "Preview"}
            </button>
            <button type="submit" className="primary-btn" disabled={saving || blocked.length > 0}>
              {saving ? "Saving…" : rule ? "Save" : "Create rule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
