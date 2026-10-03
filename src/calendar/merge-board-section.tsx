"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
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
import { boxesOf, boxOf, commitBoxes, moveInBoxes, NEW_BOX, TRAY, type Boxes } from "@/calendar/merge-board";
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

/** Drag imported calendars into boxes; each box with two or more is a merged calendar, first one's copy winning. */
export function MergeBoardSection({ feeds, merged, onMerged, onCreated, newCalendarsShown }: Props) {
  const headingId = useId();
  //the new box holds one calendar here until a second one makes it a merged calendar
  const [draft, setDraft] = useState<string[]>([]);
  //while dragging, the board follows the pointer; it's saved only on drop
  const [live, setLive] = useState<Boxes | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ merged: MergedCalendar[]; draft: string[] } | null>(null);
  const [renaming, setRenaming] = useState<MergedCalendar | null>(null);

  const feedIds = useMemo(() => feeds.map((feed) => feed.id), [feeds]);
  const saved = useMemo(() => boxesOf(feedIds, merged, draft), [feedIds, merged, draft]);
  const boxes = live ?? saved;
  const feedOf = (id: string) => feeds.find((feed) => feed.id === id);
  const nameOf = (id: string) => feedOf(id)?.name ?? "Imported calendar";
  const boxName = (box: string) =>
    box === TRAY ? "Not merged" : box === NEW_BOX ? "New merged calendar" : merged.find((calendar) => calendar.id === box)?.name ?? "Merged calendar";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function commit(next: Boxes) {
    if (next === saved) return;
    const result = commitBoxes(next, merged, nameOf, newMergedCalendarId);
    const before = { merged, draft };
    setDraft(result.draft);
    if (result.changes.length === 0) {
      //only the new box changed, and it still holds one calendar
      if (result.draft.length === 1) setStatus(`${nameOf(result.draft[0])} is waiting. Drop one more calendar in to merge them.`);
      else setStatus(null);
      setUndo(result.draft.join() === draft.join() ? null : before);
      return;
    }
    onMerged(result.merged);
    if (result.created) onCreated(result.created.id);
    setUndo(before);
    setStatus(
      `${result.changes.join(". ")}.` +
        (result.created && !newCalendarsShown ? " New calendars start hidden, so show it with its eye on the Map." : ""),
    );
  }

  function move(id: string, over: string) {
    commit(moveInBoxes(saved, id, over));
  }

  function moveUp(box: string, id: string) {
    const index = saved[box].indexOf(id);
    if (index > 0) move(id, saved[box][index - 1]);
  }

  function emptyBox(box: string) {
    let next = saved;
    for (const id of saved[box]) next = moveInBoxes(next, id, TRAY);
    commit(next);
  }

  function restore() {
    if (!undo) return;
    onMerged(undo.merged);
    setDraft(undo.draft);
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

  const mergedBoxes = merged.filter((calendar) => calendar.id in boxes);
  const activeFeed = active ? feedOf(active) : undefined;

  return (
    <section className="settings-section merge-board" aria-labelledby={headingId}>
      <h3 id={headingId}>Merge calendars</h3>
      <p className="modal-hint">
        Drag imported calendars into a box to show them as one calendar. The order in a box is its priority: when an event is
        in more than one calendar, the copy from the calendar at the top shows. A box with fewer than two calendars unmerges.
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
                        if (event.target.value) move(id, event.target.value);
                      }}
                    >
                      <option value="">Merge into…</option>
                      {mergedBoxes.map((calendar) => (
                        <option key={calendar.id} value={calendar.id}>
                          {calendar.name}
                        </option>
                      ))}
                      <option value={NEW_BOX}>New merged calendar</option>
                    </select>
                  </label>
                </Chip>
              ))}
            </Box>

            {mergedBoxes.map((calendar) => (
              <Box
                key={calendar.id}
                id={calendar.id}
                title={calendar.name}
                hint={`${boxes[calendar.id].length} calendars, first one's copy wins`}
                items={boxes[calendar.id]}
                kind="merged"
                actions={
                  <>
                    <button type="button" className="merge-box-action" onClick={() => setRenaming(calendar)}>
                      Rename
                    </button>
                    <button type="button" className="merge-box-action is-danger" onClick={() => emptyBox(calendar.id)}>
                      Unmerge
                    </button>
                  </>
                }
              >
                {boxes[calendar.id].map((id, index) => (
                  <Chip key={id} id={id} feed={feedOf(id)} rank={index + 1}>
                    <ChipButtons
                      name={nameOf(id)}
                      first={index === 0}
                      onUp={() => moveUp(calendar.id, id)}
                      onOut={() => move(id, TRAY)}
                    />
                  </Chip>
                ))}
              </Box>
            ))}

            <Box
              id={NEW_BOX}
              title="New merged calendar"
              hint={boxes[NEW_BOX].length ? "Drop one more to merge them." : "Drop two or more calendars here."}
              items={boxes[NEW_BOX]}
              kind="new"
            >
              {boxes[NEW_BOX].map((id, index) => (
                <Chip key={id} id={id} feed={feedOf(id)} rank={index + 1}>
                  <ChipButtons name={nameOf(id)} first={index === 0} onUp={() => moveUp(NEW_BOX, id)} onOut={() => move(id, TRAY)} />
                </Chip>
              ))}
            </Box>
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
            const id = renaming.id;
            setRenaming(null);
            setUndo({ merged, draft });
            onMerged(merged.map((calendar) => (calendar.id === id ? { ...calendar, name } : calendar)));
            setStatus(`Renamed to ${name}.`);
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
  kind: "tray" | "merged" | "new";
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
