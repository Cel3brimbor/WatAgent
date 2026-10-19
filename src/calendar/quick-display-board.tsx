"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { MAX_CALENDAR_SPACES, type CalendarSpace, type SpaceCalendarChoice } from "@/calendar/calendar-spaces";
import { DisplayIcon } from "@/calendar/display-icon";
import {
  MAX_DISPLAY_CALENDARS,
  arrangeDragOf,
  arrangeDrop,
  arrangeDropOf,
  withCalendar,
  withoutCalendar,
  type ArrangeDrag,
} from "@/calendar/display-arrange";
import { ChevronLeftIcon, CloseIcon, GripIcon } from "@/shared/icons";

const GROUPS: SpaceCalendarChoice["group"][] = ["WatAgent", "Imported", "UWaterloo Events", "Google"];

const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : rectIntersection(args);
};

type Props = {
  displays: CalendarSpace[];
  choices: SpaceCalendarChoice[];
  onBack: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onUpdate: (id: string, edit: (display: CalendarSpace) => CalendarSpace) => void;
};

export function QuickDisplayArrange({ displays, choices, onBack, onOpen, onNew, onUpdate }: Props) {
  const [drag, setDrag] = useState<ArrangeDrag | null>(null);
  const [status, setStatus] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const choiceById = useMemo(() => new Map(choices.map((choice) => [choice.id, choice])), [choices]);
  const dragging = drag ? labelOf(choiceById, drag.calendarId) : null;

  function apply(next: ArrangeDrag, over: unknown) {
    const change = arrangeDrop(next, arrangeDropOf(over), displays);
    if (change.type === "none" && !change.reason) return;
    const calendarId = change.type === "none" ? (change.calendarId ?? next.calendarId) : change.calendarId;
    const displayId = change.type === "none"
      ? (change.displayId ?? "")
      : change.displayId;
    const calendarName = labelOf(choiceById, calendarId).name;
    const displayName = displays.find((display) => display.id === displayId)?.name ?? "this Quick Display";
    if (change.type === "add") {
      onUpdate(change.displayId, (display) => withCalendar(display, change.calendarId));
      setStatus(`${calendarName} added to ${displayName}.`);
      return;
    }
    if (change.type === "remove") {
      onUpdate(change.displayId, (display) => withoutCalendar(display, change.calendarId));
      setStatus(`${calendarName} removed from ${displayName}.`);
      return;
    }
    if (change.reason === "already") setStatus(`${calendarName} is already in ${displayName}.`);
    else if (change.reason === "full") setStatus(`${displayName} already has ${MAX_DISPLAY_CALENDARS} calendars.`);
  }

  function onDragStart(event: DragStartEvent) {
    setDrag(arrangeDragOf(event.active.data.current));
  }

  function onDragEnd(event: DragEndEvent) {
    const next = arrangeDragOf(event.active.data.current);
    if (next) apply(next, event.over?.data.current);
    setDrag(null);
  }

  return (
    <DndContext
      id="quick-display-arrange"
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragCancel={() => setDrag(null)}
      onDragEnd={onDragEnd}
    >
      <div className={`qd-arrange${drag ? " is-dragging" : ""}`}>
        <header className="qd-board-head">
          <div>
            <button type="button" className="qd-arrange-back" onClick={onBack}>
              <ChevronLeftIcon />
              Quick Displays
            </button>
            <h3>Arrange calendars</h3>
            <p>Drag a calendar onto each Quick Display. A calendar can sit in more than one. Drag it back to the list to take it off that display.</p>
            <p className="qd-arrange-status" role="status" aria-live="polite">{status}</p>
          </div>
          <button type="button" className="ghost-btn" disabled={displays.length >= MAX_CALENDAR_SPACES} onClick={onNew}>
            New display
          </button>
        </header>
        <div className="qd-arrange-layout">
          <CalendarPool choices={choices} displays={displays} drag={drag} />
          <div className="qd-arrange-columns" aria-label="Quick Displays">
            {displays.length === 0 ? (
              <p className="qd-arrange-empty">Create a Quick Display, then drop the calendars you want it to show.</p>
            ) : displays.map((display) => (
              <ArrangeColumn
                key={display.id}
                display={display}
                choices={choices}
                choiceById={choiceById}
                drag={drag}
                onOpen={() => onOpen(display.id)}
                onAdd={(calendarId) => apply({ kind: "pool", calendarId }, { kind: "display", displayId: display.id })}
                onRemove={(calendarId) => apply({ kind: "member", displayId: display.id, calendarId }, { kind: "pool" })}
              />
            ))}
          </div>
        </div>
      </div>
      <DragOverlay className="qd-arrange-overlay-wrap" dropAnimation={null}>
        {dragging ? <ArrangeOverlay name={dragging.name} color={dragging.color} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function CalendarPool({
  choices,
  displays,
  drag,
}: {
  choices: SpaceCalendarChoice[];
  displays: CalendarSpace[];
  drag: ArrangeDrag | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "pool", data: { kind: "pool" } });
  const removing = isOver && drag?.kind === "member";
  return (
    <section
      ref={setNodeRef}
      className={`qd-arrange-pool${removing ? " is-remove" : ""}`}
      aria-label="Calendars"
    >
      <header className="qd-arrange-pool-head">
        <h3>Calendars</h3>
        <p>{removing ? "Release to remove it from that display" : "Drag onto a Quick Display"}</p>
      </header>
      {choices.length === 0 ? <p className="qd-arrange-note">Add a calendar on Calendar first.</p> : null}
      {GROUPS.map((group) => {
        const rows = choices.filter((choice) => choice.group === group);
        if (rows.length === 0) return null;
        return (
          <div key={group} className="qd-arrange-group">
            <h4>{group}</h4>
            <ul>
              {rows.map((choice) => (
                <PoolCalendar
                  key={choice.id}
                  choice={choice}
                  homes={displays.filter((display) => display.includedCalendarIds.includes(choice.id)).map((display) => display.name)}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function PoolCalendar({ choice, homes }: { choice: SpaceCalendarChoice; homes: string[] }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool-item:${choice.id}`,
    data: { kind: "pool", calendarId: choice.id },
  });
  return (
    <li>
      <button
        type="button"
        ref={setNodeRef}
        className={`qd-arrange-cal${isDragging ? " is-dragging" : ""}`}
        aria-label={`Drag ${choice.name} onto a Quick Display`}
        {...attributes}
        {...listeners}
      >
        <GripIcon />
        <span className="qd-cal-swatch" style={{ background: choice.color }} aria-hidden="true" />
        <span className="qd-arrange-cal-copy">
          <span className="qd-arrange-cal-name">{choice.name}</span>
          {homes.length > 0 ? <span className="qd-arrange-cal-meta">In {homes.join(", ")}</span> : null}
        </span>
      </button>
    </li>
  );
}

function ArrangeColumn({
  display,
  choices,
  choiceById,
  drag,
  onOpen,
  onAdd,
  onRemove,
}: {
  display: CalendarSpace;
  choices: SpaceCalendarChoice[];
  choiceById: Map<string, SpaceCalendarChoice>;
  drag: ArrangeDrag | null;
  onOpen: () => void;
  onAdd: (calendarId: string) => void;
  onRemove: (calendarId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `display:${display.id}`,
    data: { kind: "display", displayId: display.id },
  });
  const fromHere = drag?.kind === "member" && drag.displayId === display.id;
  const included = drag ? display.includedCalendarIds.includes(drag.calendarId) : false;
  const full = !included && display.includedCalendarIds.length >= MAX_DISPLAY_CALENDARS;
  const showAdd = Boolean(isOver && drag && !fromHere && !included && !full);
  const showTaken = Boolean(isOver && drag && !fromHere && included);
  const showFull = Boolean(isOver && drag && !fromHere && full);
  const count = display.includedCalendarIds.length;
  return (
    <article
      ref={setNodeRef}
      className={`qd-arrange-column${showAdd ? " is-over" : ""}${showTaken || showFull ? " is-taken" : ""}`}
      aria-label={display.name}
    >
      <header className="qd-arrange-column-head">
        <span className="qd-arrange-icon" aria-hidden="true"><DisplayIcon id={display.icon} /></span>
        <div className="qd-arrange-column-copy">
          <h3>{display.name}</h3>
          <p>{count === 0 ? "No calendars" : count === 1 ? "1 calendar" : `${count} calendars`}</p>
        </div>
        <button type="button" className="qd-arrange-open" onClick={onOpen}>Open</button>
      </header>
      <ul className="qd-arrange-members">
        {display.includedCalendarIds.length === 0 ? (
          <li className="qd-arrange-placeholder">Drop calendars here</li>
        ) : display.includedCalendarIds.map((calendarId) => {
          const choice = labelOf(choiceById, calendarId);
          return (
            <MemberRow
              key={calendarId}
              displayId={display.id}
              displayName={display.name}
              calendarId={calendarId}
              name={choice.name}
              color={choice.color}
              onRemove={() => onRemove(calendarId)}
            />
          );
        })}
      </ul>
      {showAdd ? <p className="qd-arrange-hint" aria-hidden="true">Release to add</p> : null}
      {showTaken ? <p className="qd-arrange-hint" aria-hidden="true">Already in this display</p> : null}
      {showFull ? <p className="qd-arrange-hint" aria-hidden="true">This display is full</p> : null}
      <AddCalendar choices={choices} display={display} onAdd={onAdd} />
    </article>
  );
}

function MemberRow({
  displayId,
  displayName,
  calendarId,
  name,
  color,
  onRemove,
}: {
  displayId: string;
  displayName: string;
  calendarId: string;
  name: string;
  color: string;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `member:${displayId}:${calendarId}`,
    data: { kind: "member", displayId, calendarId },
  });
  return (
    <li ref={setNodeRef} className={`qd-arrange-member${isDragging ? " is-dragging" : ""}`}>
      <button
        type="button"
        className="qd-arrange-handle"
        aria-label={`Drag ${name}`}
        {...attributes}
        {...listeners}
      >
        <GripIcon />
      </button>
      <span className="qd-cal-swatch" style={{ background: color }} aria-hidden="true" />
      <span className="qd-arrange-cal-name">{name}</span>
      <button type="button" className="qd-arrange-remove" aria-label={`Remove ${name} from ${displayName}`} onClick={onRemove}>
        <CloseIcon />
      </button>
    </li>
  );
}

function AddCalendar({
  choices,
  display,
  onAdd,
}: {
  choices: SpaceCalendarChoice[];
  display: CalendarSpace;
  onAdd: (calendarId: string) => void;
}) {
  const [picked, setPicked] = useState("");
  const included = new Set(display.includedCalendarIds);
  const available = choices.filter((choice) => !included.has(choice.id));
  const value = available.some((choice) => choice.id === picked) ? picked : "";
  const full = display.includedCalendarIds.length >= MAX_DISPLAY_CALENDARS;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!value || full) return;
    onAdd(value);
    setPicked("");
  }

  if (available.length === 0) {
    return <p className="qd-arrange-note">{choices.length === 0 ? "No calendars to add." : "Every calendar is in this display."}</p>;
  }
  return (
    <form className="qd-arrange-add" onSubmit={submit}>
      <select
        aria-label={`Add a calendar to ${display.name}`}
        value={value}
        disabled={full}
        onChange={(event) => setPicked(event.target.value)}
      >
        <option value="">{full ? "This display is full" : "Add a calendar"}</option>
        {GROUPS.map((group) => {
          const rows = available.filter((choice) => choice.group === group);
          if (rows.length === 0) return null;
          return (
            <optgroup key={group} label={group}>
              {rows.map((choice) => (
                <option key={choice.id} value={choice.id}>{choice.name}</option>
              ))}
            </optgroup>
          );
        })}
      </select>
      <button type="submit" className="ghost-btn" disabled={!value || full}>Add</button>
    </form>
  );
}

function ArrangeOverlay({ name, color }: { name: string; color: string }) {
  return (
    <span className="qd-arrange-overlay">
      <GripIcon />
      <span className="qd-cal-swatch" style={{ background: color }} aria-hidden="true" />
      <span className="qd-arrange-cal-name">{name}</span>
    </span>
  );
}

function labelOf(choiceById: Map<string, SpaceCalendarChoice>, calendarId: string): { name: string; color: string } {
  return choiceById.get(calendarId) ?? { name: "Unavailable calendar", color: "var(--busy-color)" };
}
