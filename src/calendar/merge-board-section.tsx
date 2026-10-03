"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { newMergedCalendarId } from "@/calendar/imported-calendars";
import { RenameCalendarDialog } from "@/calendar/imported-calendars-panel";
import { boxesOf, boxOf, commitBoxes, moveInBoxes, newBoxName, TRAY, type Boxes, type MergeBox } from "@/calendar/merge-board";
import { readMergeDrafts, writeMergeDrafts } from "@/calendar/preferences";
import type { MergedCalendar } from "@/calendar/types";

export type MergeBoardFeed = { id: string; name: string; color: string };

type Props = {
  /** Every imported calendar, by its ics:<feed> id. */
  feeds: MergeBoardFeed[];
  merged: MergedCalendar[];
  onMerged: (next: MergedCalendar[]) => void;
  /** A merged calendar was just made; it may need to start hidden. */
  onCreated: (id: string) => void;
  newCalendarsShown: boolean;
};

function ordinal(rank: number): string {
  const tens = rank % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[rank % 10] ?? "th";
  return `${rank}${suffix}`;
}

/**
 * Drag imported calendars into boxes. Add as many boxes as you like; a box with two or more calendars is a
 * merged calendar, the top one's copy winning, and a box with fewer waits on this device until it fills.
 */
