"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS as dndCSS } from "@dnd-kit/utilities";
import { GripIcon } from "@/shared/icons";
import { SegmentedControl } from "@/shared/segmented-control";
import { Switch } from "@/shared/switch";
import { useDialog } from "@/shared/use-dialog";
import { usePresence } from "@/shared/use-presence";

export type CalSegment = "calendars" | "merged" | "rules";
export type CalPresentation = "list" | "graph";
export type CalGroup = "watagent" | "imported" | "google";

export type CalendarRowModel = {
  id: string;
  name: string;
  color: string;
  group: CalGroup;
  caption: string;
  shown: boolean | null;
  showBlocked?: string;
  agent: boolean;
  agentSentence: string;
  lock: boolean;
  lockEditable: boolean;
  lockSentence: string;
  pending: number;
  approvalOn: boolean;
  canAsk: boolean;
  askBlocked?: string;
  sync: "hidden" | "ready" | "busy" | "blocked";
  syncBlocked?: string;
  connection?: string;
  landing?: string;
  mergeLink?: { id: string; name: string; waiting: boolean };
};

export type MergeMemberModel = {
  id: string;
  name: string;
  color: string;
  sharedLabel: string;
};

export type MergeModel = {
  id: string;
  name: string;
  draft: boolean;
  shown: boolean;
  showBlocked?: string;
  busy: boolean;
  canSync: boolean;
  syncBlocked?: string;
  members: MergeMemberModel[];
};

export type RuleModel = {
  id: string;
  name: string;
  enabled: boolean;
  summary: string;
  approval: string;
  lastRun: string;
};

export type PickerRow = { id: string; name: string; disabled: boolean; note?: string };

type Props = {
  segment: CalSegment;
  onSegment: (segment: CalSegment) => void;
  presentation: CalPresentation;
  onPresentation: (presentation: CalPresentation) => void;
  graph?: ReactNode;
  groupsOpen: Record<CalGroup, boolean>;
  onToggleGroup: (group: CalGroup) => void;
  newCalendarsShown: boolean;
  onNewCalendarsShown: (shown: boolean) => void;
  approval: boolean;
  onApproval: (value: boolean) => void;
  /** Shown when Google has no row yet. */
  googleEmpty?: string;
  rows: CalendarRowModel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onShown: (id: string, shown: boolean) => void;
  onAgent: (id: string, access: boolean) => void;
  onLock: (id: string, locked: boolean) => void;
  onSync: (id: string) => void;
  onAsk: (id: string) => void;
  onReview: () => void;
  onOpenMerge: (id: string) => void;
  merges: MergeModel[];
  onNewMerge: () => void;
  onRenameMerge: (id: string) => void;
  onDeleteMerge: (id: string) => void;
  onShowMerge: (id: string, shown: boolean) => void;
  onSyncMerge: (id: string) => void;
  onRank: (boxId: string, memberId: string, rank: number) => void;
  onRemoveMember: (memberId: string) => void;
  onAddToMerge: (boxId: string) => void;
  picker: { name: string; rows: PickerRow[] } | null;
  onPick: (feedId: string) => void;
  onClosePicker: () => void;
  rulesStatus: "loading" | "ready" | "unavailable" | "error";
  rules: RuleModel[];
  atRuleLimit: boolean;
  canCreateRule: boolean;
  createRuleReason?: string;
  runningRuleId: string | null;
  onNewRule: () => void;
  onRunRule: (id: string) => void;
  onToggleRule: (id: string) => void;
  onEditRule: (id: string) => void;
  onDeleteRule: (id: string) => void;
  onRetryRules: () => void;
  toast: { key: number; message: string; undo: boolean } | null;
  onUndo: () => void;
};

const GROUPS: { id: CalGroup; label: string }[] = [
  { id: "watagent", label: "WatAgent" },
  { id: "imported", label: "Imported" },
  { id: "google", label: "Google" },
];

