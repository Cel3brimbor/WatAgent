"use client";

import { useId, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripIcon } from "@/shared/icons";
import { useDialog } from "@/shared/use-dialog";
import styles from "./merge-function-dialog.module.css";

type Source = { id: string; name: string; color?: string; usedBy?: string };
type Props = {
  name: string;
  members: string[];
  sources: Source[];
  editing: boolean;
  onCancel: () => void;
  onSave: (name: string, members: string[]) => void;
};

export function MergeFunctionDialog({ name: initialName, members: initialMembers, sources, editing, onCancel, onSave }: Props) {
  const [error, setError] = useState("");
  const [name, setName] = useState(initialName);
  const [members, setMembers] = useState(initialMembers);
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  useDialog(ref, { open: true, onEscape: onCancel });
  const valid = name.trim().length > 0 && members.length >= 2;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setMembers((current) => arrayMove(current, current.indexOf(String(active.id)), current.indexOf(String(over.id))));
  }

  return (
    <div className="modal-backdrop" data-state="open" onClick={onCancel}>
      <div
        ref={ref}
        className={`modal ${styles.dialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>{editing ? "Edit merge function" : "Create a calendar"}</h2>
        <p className="modal-hint">
          Apply Merge to combine sources into one calendar. Shared events appear once; the first source takes priority.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) {
              try {
                onSave(name.trim(), members);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Unable to save this merge.");
              }
            }
          }}
        >
          <label className={styles.field}>
            Calendar name
            <input autoFocus required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <div className={styles.flow}>
            <span>{members.length} sources</span>
            <span aria-hidden="true">→</span>
            <strong>Merge</strong>
            <span aria-hidden="true">→</span>
            <span>{name.trim() || "New calendar"}</span>
          </div>
          <fieldset className={styles.sources}>
            <legend>
              Sources <span>Choose at least two</span>
            </legend>
            {sources.map((source) => (
              <label key={source.id} className={styles.source}>
                <input
                  type="checkbox"
                  checked={members.includes(source.id)}
                  onChange={(event) =>
                    setMembers((current) => (event.target.checked ? [...current, source.id] : current.filter((id) => id !== source.id)))
                  }
                />
                <span>
                  {source.name}
                  {source.usedBy ? <small>Moves from {source.usedBy}</small> : null}
                </span>
              </label>
            ))}
            {!sources.length ? <p className="modal-hint">Import at least two calendars to use Merge.</p> : null}
          </fieldset>
          {members.length > 1 ? (
            <div className={styles.priority}>
              <span className={styles.priorityTitle}>Source priority</span>
              <DndContext id="merge-function-priority" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={members} strategy={verticalListSortingStrategy}>
                  <ol className={styles.priorityList} aria-label="Source priority order">
                    {members.map((id, index) => (
                      <SortablePriorityRow
                        key={id}
                        id={id}
                        index={index}
                        name={sources.find((source) => source.id === id)?.name ?? id}
                        color={sources.find((source) => source.id === id)?.color}
                      />
                    ))}
                  </ol>
                </SortableContext>
              </DndContext>
              <span className={styles.priorityHint}>Drag to reorder. The first source wins when events overlap.</span>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="modal-hint">
              {error}
            </p>
          ) : null}
          <div className="modal-actions">
            <button type="button" className="ghost-btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="primary-btn" disabled={!valid}>
              {editing ? "Save merge" : "Create calendar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SortablePriorityRow({ id, index, name, color }: { id: string; index: number; name: string; color?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    transition: { duration: 240, easing: "cubic-bezier(0.25, 1, 0.5, 1)" },
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${styles.priorityItem}${isDragging ? ` ${styles.isDragging}` : ""}`}
    >
      <button
        type="button"
        className={styles.priorityHandle}
        aria-label={`Reorder ${name}`}
        title={`Drag to reorder ${name}`}
        {...attributes}
        {...listeners}
      >
        <GripIcon />
      </button>
      <span className={styles.priorityRank}>{index + 1}</span>
      {color ? <span className="calendars-swatch" style={{ background: color }} aria-hidden="true" /> : null}
      <span className={styles.priorityName}>{name}</span>
      {index === 0 ? <span className={styles.priorityBadge}>Wins</span> : null}
    </li>
  );
}
