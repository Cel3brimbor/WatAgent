"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
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
import { DISPLAY_ICON_LABELS, DisplayIcon } from "@/calendar/display-icon";
import { QuickDisplayArrange } from "@/calendar/quick-display-board";
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
  arranging: boolean;
  onArranging: (arranging: boolean) => void;
};

export function QuickDisplays({ displays, choices, samples, onOpen, onCreate, onUpdate, onDelete, arranging, onArranging }: Props) {
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
    <section className="qd-board" aria-label={arranging ? "Arrange calendars" : "Quick Displays"}>
      {arranging ? (
        <QuickDisplayArrange
          displays={displays}
          choices={choices}
          onBack={() => onArranging(false)}
          onOpen={onOpen}
          onNew={() => setCreating(true)}
          onUpdate={onUpdate}
        />
      ) : (
        <>
      <header className="qd-board-head">
        <div>
          <h3>Quick Displays</h3>
          <p>A shortcut shows the calendars you pick. Use Arrange calendars to drag them onto each display. Your calendar stays as it is.</p>
        </div>
        <button type="button" className="ghost-btn" onClick={() => onArranging(true)}>
          Arrange calendars
        </button>
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
            onArrange={() => {
              setMenuId(null);
              onArranging(true);
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
        </>
      )}
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
  onArrange,
  onRename,
  onDelete,
}: {
  display: CalendarSpace;
  menuOpen: boolean;
  onOpen: () => void;
  onMenu: () => void;
  onMenuClose: () => void;
  onEdit: () => void;
  onArrange: () => void;
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
    if (rect) setBox({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 196) });
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
          <button type="button" role="menuitem" onClick={onArrange}>Arrange calendars</button>
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
            aria-label={DISPLAY_ICON_LABELS[choice]}
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