export function MergeBoardSection({ feeds, merged, onMerged, onCreated, newCalendarsShown }: Props) {
  const headingId = useId();
  //read after mount: the server render has no saved boxes, and both renders must match
  const [drafts, setDrafts] = useState<MergeBox[]>([]);
  useEffect(() => {
    setDrafts(readMergeDrafts());
  }, []);
  //while dragging, the board follows the pointer; it's saved only on drop
  const [live, setLive] = useState<Boxes | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ merged: MergedCalendar[]; drafts: MergeBox[] } | null>(null);
  const [renaming, setRenaming] = useState<MergeBox | null>(null);

  //a box filled from another tab or the Map is a merged calendar now, not a draft
  const openDrafts = useMemo(() => drafts.filter((box) => !merged.some((calendar) => calendar.id === box.id)), [drafts, merged]);
  const boxList = useMemo(() => [...merged, ...openDrafts], [merged, openDrafts]);
  const feedIds = useMemo(() => feeds.map((feed) => feed.id), [feeds]);
  const saved = useMemo(() => boxesOf(feedIds, boxList), [feedIds, boxList]);
  const boxes = live ?? saved;
  const feedOf = (id: string) => feeds.find((feed) => feed.id === id);
  const nameOf = (id: string) => feedOf(id)?.name ?? "Imported calendar";
  const boxName = (id: string) => (id === TRAY ? "Not merged" : boxList.find((box) => box.id === id)?.name ?? "Box");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function saveDrafts(next: MergeBox[]) {
    setDrafts(next);
    writeMergeDrafts(next);
  }

  //every change keeps the board as it was, for Undo
  function remember() {
    setUndo({ merged, drafts: openDrafts });
  }

  function commit(next: Boxes) {
    if (next === saved) return;
    const result = commitBoxes(next, merged, openDrafts, nameOf);
    if (result.changes.length === 0) return;
    remember();
    onMerged(result.merged);
    saveDrafts(result.drafts);
    result.created.forEach((box) => onCreated(box.id));
    const waiting = result.drafts.filter((box) => box.members.length === 1).map((box) => box.name);
    setStatus(
      `${result.changes.join(". ")}.` +
        (waiting.length ? ` Add one more calendar to ${waiting.join(" and ")} to merge it.` : "") +
        (result.created.length && !newCalendarsShown ? " New calendars start hidden, so show it with its eye on the Map." : ""),
    );
  }

  function move(id: string, over: string) {
    commit(moveInBoxes(saved, id, over));
  }

  function moveUp(box: string, id: string) {
    const index = saved[box].indexOf(id);
    if (index > 0) move(id, saved[box][index - 1]);
  }

  function addBox(first?: string) {
    const box: MergeBox = {
      id: newMergedCalendarId(),
      name: newBoxName(boxList.map((entry) => entry.name)),
      members: first ? [first] : [],
    };
    remember();
    saveDrafts([...openDrafts, box]);
    setStatus(first ? `${box.name} added with ${nameOf(first)}. Add one more calendar to merge it.` : `${box.name} added. Drag calendars into it.`);
  }

  //its calendars go back to Not merged
  function deleteBox(box: MergeBox) {
    remember();
    if (merged.some((calendar) => calendar.id === box.id)) onMerged(merged.filter((calendar) => calendar.id !== box.id));
    saveDrafts(openDrafts.filter((entry) => entry.id !== box.id));
    setStatus(
      saved[box.id]?.length
        ? `${box.name} deleted. ${saved[box.id].map(nameOf).join(" and ")} ${saved[box.id].length === 1 ? "shows on its own" : "show on their own"} again.`
        : `${box.name} deleted.`,
    );
  }

  function rename(box: MergeBox, name: string) {
    remember();
    if (merged.some((calendar) => calendar.id === box.id)) {
      onMerged(merged.map((calendar) => (calendar.id === box.id ? { ...calendar, name } : calendar)));
    } else {
      saveDrafts(openDrafts.map((entry) => (entry.id === box.id ? { ...entry, name } : entry)));
    }
    setStatus(`Renamed to ${name}.`);
  }

  function restore() {
    if (!undo) return;
    onMerged(undo.merged);
    saveDrafts(undo.drafts);
    setUndo(null);
    setStatus("Undone.");
  }

  function onDragStart({ active: dragged }: DragStartEvent) {
    setActive(String(dragged.id));
    setLive(saved);
  }

  //crossing into another box moves the calendar there right away, so the box opens a gap for it
  function onDragOver({ active: dragged, over }: DragOverEvent) {
    if (!over || !live) return;
    const id = String(dragged.id);
    const target = String(over.id);
    if (boxOf(live, id) === boxOf(live, target)) return;
    setLive(moveInBoxes(live, id, target));
  }

  function onDragEnd({ active: dragged, over }: DragEndEvent) {
    const base = live ?? saved;
    setActive(null);
    setLive(null);
    if (!over) return;
    commit(moveInBoxes(base, String(dragged.id), String(over.id)));
  }

  function onDragCancel() {
    setActive(null);
    setLive(null);
  }

  const activeFeed = active ? feedOf(active) : undefined;

  return (
    <section className="settings-section merge-board" aria-labelledby={headingId}>
      <div className="merge-board-head">
        <h3 id={headingId}>Merge calendars</h3>
        <button type="button" className="merge-box-action is-primary" onClick={() => addBox()}>
          + Add box
        </button>
      </div>
      <p className="modal-hint">
        Add a box, then drag imported calendars into it to show them as one calendar. The order in a box is its priority:
        when an event is in more than one calendar, the copy from the calendar at the top shows. A box merges once it holds
        two calendars.
      </p>
      {feeds.length < 2 ? (
        <p className="modal-hint">Import at least two calendars in Settings to merge them.</p>
      ) : (
        <DndContext
          id="merge-board"
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
          accessibility={{
            screenReaderInstructions: {
              draggable:
                "Press Space to pick up a calendar. Use the arrow keys to move it within a box or to another box, then press Space to drop it. Press Escape to cancel.",
            },
            announcements: {
              onDragStart: ({ active: dragged }) => `Picked up ${nameOf(String(dragged.id))}.`,
              onDragOver: ({ active: dragged, over }) => {
                if (!over || !live) return undefined;
                const box = boxOf(live, String(over.id));
                return box ? `${nameOf(String(dragged.id))} is over ${boxName(box)}.` : undefined;
              },
              onDragEnd: ({ active: dragged, over }) => (over ? `${nameOf(String(dragged.id))} dropped.` : "Move cancelled."),
              onDragCancel: () => "Move cancelled.",
            },
          }}
        >
          <div className="merge-board-grid">
            <Box id={TRAY} title="Not merged" hint="All of their events show." items={boxes[TRAY]} kind="tray">
              {boxes[TRAY].map((id) => (
                <Chip key={id} id={id} feed={feedOf(id)}>
                  <label className="merge-chip-move">
                    <span className="merge-sr-only">Merge {nameOf(id)} into</span>
                    <select
                      value=""
                      onChange={(event) => {
                        const target = event.target.value;
                        if (target === "add") addBox(id);
                        else if (target) move(id, target);
                      }}
                    >
                      <option value="">Merge into…</option>
                      {boxList.map((box) => (
                        <option key={box.id} value={box.id}>
                          {box.name}
                        </option>
                      ))}
                      <option value="add">New box</option>
                    </select>
                  </label>
                </Chip>
              ))}
            </Box>

            {boxList.map((box) => {
              const members = boxes[box.id] ?? [];
              return (
                <Box
                  key={box.id}
                  id={box.id}
                  title={box.name}
                  hint={
                    members.length >= 2
                      ? `Merged: ${members.length} calendars, top one's copy wins`
                      : members.length === 1
                        ? "Add one more calendar to merge."
                        : "Drag two or more calendars here."
                  }
                  items={members}
                  kind={members.length >= 2 ? "merged" : "draft"}
                  actions={
                    <>
                      <button type="button" className="merge-box-action" onClick={() => setRenaming(box)}>
                        Rename
                      </button>
                      <button type="button" className="merge-box-action is-danger" onClick={() => deleteBox(box)}>
                        Delete
                      </button>
                    </>
                  }
                >
                  {members.map((id, index) => (
                    <Chip key={id} id={id} feed={feedOf(id)} rank={index + 1}>
                      <ChipButtons name={nameOf(id)} first={index === 0} onUp={() => moveUp(box.id, id)} onOut={() => move(id, TRAY)} />
                    </Chip>
                  ))}
                </Box>
              );
            })}

            <button type="button" className="merge-box-add" onClick={() => addBox()}>
              <span aria-hidden="true">+</span> Add box
            </button>
          </div>
          <DragOverlay>{activeFeed ? <ChipFace feed={activeFeed} lifted /> : null}</DragOverlay>
        </DndContext>
      )}
      <div className="merge-board-status" role="status">
        {status ? <span>{status}</span> : null}
        {undo ? (
          <button type="button" className="merge-box-action" onClick={restore}>
            Undo
          </button>
        ) : null}
      </div>
      {renaming ? (
        <RenameCalendarDialog
          name={renaming.name}
          onCancel={() => setRenaming(null)}
          onSave={(name) => {
            const box = renaming;
            setRenaming(null);
            rename(box, name);
          }}
        />
      ) : null}
    </section>
  );
}

