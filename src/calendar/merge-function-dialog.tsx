"use client";

import { useId, useRef, useState } from "react";
import { useDialog } from "@/shared/use-dialog";
import styles from "./merge-function-dialog.module.css";

type Source = { id: string; name: string; usedBy?: string };
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
  useDialog(ref, { open: true, onEscape: onCancel });
  const valid = name.trim().length > 0 && members.length >= 2;
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
              <span>Source priority</span>
              {members.map((id, index) => (
                <div key={id}>
                  <span>
                    {index + 1}. {sources.find((source) => source.id === id)?.name}
                  </span>
                  <button
                    type="button"
                    disabled={index === 0}
                    aria-label={`Move ${sources.find((source) => source.id === id)?.name} up`}
                    onClick={() =>
                      setMembers((current) => {
                        const next = [...current];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        return next;
                      })
                    }
                  >
                    ↑
                  </button>
                </div>
              ))}
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