export function CalendarsBoard(props: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const selected = props.rows.find((row) => row.id === props.selectedId) ?? null;
  const sheet = usePresence(sheetOpen && narrow ? selected : null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setNarrow(el.clientWidth < 800);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!narrow) setSheetOpen(false);
  }, [narrow]);

  function activate(id: string, openSheet: boolean) {
    props.onSelect(id);
    if (openSheet && narrow) setSheetOpen(true);
    if (!openSheet) {
      requestAnimationFrame(() => {
        rootRef.current?.querySelector<HTMLButtonElement>(`[data-calendar="${CSS.escape(id)}"]`)?.focus();
      });
    }
  }

  function moveSelection(delta: number) {
    const visible = props.rows.filter((row) => props.groupsOpen[row.group]);
    if (visible.length === 0) return;
    const index = Math.max(0, visible.findIndex((row) => row.id === props.selectedId));
    const next = visible[Math.max(0, Math.min(visible.length - 1, index + delta))];
    if (next) activate(next.id, false);
  }

  return (
    <div className="calendars-board" ref={rootRef}>
      <header className="calendars-head">
        <div className="calendars-head-row">
          <SegmentedControl
            label="Layout"
            value={props.presentation}
            onChange={props.onPresentation}
            options={[
              { value: "list", label: "List", hint: "Calendars, merges, and rules" },
              { value: "graph", label: "Graph", hint: "The same settings, arranged on a map" },
            ]}
          />
          {props.presentation === "list" ? (
            <SegmentedControl
              label="Calendars sections"
              value={props.segment}
              onChange={props.onSegment}
              options={[
                { value: "calendars", label: "Calendars" },
                { value: "merged", label: "Merged" },
                { value: "rules", label: "Rules" },
              ]}
            />
          ) : null}
          <button
            type="button"
            className="ghost-btn calendars-settings-button"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            Settings
          </button>
          <div className={`calendars-settings${settingsOpen ? " is-open" : ""}`}>
            <label className="calendars-toggle">
              New calendars start shown
              <Switch checked={props.newCalendarsShown} onChange={props.onNewCalendarsShown} />
            </label>
            <label className="calendars-toggle">
              Ask before the Agent changes events
              <Switch checked={props.approval} onChange={props.onApproval} />
            </label>
          </div>
        </div>
      </header>

      {props.presentation === "graph" ? <div className="calendars-graph">{props.graph}</div> : null}

      {props.presentation === "list" && props.segment === "calendars" ? (
        <div className="calendars-layout">
          <div
            className="calendars-list"
            role="list"
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveSelection(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                moveSelection(-1);
              }
            }}
          >
            {GROUPS.map((group) => (
              <Group
                key={group.id}
                label={group.label}
                open={props.groupsOpen[group.id]}
                onToggle={() => props.onToggleGroup(group.id)}
                rows={props.rows.filter((row) => row.group === group.id)}
                empty={group.id === "imported" ? "No imported calendars yet. Add a link in Settings." : group.id === "google" ? props.googleEmpty ?? "Google Calendar isn’t linked. Link it in Settings." : undefined}
                selectedId={props.selectedId}
                onActivate={activate}
                onShown={props.onShown}
              />
            ))}
          </div>
          <aside className="calendars-detail" aria-label="Calendar details">
            {selected ? (
              <Detail
                row={selected}
                onShown={props.onShown}
                onAgent={props.onAgent}
                onLock={props.onLock}
                onSync={props.onSync}
                onAsk={props.onAsk}
                onReview={props.onReview}
                onOpenMerge={props.onOpenMerge}
              />
            ) : (
              <p className="calendars-note">Select a calendar.</p>
            )}
          </aside>
        </div>
      ) : null}

      {props.presentation === "list" && props.segment === "merged" ? (
        <MergedPane
          merges={props.merges}
          onNewMerge={props.onNewMerge}
          onRenameMerge={props.onRenameMerge}
          onDeleteMerge={props.onDeleteMerge}
          onShowMerge={props.onShowMerge}
          onSyncMerge={props.onSyncMerge}
          onRank={props.onRank}
          onRemoveMember={props.onRemoveMember}
          onAddToMerge={props.onAddToMerge}
        />
      ) : null}

      {props.presentation === "list" && props.segment === "rules" ? (
        <RulesPane
          status={props.rulesStatus}
          rules={props.rules}
          atRuleLimit={props.atRuleLimit}
          canCreateRule={props.canCreateRule}
          createRuleReason={props.createRuleReason}
          runningRuleId={props.runningRuleId}
          onNewRule={props.onNewRule}
          onRunRule={props.onRunRule}
          onToggleRule={props.onToggleRule}
          onEditRule={props.onEditRule}
          onDeleteRule={props.onDeleteRule}
          onRetryRules={props.onRetryRules}
        />
      ) : null}

      {sheet.value ? (
        <DetailSheet row={sheet.value} open={sheet.open} onClose={() => setSheetOpen(false)} {...props} />
      ) : null}
      <Picker picker={props.picker} onPick={props.onPick} onClose={props.onClosePicker} />
      {props.toast ? (
        <div className="calendars-toast" role="status">
          <span>{props.toast.message}</span>
          {props.toast.undo ? (
            <button type="button" className="ghost-btn" onClick={props.onUndo}>
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Group({
  label,
  open,
  onToggle,
  rows,
  empty,
  selectedId,
  onActivate,
  onShown,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  rows: CalendarRowModel[];
  empty?: string;
  selectedId: string | null;
  onActivate: (id: string, openSheet: boolean) => void;
  onShown: (id: string, shown: boolean) => void;
}) {
  return (
    <section className="calendars-group">
      <button type="button" className="calendars-group-toggle" aria-expanded={open} onClick={onToggle}>
        <span className="calendars-chevron" aria-hidden="true" />
        {label}
        <span className="calendars-count">{rows.length}</span>
      </button>
      {open ? (
        rows.length ? (
          rows.map((row) => (
            <div key={row.id} className={`calendars-row${row.shown === false ? " is-dimmed" : ""}${row.id === selectedId ? " is-selected" : ""}`} role="listitem">
              <button type="button" className="calendars-row-main" data-calendar={row.id} aria-pressed={row.id === selectedId} onClick={() => onActivate(row.id, true)}>
                <span className="calendars-swatch" style={{ background: row.color }} aria-hidden="true" />
                <span className="calendars-row-copy">
                  <span className="calendars-row-name">{row.name}</span>
                  <span className="calendars-row-caption">{row.caption}</span>
                </span>
                {row.pending > 0 && row.agent && !row.lock ? <span className="calendars-waiting">{row.pending} waiting</span> : null}
              </button>
              {row.shown === null ? (
                <span className="calendars-row-aside">{row.mergeLink?.name}</span>
              ) : (
                <Switch
                  checked={row.shown}
                  disabled={Boolean(row.showBlocked)}
                  aria-label={row.showBlocked ?? (row.shown ? `Hide ${row.name} on the calendar` : `Show ${row.name} on the calendar`)}
                  onChange={(shown) => onShown(row.id, shown)}
                />
              )}
            </div>
          ))
        ) : empty ? (
          <p className="calendars-note">{empty}</p>
        ) : null
      ) : null}
    </section>
  );
}

function Detail({
  row,
  onShown,
  onAgent,
  onLock,
  onSync,
  onAsk,
  onReview,
  onOpenMerge,
}: {
  row: CalendarRowModel;
  onShown: (id: string, shown: boolean) => void;
  onAgent: (id: string, access: boolean) => void;
  onLock: (id: string, locked: boolean) => void;
  onSync: (id: string) => void;
  onAsk: (id: string) => void;
  onReview: () => void;
  onOpenMerge: (id: string) => void;
}) {
  const titleId = useId();
  return (
    <div className="calendars-detail-body">
      <h3 id={titleId} className="calendars-detail-title">
        <span className="calendars-swatch" style={{ background: row.color }} aria-hidden="true" />
        {row.name}
      </h3>
      <p className="calendars-row-caption">{row.caption}</p>

      {row.shown === null ? (
        <p className="calendars-note">{row.mergeLink?.waiting ? `Waiting in ${row.mergeLink.name}. Add one more calendar there to merge it.` : `Shows on the calendar as part of ${row.mergeLink?.name}.`}</p>
      ) : (
        <Setting
          label="Show on calendar"
          hint={row.showBlocked ?? (row.shown ? "Visible on the calendar." : "Hidden from the calendar.")}
          checked={row.shown}
          disabled={Boolean(row.showBlocked)}
          onChange={(shown) => onShown(row.id, shown)}
        />
      )}

      <Setting label="Agent can see this" hint={row.agentSentence} checked={row.agent} onChange={(access) => onAgent(row.id, access)} />

      {row.lockEditable ? (
        <Setting label="Read only" hint={row.lockSentence} checked={row.lock} onChange={(locked) => onLock(row.id, locked)} />
      ) : (
        <p className="calendars-note">{row.lockSentence}</p>
      )}

      {row.landing ? <p className="calendars-note">{row.landing}</p> : null}

      {row.pending > 0 && row.agent && !row.lock ? (
        <p className="calendars-warning" role="status">
          {row.pending === 1 ? "1 change is waiting for your approval." : `${row.pending} changes are waiting for your approval.`}{" "}
          {row.approvalOn ? "Review opens the queue in chat." : "Approval is off, so new changes apply right away. These are still waiting from before."}
        </p>
      ) : null}

      {row.connection ? <p className="calendars-note">Connection: {row.connection}</p> : null}

      {row.mergeLink ? (
        <button type="button" className="ghost-btn" onClick={() => onOpenMerge(row.mergeLink!.id)}>
          Open {row.mergeLink.name}
        </button>
      ) : null}

      <div className="calendars-actions">
        {row.canAsk ? (
          <button type="button" className="primary-btn" disabled={Boolean(row.askBlocked)} onClick={() => onAsk(row.id)}>
            Ask Agent
          </button>
        ) : null}
        {row.sync !== "hidden" ? (
          <button type="button" className="ghost-btn" disabled={row.sync !== "ready"} aria-busy={row.sync === "busy"} onClick={() => onSync(row.id)}>
            {row.sync === "busy" ? "Syncing…" : "Sync"}
          </button>
        ) : null}
        {row.pending > 0 && row.agent && !row.lock ? (
          <button type="button" className="ghost-btn" onClick={onReview}>
            Review
          </button>
        ) : null}
      </div>
      {row.askBlocked ? <p className="calendars-note">{row.askBlocked}</p> : null}
      {row.syncBlocked && row.sync === "blocked" ? <p className="calendars-note">{row.syncBlocked}</p> : null}
    </div>
  );
}

function Setting({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="calendars-setting">
      <label className="calendars-toggle" htmlFor={id}>
        {label}
        <Switch id={id} checked={checked} disabled={disabled} aria-describedby={`${id}-hint`} onChange={onChange} />
      </label>
      <p className="calendars-note" id={`${id}-hint`}>
        {hint}
      </p>
    </div>
  );
}

function DetailSheet({
  row,
  open,
  onClose,
  onShown,
  onAgent,
  onLock,
  onSync,
  onAsk,
  onReview,
  onOpenMerge,
}: {
  row: CalendarRowModel;
  open: boolean;
  onClose: () => void;
} & Pick<Props, "onShown" | "onAgent" | "onLock" | "onSync" | "onAsk" | "onReview" | "onOpenMerge">) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(ref, { open, onEscape: onClose });
  return (
    <div className="calendars-sheet" role="presentation" data-state={open ? "open" : "closed"} onClick={onClose}>
      <div
        ref={ref}
        className="calendars-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="calendars-sheet-bar">
          <button type="button" className="ghost-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <Detail
          row={row}
          onShown={(id, shown) => {
            onShown(id, shown);
          }}
          onAgent={onAgent}
          onLock={onLock}
          onSync={onSync}
          onAsk={(id) => {
            onAsk(id);
            onClose();
          }}
          onReview={() => {
            onReview();
            onClose();
          }}
          onOpenMerge={(id) => {
            onOpenMerge(id);
            onClose();
          }}
        />
        <span id={titleId} className="calendars-sr">
          {row.name}
        </span>
      </div>
    </div>
  );
}

function MergedPane({
  merges,
  onNewMerge,
  onRenameMerge,
  onDeleteMerge,
  onShowMerge,
  onSyncMerge,
  onRank,
  onRemoveMember,
  onAddToMerge,
}: Pick<Props, "merges" | "onNewMerge" | "onRenameMerge" | "onDeleteMerge" | "onShowMerge" | "onSyncMerge" | "onRank" | "onRemoveMember" | "onAddToMerge">) {
  return (
    <div className="calendars-pane">
      <div className="calendars-pane-bar">
        <p className="calendars-note">Combine imported calendars that share events. Drag the rows to set priority — the first calendar wins.</p>
        <button type="button" className="primary-btn" onClick={onNewMerge}>
          New merge
        </button>
      </div>
      {merges.length === 0 ? <p className="calendars-note">No merges yet. New merge starts an empty draft on this device.</p> : null}
      {merges.map((merge) => (
        <article key={merge.id} className="calendars-card" aria-busy={merge.busy}>
          <div className="calendars-card-head">
            <h3 className="calendars-card-title">{merge.name}</h3>
            <span className="calendars-pill">{merge.draft ? "Draft · on this device" : "Merged"}</span>
            <span className="calendars-card-actions">
              <button type="button" className="ghost-btn" onClick={() => onRenameMerge(merge.id)}>
                Rename
              </button>
              <button type="button" className="ghost-btn" onClick={() => onDeleteMerge(merge.id)}>
                Delete
              </button>
            </span>
          </div>
          <p className="calendars-note">
            {merge.draft
              ? merge.members.length === 0
                ? "Add at least two imported calendars."
                : "Add one more calendar to merge. Until then this is saved on this device only, and it is not on the calendar yet."
              : "When an event is on more than one calendar, the first row is the copy you see. Drag to reorder."}
          </p>
          {merge.draft ? null : (
            <Setting
              label="Show on calendar"
              hint={merge.showBlocked ?? (merge.shown ? "Visible on the calendar." : "Hidden from the calendar.")}
              checked={merge.shown}
              disabled={Boolean(merge.showBlocked)}
              onChange={(shown) => onShowMerge(merge.id, shown)}
            />
          )}
          <MemberList merge={merge} onRank={onRank} onRemoveMember={onRemoveMember} />
          <div className="calendars-actions">
            <button type="button" className="ghost-btn" onClick={() => onAddToMerge(merge.id)}>
              Add calendar
            </button>
            <button type="button" className="ghost-btn" disabled={!merge.canSync || merge.busy} onClick={() => onSyncMerge(merge.id)}>
              {merge.busy ? "Syncing…" : "Sync"}
            </button>
          </div>
          {merge.syncBlocked && !merge.canSync ? <p className="calendars-note">{merge.syncBlocked}</p> : null}
        </article>
      ))}
    </div>
  );
}

function MemberList({
  merge,
  onRank,
  onRemoveMember,
}: {
  merge: MergeModel;
  onRank: Props["onRank"];
  onRemoveMember: Props["onRemoveMember"];
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = merge.members.map((member) => member.id);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    //onRank removes the member before splicing it back, so the index of the row it lands on is the final rank in either direction
    onRank(merge.id, String(active.id), ids.indexOf(String(over.id)));
  }

  return (
    <DndContext id={`merge-members-${merge.id}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className="calendars-members" aria-label={`Priority order in ${merge.name}`}>
          {merge.members.map((member, index) => (
            <SortableMember
              key={member.id}
              member={member}
              index={index}
              draft={merge.draft}
              onRemoveMember={onRemoveMember}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SortableMember({
  member,
  index,
  draft,
  onRemoveMember,
}: {
  member: MergeMemberModel;
  index: number;
  draft: boolean;
  onRemoveMember: Props["onRemoveMember"];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: member.id,
    transition: { duration: 240, easing: "cubic-bezier(0.25, 1, 0.5, 1)" },
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: dndCSS.Transform.toString(transform), transition }}
      className={`calendars-member${isDragging ? " is-dragging" : ""}`}
    >
      <button
        type="button"
        className="calendars-member-handle"
        aria-label={`Reorder ${member.name}`}
        title={`Drag to reorder ${member.name}`}
        {...attributes}
        {...listeners}
      >
        <GripIcon />
      </button>
      <span className="calendars-member-rank">{index + 1}</span>
      <span className="calendars-swatch" style={{ background: member.color }} aria-hidden="true" />
      <span className="calendars-row-copy">
        <span className="calendars-row-name">{member.name}</span>
        {draft ? null : <span className="calendars-row-caption">{member.sharedLabel}</span>}
      </span>
      {index === 0 && !draft ? <span className="calendars-member-badge">Wins</span> : null}
      <button type="button" className="ghost-btn calendars-member-remove" onClick={() => onRemoveMember(member.id)}>
        Remove
      </button>
    </li>
  );
}

function RulesPane({
  status,
  rules,
  atRuleLimit,
  canCreateRule,
  createRuleReason,
  runningRuleId,
  onNewRule,
  onRunRule,
  onToggleRule,
  onEditRule,
  onDeleteRule,
  onRetryRules,
}: {
  status: Props["rulesStatus"];
  rules: RuleModel[];
  atRuleLimit: boolean;
  canCreateRule: boolean;
  createRuleReason?: string;
  runningRuleId: string | null;
  onNewRule: () => void;
  onRunRule: (id: string) => void;
  onToggleRule: (id: string) => void;
  onEditRule: (id: string) => void;
  onDeleteRule: (id: string) => void;
  onRetryRules: () => void;
}) {
  if (status === "unavailable") {
    return (
      <div className="calendars-pane">
        <p className="calendars-note">Rules aren’t available right now.</p>
      </div>
    );
  }
  return (
    <div className="calendars-pane">
      <div className="calendars-pane-bar">
        <p className="calendars-note">
          {rules.length} of 10. A rule watches an imported calendar and adds to a WatAgent calendar.
        </p>
        <button type="button" className="primary-btn" disabled={!canCreateRule} onClick={onNewRule}>
          New rule
        </button>
      </div>
      {atRuleLimit ? <p className="calendars-note">You can have up to 10 rules.</p> : null}
      {createRuleReason && !atRuleLimit ? <p className="calendars-note">{createRuleReason}</p> : null}
      {status === "loading" && rules.length === 0 ? <p className="calendars-note">Loading rules…</p> : null}
      {status === "error" ? (
        <div className="calendars-actions">
          <p className="calendars-warning" role="alert">
            Rules didn’t load.
          </p>
          <button type="button" className="ghost-btn" onClick={onRetryRules}>
            Try again
          </button>
        </div>
      ) : null}
      {rules.map((rule) => {
        const busy = runningRuleId === rule.id;
        return (
          <article key={rule.id} className={`calendars-card${rule.enabled ? "" : " is-paused"}`} aria-busy={busy}>
            <div className="calendars-card-head">
              <h3 className="calendars-card-title">{rule.name}</h3>
              <span className="calendars-pill">{rule.enabled ? "Active" : "Paused"}</span>
            </div>
            <p className="calendars-note">{rule.summary}</p>
            <p className="calendars-note">{rule.approval}</p>
            <p className="calendars-note">{rule.lastRun}</p>
            <div className="calendars-actions">
              <button type="button" className="ghost-btn" disabled={busy} onClick={() => onRunRule(rule.id)}>
                {busy ? "Running…" : "Run now"}
              </button>
              <button type="button" className="ghost-btn" disabled={busy} onClick={() => onToggleRule(rule.id)}>
                {rule.enabled ? "Pause" : "Resume"}
              </button>
              <button type="button" className="ghost-btn" disabled={busy} onClick={() => onEditRule(rule.id)}>
                Edit
              </button>
              <button type="button" className="ghost-btn" disabled={busy} onClick={() => onDeleteRule(rule.id)}>
                Delete
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Picker({ picker, onPick, onClose }: { picker: Props["picker"]; onPick: (id: string) => void; onClose: () => void }) {
  const presence = usePresence(picker);
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(ref, { open: presence.open, onEscape: onClose });
  if (!presence.value) return null;
  const current = presence.value;
  return (
    <div className="modal-backdrop" role="presentation" data-state={presence.open ? "open" : "closed"} inert={!presence.open} onClick={onClose}>
      <div ref={ref} className="modal calendars-picker" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <h2 id={titleId}>Add to {current.name}</h2>
        <p className="modal-hint">Imported calendars only. A calendar can belong to one merge.</p>
        {current.rows.length === 0 ? (
          <p className="modal-hint">No imported calendars yet. Add a link in Settings.</p>
        ) : (
          <ul className="calendars-picker-list">
            {current.rows.map((row) => (
              <li key={row.id}>
                <button type="button" className="calendars-picker-row" disabled={row.disabled || !presence.open} onClick={() => onPick(row.id)}>
                  <span>{row.name}</span>
                  {row.note ? <span className="calendars-row-caption">{row.note}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