function Box({ id, title, hint, items, kind, actions, children }: {
  id: string;
  title: string;
  hint: string;
  items: string[];
  kind: "tray" | "merged" | "draft";
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const headingId = useId();
  return (
    <div className="merge-box" data-kind={kind} data-over={isOver || undefined} role="group" aria-labelledby={headingId}>
      <div className="merge-box-head">
        <div>
          <p id={headingId} className="merge-box-title">{title}</p>
          <p className="merge-box-hint">{hint}</p>
        </div>
        {actions ? <div className="merge-box-actions">{actions}</div> : null}
      </div>
      <SortableContext id={id} items={items} strategy={verticalListSortingStrategy}>
        <ol ref={setNodeRef} className="merge-box-list">
          {children}
          {items.length === 0 ? <li className="merge-box-empty" aria-hidden="true">Drop here</li> : null}
        </ol>
      </SortableContext>
    </div>
  );
}

function Chip({ id, feed, rank, children }: { id: string; feed?: MergeBoardFeed; rank?: number; children?: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const name = feed?.name ?? "Imported calendar";
  return (
    <li
      ref={setNodeRef}
      className="merge-chip"
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="merge-chip-handle"
        aria-label={rank ? `Move ${name}, ${ordinal(rank)}` : `Move ${name}`}
        {...attributes}
        {...listeners}
      >
        <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true">
          {[4, 8, 12].map((y) => (
            <g key={y}>
              <circle cx="4" cy={y} r="1.2" />
              <circle cx="8" cy={y} r="1.2" />
            </g>
          ))}
        </svg>
      </button>
      {rank ? <span className="merge-chip-rank">{ordinal(rank)}</span> : null}
      <span className="merge-chip-swatch" style={{ background: feed?.color }} aria-hidden="true" />
      <span className="merge-chip-name">{name}</span>
      {children}
    </li>
  );
}

function ChipFace({ feed, lifted }: { feed: MergeBoardFeed; lifted?: boolean }) {
  return (
    <div className="merge-chip" data-lifted={lifted || undefined}>
      <span className="merge-chip-swatch" style={{ background: feed.color }} aria-hidden="true" />
      <span className="merge-chip-name">{feed.name}</span>
    </div>
  );
}

function ChipButtons({ name, first, onUp, onOut }: { name: string; first: boolean; onUp: () => void; onOut: () => void }) {
  return (
    <span className="merge-chip-buttons">
      <button type="button" className="merge-chip-button" onClick={onUp} disabled={first} aria-label={`Move ${name} up`} title="Move up">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M6 9.5v-7M3 5.5l3-3 3 3" />
        </svg>
      </button>
      <button type="button" className="merge-chip-button" onClick={onOut} aria-label={`Take ${name} out`} title="Take out">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M3 3l6 6M9 3l-6 6" />
        </svg>
      </button>
    </span>
  );
}
