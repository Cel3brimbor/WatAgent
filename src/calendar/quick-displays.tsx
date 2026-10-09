"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  MAX_CALENDAR_SPACES,
  QUICK_DISPLAY_ICONS,
  newQuickDisplay,
  spaceNameError,
  type CalendarSpace,
  type QuickDisplayIcon,
  type SpaceCalendarChoice,
} from "@/calendar/calendar-spaces";
import { SmartTagsPanel, type SmartTagCalendarOption } from "@/calendar/smart-tags-panel";
import type { SmartTag, SmartTagTarget } from "@/calendar/smart-tags";
import { CheckIcon, DotsIcon, PlusIcon } from "@/calendar/sidebar-icons";
import { RenameCalendarDialog } from "@/calendar/imported-calendars-panel";
import { ConfirmDialog } from "@/shared/confirm-dialog";
import { useDialog } from "@/shared/use-dialog";
import { usePresence } from "@/shared/use-presence";

const GROUPS: SpaceCalendarChoice["group"][] = ["WatAgent", "Imported", "UWaterloo Events", "Google"];

type Props = {
  displays: CalendarSpace[];
  choices: SpaceCalendarChoice[];
  samples: SmartTagTarget[];
  onOpen: (id: string) => void;
  onCreate: (display: CalendarSpace) => void;
  onUpdate: (id: string, edit: (display: CalendarSpace) => CalendarSpace) => void;
  onDelete: (id: string) => Promise<void>;
};

export function QuickDisplays({ displays, choices, samples, onOpen, onCreate, onUpdate, onDelete }: Props) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const editingDisplay = displays.find((display) => display.id === editing) ?? null;
  const renamingDisplay = displays.find((display) => display.id === renaming) ?? null;
  const deletingDisplay = displays.find((display) => display.id === deleting) ?? null;

  return (
    <section className="qd-board" aria-label="Quick Displays">
      <header className="qd-board-head">
        <div>
          <h3>Quick Displays</h3>
          <p>A shortcut shows the calendars you pick. Your calendar stays as it is.</p>
        </div>
      </header>
      {renameError ? <p className="calendar-import-error" role="alert">{renameError}</p> : null}
      <div className="qd-grid">
        {displays.map((display) => (
          <DisplayTile
            key={display.id}
            display={display}
            menuOpen={menuId === display.id}
            onOpen={() => onOpen(display.id)}
            onMenu={() => setMenuId((current) => (current === display.id ? null : display.id))}
            onMenuClose={() => setMenuId(null)}
            onEdit={() => {
              setMenuId(null);
              setEditing(display.id);
            }}
            onRename={() => {
              setMenuId(null);
              setRenameError(null);
              setRenaming(display.id);
            }}
            onDelete={() => {
              setMenuId(null);
              setDeleting(display.id);
            }}
          />
        ))}
        <button
          type="button"
          className="qd-tile qd-tile-new"
          disabled={displays.length >= MAX_CALENDAR_SPACES}
          onClick={() => setCreating(true)}
        >
          <span className="qd-tile-icon" aria-hidden="true"><PlusIcon /></span>
          <span className="qd-tile-name">New</span>
        </button>
      </div>
      {creating ? (
        <CreateDisplayDialog
          displays={displays}
          choices={choices}
          onCancel={() => setCreating(false)}
          onCreate={(display) => {
            setCreating(false);
            onCreate(display);
          }}
        />
      ) : null}
      {editingDisplay ? (
        <EditDisplayDialog
          display={editingDisplay}
          choices={choices}
          samples={samples}
          onClose={() => setEditing(null)}
          onUpdate={(edit) => onUpdate(editingDisplay.id, edit)}
        />
      ) : null}
      {renamingDisplay ? (
        <RenameCalendarDialog
          name={renamingDisplay.name}
          title="Rename Quick Display"
          fieldLabel="Name"
          submitLabel="Save name"
          onCancel={() => setRenaming(null)}
          onSave={(name) => {
            const problem = spaceNameError(displays, name, renamingDisplay.id);
            if (problem) {
              setRenameError(problem);
              setRenaming(null);
              return;
            }
            setRenameError(null);
            onUpdate(renamingDisplay.id, (display) => ({ ...display, name: name.trim() }));
            setRenaming(null);
          }}
        />
      ) : null}
      {deletingDisplay ? (
        <ConfirmDialog
          title={`Delete ${deletingDisplay.name}?`}
          message="This removes the shortcut. Your calendars and events stay on Calendar."
          confirmLabel={deleteBusy ? "Deleting…" : "Delete"}
          onCancel={() => {
            if (!deleteBusy) setDeleting(null);
          }}
          onConfirm={() => {
            if (deleteBusy) return;
            setDeleteBusy(true);
            void onDelete(deletingDisplay.id).catch(() => undefined).finally(() => {
              setDeleteBusy(false);
              setDeleting(null);
            });
          }}
        />
      ) : null}
    </section>
  );
}

function DisplayTile({
  display,
  menuOpen,
  onOpen,
  onMenu,
  onMenuClose,
  onEdit,
  onRename,
  onDelete,
}: {
  display: CalendarSpace;
  menuOpen: boolean;
  onOpen: () => void;
  onMenu: () => void;
  onMenuClose: () => void;
  onEdit: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const presence = usePresence(menuOpen);
  const menu = presence.value;
  const moreRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!menuOpen) return;
    const rect = moreRef.current?.getBoundingClientRect();
    if (rect) setBox({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 168) });
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || moreRef.current?.contains(target)) return;
      onMenuClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onMenuClose();
      moreRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, onMenuClose]);

  return (
    <div className="qd-tile-wrap">
      <button type="button" className="qd-tile" onClick={onOpen}>
        <span className="qd-tile-icon" aria-hidden="true"><DisplayIcon id={display.icon} /></span>
        <span className="qd-tile-name">{display.name}</span>
      </button>
      <button
        ref={moreRef}
        type="button"
        className="qd-more"
        aria-haspopup="menu"
        aria-expanded={presence.open}
        aria-label={`${display.name} actions`}
        onClick={onMenu}
      >
        <DotsIcon />
      </button>
      {menu ? createPortal(
        <div
          ref={menuRef}
          className="qd-menu"
          role="menu"
          aria-label={display.name}
          data-state={presence.open ? "open" : "closed"}
          inert={!presence.open}
          style={{ top: box.top, left: box.left }}
        >
          <button type="button" role="menuitem" onClick={onEdit}>Edit</button>
          <button type="button" role="menuitem" onClick={onRename}>Rename</button>
          <button type="button" role="menuitem" className="qd-menu-delete" onClick={onDelete}>Delete</button>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function CreateDisplayDialog({
  displays,
  choices,
  onCancel,
  onCreate,
}: {
  displays: CalendarSpace[];
  choices: SpaceCalendarChoice[];
  onCancel: () => void;
  onCreate: (display: CalendarSpace) => void;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<QuickDisplayIcon>("layers");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const inputId = useId();
  useDialog(ref, { open: true, onEscape: onCancel, initialFocus: inputRef });
  const selected = new Set(picked);

  function toggle(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const problem = spaceNameError(displays, name);
    if (problem) {
      setError(problem);
      return;
    }
    if (picked.length === 0) {
      setError("Choose at least one calendar.");
      return;
    }
    onCreate(newQuickDisplay(name, icon, picked, displays));
  }

  const ready = name.trim().length > 0 && picked.length > 0;

  return (
    <div className="modal-backdrop" role="presentation" data-state="open" onClick={onCancel}>
      <div
        ref={ref}
        className="modal qd-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <form onSubmit={submit}>
          <header className="qd-sheet-bar">
            <button type="button" className="qd-sheet-text" onClick={onCancel}>Cancel</button>
            <h2 id={titleId}>New Quick Display</h2>
            <button type="submit" className="qd-sheet-text is-commit" disabled={!ready}>Create</button>
          </header>
          <div className="qd-sheet-body">
            <input
              ref={inputRef}
              id={inputId}
              className="qd-name"
              value={name}
              placeholder="Drop-in schedule"
              aria-label="Name"
              maxLength={40}
              required
              autoComplete="off"
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
            />
            <IconPicker icon={icon} onIcon={setIcon} />
            <CalendarChecklist choices={choices} selected={selected} onToggle={toggle} />
            {error ? <p className="qd-error" role="alert">{error}</p> : null}
          </div>
        </form>
      </div>
    </div>
  );
}

function EditDisplayDialog({
  display,
  choices,
  samples,
  onClose,
  onUpdate,
}: {
  display: CalendarSpace;
  choices: SpaceCalendarChoice[];
  samples: SmartTagTarget[];
  onClose: () => void;
  onUpdate: (edit: (display: CalendarSpace) => CalendarSpace) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [tagsOpen, setTagsOpen] = useState(true);
  const [colorFor, setColorFor] = useState<string | null>(null);
  useDialog(ref, { open: true, onEscape: onClose });
  const included = new Set(display.includedCalendarIds);
  const tagCalendars: SmartTagCalendarOption[] = choices
    .filter((choice) => included.has(choice.id))
    .map((choice) => ({ id: choice.id, name: choice.name, google: choice.group === "Google" }));
  const tagSamples = samples.filter((sample) => included.has(sample.calendarId));

  function toggle(id: string) {
    onUpdate((current) => ({
      ...current,
      includedCalendarIds: current.includedCalendarIds.includes(id)
        ? current.includedCalendarIds.filter((entry) => entry !== id)
        : [...current.includedCalendarIds, id],
    }));
  }

  function paint(id: string, color: string) {
    onUpdate((current) => ({
      ...current,
      colorOverrides: { ...current.colorOverrides, [id]: color },
    }));
  }

  function setTags(tags: SmartTag[]) {
    onUpdate((current) => ({ ...current, smartTags: tags }));
  }

  return (
    <div className="modal-backdrop" role="presentation" data-state="open" onClick={onClose}>
      <div
        ref={ref}
        className="modal qd-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="qd-sheet-bar">
          <span />
          <h2 id={titleId}>{display.name}</h2>
          <button type="button" className="qd-sheet-text is-commit" onClick={onClose}>Done</button>
        </header>
        <div className="qd-sheet-body">
          <CalendarChecklist
            choices={choices}
            selected={included}
            colors={display.colorOverrides}
            colorFor={colorFor}
            onToggle={toggle}
            onColorToggle={setColorFor}
            onColor={paint}
          />
          <SmartTagsPanel
            tags={display.smartTags}
            onChange={setTags}
            calendars={tagCalendars}
            samples={tagSamples}
            open={tagsOpen}
            onOpenChange={setTagsOpen}
          />
        </div>
      </div>
    </div>
  );
}

function IconPicker({ icon, onIcon }: { icon: QuickDisplayIcon; onIcon: (icon: QuickDisplayIcon) => void }) {
  return (
    <section className="qd-icons" aria-labelledby="qd-icon-label">
      <h3 id="qd-icon-label">Icon</h3>
      <div className="qd-icon-row" role="radiogroup" aria-label="Icon">
        {QUICK_DISPLAY_ICONS.map((choice) => (
          <button
            key={choice}
            type="button"
            role="radio"
            className={`qd-icon-choice${choice === icon ? " is-on" : ""}`}
            aria-checked={choice === icon}
            aria-label={ICON_LABELS[choice]}
            onClick={() => onIcon(choice)}
          >
            <DisplayIcon id={choice} />
          </button>
        ))}
      </div>
    </section>
  );
}

function CalendarChecklist({
  choices,
  selected,
  colors,
  colorFor,
  onToggle,
  onColorToggle,
  onColor,
}: {
  choices: SpaceCalendarChoice[];
  selected: Set<string>;
  colors?: Record<string, string>;
  colorFor?: string | null;
  onToggle: (id: string) => void;
  onColorToggle?: (id: string | null) => void;
  onColor?: (id: string, color: string) => void;
}) {
  if (choices.length === 0) {
    return <p className="qd-empty">Add a calendar on Calendar first.</p>;
  }
  return (
    <div className="qd-choices">
      {GROUPS.map((group) => {
        const rows = choices.filter((choice) => choice.group === group);
        if (rows.length === 0) return null;
        return (
          <section key={group}>
            <h3>{group}</h3>
            <ul className="qd-inset">
              {rows.map((choice) => {
                const on = selected.has(choice.id);
                const color = colors?.[choice.id] || choice.color;
                const painting = colorFor === choice.id;
                const colorSwatch = (
                  <span className="qd-cal-swatch" style={{ background: color }} aria-hidden="true" />
                );
                const colorEditable = on && onColor && onColorToggle;
                return (
                  <li key={choice.id}>
                    <div className={`qd-row${colorEditable ? " has-color-btn" : ""}`}>
                      {colorEditable ? (
                        <button
                          type="button"
                          className={`qd-cal-swatch${painting ? " is-on" : ""}`}
                          style={{ background: color }}
                          aria-label={`${choice.name} color`}
                          aria-expanded={painting}
                          onClick={() => onColorToggle(painting ? null : choice.id)}
                        />
                      ) : null}
                      <button
                        type="button"
                        className="qd-row-hit"
                        aria-pressed={on}
                        onClick={() => onToggle(choice.id)}
                      >
                        {colorEditable ? null : colorSwatch}
                        <span className="qd-row-name">{choice.name}</span>
                        <span className="qd-mark" aria-hidden="true">{on ? <CheckIcon /> : null}</span>
                      </button>
                    </div>
                    {painting && onColor ? (
                      <div className="qd-palette" role="listbox" aria-label={`${choice.name} color`}>
                        {SWATCHES.map((swatch) => (
                          <button
                            key={swatch}
                            type="button"
                            role="option"
                            className={`space-color${swatch === color ? " is-on" : ""}`}
                            style={{ background: swatch }}
                            aria-selected={swatch === color}
                            aria-label={swatch}
                            onClick={() => onColor(choice.id, swatch)}
                          />
                        ))}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const SWATCHES = ["#4986e7", "#9fc6e7", "#16a765", "#42d692", "#ffad46", "#f83a22", "#f691b2", "#a47ae2", "#b3dc6c", "#ac725e", "#9a9cff", "#cabdbf"];

const ICON_LABELS: Record<QuickDisplayIcon, string> = {
  layers: "Layers",
  sun: "Sun",
  moon: "Moon",
  book: "Book",
  bolt: "Bolt",
  heart: "Heart",
  star: "Star",
  flag: "Flag",
  leaf: "Leaf",
  bell: "Bell",
  pin: "Pin",
  compass: "Compass",
};

export function DisplayIcon({ id }: { id: QuickDisplayIcon }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      {ICON_PATHS[id]}
    </svg>
  );
}

const ICON_PATHS: Record<QuickDisplayIcon, ReactNode> = {
  layers: (
    <>
      <rect x="3.25" y="3.25" width="9.5" height="6.2" rx="1.3" />
      <path d="M4.4 11.6h7.2M5.4 13.35h5.2" />
    </>
  ),
  sun: (
    <>
      <circle cx="8" cy="8" r="2.35" />
      <path d="M8 2.35v1.45M8 12.2v1.45M2.35 8h1.45M12.2 8h1.45M4.05 4.05l1.05 1.05M10.9 10.9l1.05 1.05M11.95 4.05 10.9 5.1M5.1 10.9l-1.05 1.05" />
    </>
  ),
  moon: <path d="M10.2 2.6a5.15 5.15 0 1 0 3.2 8.9 4.35 4.35 0 0 1-3.2-8.9z" />,
  book: (
    <>
      <path d="M3.2 3.1h4.1c.7.7 1.5 1.05 2.35 1.05H12.8V13H8.7c-.7 0-1.4-.25-2.05-.75" />
      <path d="M3.2 3.1v9.15c.65.5 1.35.75 2.05.75H8" />
    </>
  ),
  bolt: <path d="M9.1 2.4 4.2 8.7h3.1L6.6 13.6l5.2-6.5H8.6z" />,
  heart: <path d="M8 13.2 3.4 8.7a2.7 2.7 0 0 1 3.8-3.8L8 5.7l.8-.8a2.7 2.7 0 0 1 3.8 3.8z" />,
  star: <path d="m8 2.5 1.45 3.15 3.45.4-2.55 2.35.7 3.4L8 10.15 4.95 11.8l.7-3.4L3.1 6.05l3.45-.4z" />,
  flag: (
    <>
      <path d="M4.25 2.6v11" />
      <path d="M4.25 3.2h7.1l-1.35 2.15 1.35 2.15H4.25" />
    </>
  ),
  leaf: <path d="M13 3.1S8.2 3.4 5.6 6.4 3.2 12.8 3.2 12.8s4.2-.2 6.6-2.8S13 3.1 13 3.1zM5.4 10.6l3.3-3.3" />,
  bell: (
    <>
      <path d="M8 2.6a.7.7 0 0 1 .7.7c1.7.3 2.9 1.7 2.9 3.5v2.1l.9 1.5H3.5l.9-1.5V6.8c0-1.8 1.2-3.2 2.9-3.5a.7.7 0 0 1 .7-.7z" />
      <path d="M6.7 11.6a1.35 1.35 0 0 0 2.6 0" />
    </>
  ),
  pin: (
    <>
      <path d="M8 14.2s4.1-3.7 4.1-6.7a4.1 4.1 0 1 0-8.2 0c0 3 4.1 6.7 4.1 6.7z" />
      <circle cx="8" cy="7.4" r="1.35" />
    </>
  ),
  compass: (
    <>
      <circle cx="8" cy="8" r="5.35" />
      <path d="m9.7 6.3-1.1 3.3-3.3 1.1 1.1-3.3z" />
    </>
  ),
};
