"use client";

import {
  forwardRef,
  memo,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent,
  type DragEvent,
  type InputEvent,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { CalendarBadgePopover } from "@/agent/calendar-badge";
import {
  calendarToken,
  isAttachableCalendarId,
  mentionAtCaret,
  messagePieces,
  matchCalendars,
  type MentionCalendar,
} from "@/agent/calendar-mention";
import { filesFromClipboard } from "@/agent/chat-image";
import { HEX_COLOR } from "@/calendar/preferences";
import type { CalendarItemDoc } from "@/calendar/types";

const MAX_CHARS = 20_000;
const MAX_ATTACHED = 8;

type MentionState = { start: number; query: string; index: number };

type ReadValue = { text: string; calendarIds: string[] };

export type MentionFieldHandle = {
  read: () => ReadValue;
  clear: () => void;
  focus: () => void;
};

type Props = {
  calendars: MentionCalendar[];
  items: CalendarItemDoc[];
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  initialText?: string;
  initialCalendarIds?: string[];
  openCalendarId: string | null;
  onOpenCalendar: (id: string | null) => void;
  onEditItem?: (item: CalendarItemDoc) => void;
  onChange?: (value: ReadValue) => void;
  /** Enter sends. Shift+Enter always inserts a line. Cmd+Enter sends either way. */
  enterSends?: boolean;
  onEnter?: () => void;
  onEscape?: () => void;
  onPasteFiles?: (files: File[]) => void;
  attachRequest?: { id: string; nonce: number } | null;
  ariaLabel?: string;
};

export const MentionField = forwardRef<MentionFieldHandle, Props>(function MentionField(
  {
    calendars,
    items,
    className,
    placeholder,
    disabled = false,
    initialText = "",
    initialCalendarIds,
    openCalendarId,
    onOpenCalendar,
    onEditItem,
    onChange,
    enterSends = false,
    onEnter,
    onEscape,
    onPasteFiles,
    attachRequest,
    ariaLabel = "Message",
  },
  ref,
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const lastGood = useRef("");
  const emptyRef = useRef(!initialText.trim() && !(initialCalendarIds?.length));
  const filled = useRef(false);
  const handledAttach = useRef<number | null>(null);
  const [mention, setMention] = useState<MentionState | null>(null);
  const calendarsRef = useRef(calendars);
  calendarsRef.current = calendars;
  const bind = useRef<EditorBind>({
    onInput: () => undefined,
    onKeyDown: () => undefined,
    onPaste: () => undefined,
    onDrop: () => undefined,
    onPointerDown: () => undefined,
    onClick: () => undefined,
    onFocus: () => undefined,
    onBlur: () => undefined,
    onBeforeInput: () => undefined,
  });
  const ariaRef = useRef({ expanded: false, listId: "", active: "" });
  const listId = useId();

  function read(): ReadValue {
    const root = editorRef.current;
    if (!root) return { text: "", calendarIds: [] };
    return readEditor(root);
  }

  function publish() {
    const root = editorRef.current;
    if (!root) return;
    const value = readEditor(root);
    if (value.text.length > MAX_CHARS) {
      root.innerHTML = lastGood.current;
      placeCaretEnd(root);
      return;
    }
    lastGood.current = root.innerHTML;
    const blank =
      !root.textContent?.replace(/\u00a0/g, " ").trim() && !root.querySelector("[data-calendar-id]");
    emptyRef.current = blank;
    root.dataset.empty = blank ? "true" : "false";
    const found = mentionIn(root);
    setMention((current) => {
      if (!found) return null;
      if (current && current.start === found.start && current.query === found.query) return current;
      return { ...found, index: 0 };
    });
    onChange?.(value);
  }

  useImperativeHandle(ref, () => ({
    read,
    clear() {
      const root = editorRef.current;
      if (!root) return;
      root.replaceChildren();
      emptyRef.current = true;
      root.dataset.empty = "true";
      lastGood.current = "";
      setMention(null);
      onChange?.({ text: "", calendarIds: [] });
    },
    focus() {
      editorRef.current?.focus();
    },
  }));

  useEffect(() => {
    const root = editorRef.current;
    if (!root || filled.current) return;
    filled.current = true;
    fillEditor(root, initialText, initialCalendarIds, calendarsRef.current);
    lastGood.current = root.innerHTML;
    const blank =
      !root.textContent?.replace(/\u00a0/g, " ").trim() && !root.querySelector("[data-calendar-id]");
    emptyRef.current = blank;
    root.dataset.empty = blank ? "true" : "false";
    onChange?.(readEditor(root));
    //fill once; a remount (edit key) starts again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!attachRequest || handledAttach.current === attachRequest.nonce) return;
    const root = editorRef.current;
    const calendar = calendars.find((row) => row.id === attachRequest.id);
    if (!root || !calendar) return;
    handledAttach.current = attachRequest.nonce;
    insertChip(root, calendar, null);
    publish();
    root.focus();
    //publish reads the latest calendars through the ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachRequest, calendars]);

  useEffect(() => {
    const root = editorRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLButtonElement>(".cal-badge").forEach((button) => {
      const id = button.closest<HTMLElement>("[data-calendar-id]")?.dataset.calendarId;
      const open = Boolean(id && id === openCalendarId);
      button.setAttribute("aria-expanded", open ? "true" : "false");
      button.classList.toggle("is-open", open);
    });
  }, [openCalendarId]);

  //react must not own the editor's children, or a re-render deletes the chips and the caret
  useLayoutEffect(() => {
    const root = editorRef.current;
    if (!root) return;
    if (editorDomWasWiped(root, lastGood.current)) root.innerHTML = lastGood.current;
    root.dataset.empty = emptyRef.current ? "true" : "false";
    if (placeholder) root.dataset.placeholder = placeholder;
    root.setAttribute("aria-expanded", ariaRef.current.expanded ? "true" : "false");
    if (ariaRef.current.active) root.setAttribute("aria-activedescendant", ariaRef.current.active);
    else root.removeAttribute("aria-activedescendant");
    if (ariaRef.current.expanded) root.setAttribute("aria-controls", ariaRef.current.listId);
    else root.removeAttribute("aria-controls");
    placeMenu(editorRef.current, menuRef.current);
  });

  useEffect(() => {
    if (!mention) return;
    function place() {
      placeMenu(editorRef.current, menuRef.current);
    }
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [mention]);

  const value = read();
  const capped = value.calendarIds.length >= MAX_ATTACHED;
  const matches = mention && !capped ? matchCalendars(calendars, mention.query, value.calendarIds) : [];
  const active = matches.length ? Math.min(mention?.index ?? 0, matches.length - 1) : 0;
  const openCalendar = calendars.find((calendar) => calendar.id === openCalendarId) ?? null;
  ariaRef.current = {
    expanded: mention != null,
    listId,
    active: mention && matches[active] ? `${listId}-opt-${matches[active].id}` : "",
  };

  function accept(calendar: MentionCalendar) {
    const root = editorRef.current;
    if (!root || !mention) return;
    insertChip(root, calendar, mention);
    setMention(null);
    publish();
    root.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    if (mention && matches.length > 0 && !event.nativeEvent.isComposing) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMention((current) => (current ? { ...current, index: (active + 1) % matches.length } : current));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMention((current) =>
          current ? { ...current, index: (active - 1 + matches.length) % matches.length } : current,
        );
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        event.preventDefault();
        accept(matches[active]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMention(null);
        return;
      }
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape?.();
    }
    if (event.key === "Backspace" && !event.nativeEvent.isComposing) {
      const root = editorRef.current;
      if (root && handleChipBackspace(root)) {
        event.preventDefault();
        publish();
        return;
      }
    }
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if ((event.metaKey || event.ctrlKey) || (!event.shiftKey && enterSends)) {
        onEnter?.();
        return;
      }
      document.execCommand("insertLineBreak");
      publish();
    }
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const files = filesFromClipboard(event.clipboardData);
    const text = event.clipboardData.getData("text/plain").replace(/\r\n/g, "\n");
    if (files.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      onPasteFiles?.(files);
      if (!text) return;
      document.execCommand("insertText", false, text);
      publish();
      return;
    }
    event.preventDefault();
    if (!text) return;
    document.execCommand("insertText", false, text);
    publish();
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    onPasteFiles?.(files);
  }

  function onBeforeInput(event: InputEvent<HTMLDivElement>) {
    if (disabled || event.nativeEvent.isComposing) return;
    if (event.nativeEvent.inputType !== "deleteContentForward") return;
    const root = editorRef.current;
    if (!root) return;
    syncChipTails(root);
    const wrap = chipAfterCaret(root);
    if (!wrap) return;
    event.preventDefault();
    removeChipWrap(wrap);
    publish();
  }

  function onEditorClick() {
    const root = editorRef.current;
    publish();
    if (!root) return;
    requestAnimationFrame(() => repairCaretNearChips(root));
  }

  function onFocus() {
    const root = editorRef.current;
    if (!root || disabled) return;
    syncChipTails(root);
    lastGood.current = root.innerHTML;
    requestAnimationFrame(() => {
      repairCaretNearChips(root);
    });
  }

  function onBlur() {
    const root = editorRef.current;
    if (!root) return;
    syncChipTails(root);
    lastGood.current = root.innerHTML;
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const wrap = target.closest<HTMLElement>("[data-calendar-id]");
    if (!wrap || !editorRef.current?.contains(wrap)) return;
    event.preventDefault();
    if (target.closest(".cal-badge-remove")) {
      const next = wrap.nextSibling;
      wrap.remove();
      if (next) placeCaret(next, 0);
      else placeCaretEnd(editorRef.current);
      onOpenCalendar(null);
      publish();
      return;
    }
    const badge = wrap.querySelector<HTMLButtonElement>(".cal-badge");
    if (!badge) return;
    anchorRef.current = badge;
    const id = wrap.dataset.calendarId ?? "";
    onOpenCalendar(openCalendarId === id ? null : id);
  }

  bind.current = {
    onInput: publish,
    onKeyDown,
    onPaste,
    onDrop,
    onPointerDown,
    onClick: onEditorClick,
    onFocus,
    onBlur,
    onBeforeInput,
  };

  const menu = mention ? (
        <div ref={menuRef} className="mention-menu is-floating" id={listId} role="listbox" aria-label="Calendars">
          {capped ? (
            <p className="mention-empty">You can attach up to 8 calendars</p>
          ) : matches.length === 0 ? (
            <p className="mention-empty">No matching calendars</p>
          ) : (
            matches.map((calendar, index) => (
              <button
                key={calendar.id}
                type="button"
                id={`${listId}-opt-${calendar.id}`}
                role="option"
                aria-selected={index === active}
                className={`mention-option${index === active ? " is-active" : ""}${calendar.readOnly ? " is-read-only" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setMention((current) => (current ? { ...current, index } : current))}
                onClick={() => accept(calendar)}
              >
                <span
                  className="cal-badge-dot"
                  style={HEX_COLOR.test(calendar.color) ? ({ "--cal": calendar.color } as CSSProperties) : undefined}
                  aria-hidden="true"
                />
                <span>
                  {calendar.readOnly ? (
                    <>
                      {calendar.name} <span className="mention-read-only">(read only)</span>
                    </>
                  ) : (
                    highlightName(calendar.name, mention.query)
                  )}
                </span>
              </button>
            ))
          )}
        </div>
  ) : null;

  return (
    <div className="mention-field">
      {menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
      <EditorSurface
        editorRef={editorRef}
        bind={bind}
        className={className}
        disabled={disabled}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
      />
      {openCalendar ? (
        <CalendarBadgePopover
          key={openCalendar.id}
          calendar={openCalendar}
          items={items}
          anchor={anchorRef}
          onClose={() => onOpenCalendar(null)}
          onEditItem={openCalendar.readOnly ? undefined : onEditItem}
        />
      ) : null}
    </div>
  );
});

function readEditor(root: HTMLElement): ReadValue {
  let text = "";
  const calendarIds: string[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += (node.textContent ?? "").replace(/\u00a0/g, " ");
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const id = node.dataset.calendarId;
    if (id && isAttachableCalendarId(id)) {
      if (!calendarIds.includes(id) && calendarIds.length < MAX_ATTACHED) calendarIds.push(id);
      text += calendarToken(id);
      return;
    }
    if (node.tagName === "BR") {
      text += "\n";
      return;
    }
    const block = node.tagName === "DIV" || node.tagName === "P";
    if (block && text && !text.endsWith("\n")) text += "\n";
    node.childNodes.forEach(visit);
  };
  root.childNodes.forEach(visit);
  return { text, calendarIds };
}

function fillEditor(root: HTMLElement, text: string, extraIds: string[] | undefined, calendars: MentionCalendar[]) {
  root.replaceChildren();
  for (const piece of messagePieces(text, extraIds)) {
    if (piece.kind === "calendar") {
      const calendar = calendars.find((row) => row.id === piece.id);
      if (calendar) root.append(chipNode(calendar));
      continue;
    }
    const lines = piece.text.split("\n");
    lines.forEach((line, index) => {
      if (index > 0) root.append(document.createElement("br"));
      if (line) root.append(document.createTextNode(line));
    });
  }
}

function chipNode(calendar: MentionCalendar): HTMLSpanElement {
  const wrap = document.createElement("span");
  wrap.className = "cal-badge-wrap";
  wrap.dataset.calendarId = calendar.id;
  wrap.contentEditable = "false";
  if (HEX_COLOR.test(calendar.color)) wrap.style.setProperty("--cal", calendar.color);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cal-badge";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", `${calendar.name} calendar`);
  const dot = document.createElement("span");
  dot.className = "cal-badge-dot";
  dot.setAttribute("aria-hidden", "true");
  const name = document.createElement("span");
  name.className = "cal-badge-name";
  name.textContent = calendar.name;
  if (calendar.readOnly) {
    const tag = document.createElement("span");
    tag.className = "cal-badge-read-only";
    tag.textContent = " (read only)";
    name.append(tag);
  }
  button.append(dot, name);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "cal-badge-remove";
  remove.setAttribute("aria-label", `Remove ${calendar.name}`);
  remove.innerHTML =
    '<svg viewBox="0 0 16 16" class="glyph" aria-hidden="true" focusable="false"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>';
  wrap.append(button, remove);
  return wrap;
}

function insertChip(root: HTMLElement, calendar: MentionCalendar, mention: { start: number; query: string } | null): boolean {
  if (root.querySelector(`[data-calendar-id="${CSS.escape(calendar.id)}"]`)) return false;
  if (root.querySelectorAll("[data-calendar-id]").length >= MAX_ATTACHED) return false;
  const chip = chipNode(calendar);
  const text = mention ? mentionText(root, mention) : null;
  if (text && mention) {
    const token = `@${mention.query}`;
    const at = text.data.slice(mention.start, mention.start + token.length) === token ? mention.start : text.data.lastIndexOf(token);
    let before = text.data.slice(0, Math.max(0, at));
    const after = text.data.slice(Math.max(0, at) + token.length);
    if (before && !/\s$/.test(before)) before = `${before} `;
    text.data = before;
    const visible = after.startsWith(" ") ? after : ` ${after}`;
    const rest = document.createTextNode(visible);
    text.after(chip, rest);
    placeCaret(rest, visible.length);
    syncChipTails(root);
    return true;
  }
  const rest = document.createTextNode(" ");
  root.append(chip, rest);
  placeCaret(rest, 1);
  syncChipTails(root);
  return true;
}

function mentionText(root: HTMLElement, mention: { start: number; query: string }): Text | null {
  const token = `@${mention.query}`;
  const sel = window.getSelection();
  const node = sel?.anchorNode;
  if (node?.nodeType === Node.TEXT_NODE && root.contains(node)) {
    const text = node as Text;
    if (text.data.slice(mention.start, mention.start + token.length) === token || text.data.includes(token)) return text;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if ((current as Text).data.includes(token)) return current as Text;
    current = walker.nextNode();
  }
  return null;
}

function placeMenu(editor: HTMLElement | null, menu: HTMLDivElement | null) {
  if (!editor || !menu) return;
  const rect = editor.getBoundingClientRect();
  const width = Math.min(Math.max(rect.width, 180), window.innerWidth - 16);
  let left = rect.left;
  if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
  menu.style.left = `${left}px`;
  menu.style.width = `${width}px`;
  menu.style.bottom = `${window.innerHeight - rect.top + 6}px`;
}

type EditorBind = {
  onInput: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onClick: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onBeforeInput: (event: InputEvent<HTMLDivElement>) => void;
};

const EditorSurface = memo(function EditorSurface({
  editorRef,
  bind,
  className,
  disabled,
  placeholder,
  ariaLabel,
}: {
  editorRef: RefObject<HTMLDivElement | null>;
  bind: RefObject<EditorBind>;
  className?: string;
  disabled: boolean;
  placeholder?: string;
  ariaLabel: string;
}) {
  return (
    <div
      ref={editorRef}
      className={className}
      contentEditable={disabled ? "false" : "true"}
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      aria-autocomplete="list"
      data-placeholder={placeholder}
      spellCheck
      onInput={() => bind.current?.onInput()}
      onKeyDown={(event) => bind.current?.onKeyDown(event)}
      onPaste={(event) => bind.current?.onPaste(event)}
      onDragOver={(event) => {
        if ([...event.dataTransfer.types].includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => bind.current?.onDrop(event)}
      onPointerDown={(event) => bind.current?.onPointerDown(event)}
      onClick={() => bind.current?.onClick()}
      onFocus={() => bind.current?.onFocus()}
      onBlur={() => bind.current?.onBlur()}
      onBeforeInput={(event) => bind.current?.onBeforeInput(event)}
    />
  );
}, (prev, next) => prev.className === next.className && prev.disabled === next.disabled && prev.ariaLabel === next.ariaLabel);

function mentionIn(root: HTMLElement): { start: number; query: string } | null {
  const sel = window.getSelection();
  if (!sel?.anchorNode || !root.contains(sel.anchorNode) || sel.anchorNode.nodeType !== Node.TEXT_NODE) return null;
  return mentionAtCaret(sel.anchorNode.textContent ?? "", sel.anchorOffset);
}

function placeCaret(node: Node, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  const max = node.nodeType === Node.TEXT_NODE ? (node.textContent?.length ?? 0) : node.childNodes.length;
  range.setStart(node, Math.max(0, Math.min(offset, max)));
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function placeCaretEnd(root: HTMLElement) {
  const last = root.lastChild;
  if (!last) return;
  if (last.nodeType === Node.TEXT_NODE) placeCaret(last, last.textContent?.length ?? 0);
  else placeCaret(root, root.childNodes.length);
}

function editorDomWasWiped(root: HTMLElement, snapshot: string): boolean {
  if (!snapshot) return false;
  if (root.childNodes.length === 0) return true;
  if (!snapshot.includes("data-calendar-id")) return false;
  return !root.querySelector("[data-calendar-id]");
}

function syncChipTails(root: HTMLElement): boolean {
  let changed = false;
  root.querySelectorAll<HTMLElement>("[data-calendar-id]").forEach((wrap) => {
    let next = wrap.nextSibling;
    if (!next || next.nodeType !== Node.TEXT_NODE) {
      const gap = next instanceof HTMLElement && next.dataset.calendarId ? " " : " ";
      wrap.after(document.createTextNode(gap));
      changed = true;
      return;
    }
    const text = next as Text;
    while (text.nextSibling?.nodeType === Node.TEXT_NODE) {
      text.data += (text.nextSibling as Text).data;
      text.nextSibling.remove();
      changed = true;
    }
    const cleaned = text.data.replace(/\u200B/g, "");
    if (text.data !== cleaned) {
      text.data = cleaned;
      changed = true;
    }
  });
  return changed;
}

function placeCaretInChipTail(chip: HTMLElement) {
  const tail = chip.nextSibling;
  if (tail?.nodeType !== Node.TEXT_NODE) return;
  const text = tail as Text;
  placeCaret(text, text.data.length);
}

function handleChipBackspace(root: HTMLElement): boolean {
  syncChipTails(root);
  const action = chipDeleteOnBackspace(root);
  if (action?.kind === "remove-chip") {
    removeChipWrap(action.wrap);
    return true;
  }
  if (action?.kind === "remove-tail-space") {
    applyRemoveTailSpace(action.text);
    return true;
  }
  return false;
}

function repairCaretNearChips(root: HTMLElement) {
  const sel = window.getSelection();
  if (!sel?.isCollapsed || !sel.anchorNode || !root.contains(sel.anchorNode)) return;
  const { anchorNode, anchorOffset } = sel;

  const onChip = chipWrapContaining(root, anchorNode);
  if (onChip) {
    placeCaretInChipTail(onChip);
    return;
  }

  if (anchorNode === root) {
    const at = calendarChip(root.childNodes[anchorOffset] ?? null);
    if (at) {
      placeCaretInChipTail(at);
      return;
    }
    if (anchorOffset > 0) {
      const prev = calendarChip(root.childNodes[anchorOffset - 1] ?? null);
      if (prev) placeCaretInChipTail(prev);
    }
  }
}

type ChipDeleteAction =
  | { kind: "remove-chip"; wrap: HTMLElement }
  | { kind: "remove-tail-space"; text: Text };

function chipDeleteOnBackspace(root: HTMLElement): ChipDeleteAction | null {
  const sel = window.getSelection();
  if (!sel?.isCollapsed || !sel.anchorNode || !root.contains(sel.anchorNode)) return null;
  const { anchorNode, anchorOffset } = sel;

  const onChip = chipWrapContaining(root, anchorNode);
  if (onChip) return { kind: "remove-chip", wrap: onChip };

  if (anchorNode.nodeType === Node.TEXT_NODE) {
    return chipDeleteInTail(anchorNode as Text, anchorOffset);
  }

  if (anchorNode === root && anchorOffset > 0) {
    const chip = calendarChip(root.childNodes[anchorOffset - 1] ?? null);
    if (!chip) return null;
    const tail = chip.nextSibling;
    if (tail?.nodeType !== Node.TEXT_NODE) return { kind: "remove-chip", wrap: chip };
    return chipDeleteInTail(tail as Text, 0);
  }

  return null;
}

function chipDeleteInTail(text: Text, anchorOffset: number): ChipDeleteAction | null {
  const chip = calendarChip(text.previousSibling);
  if (!chip) return null;
  const data = text.data;
  if (anchorOffset === 0) {
    if (data === "") return { kind: "remove-chip", wrap: chip };
    if (data[0] === " ") return { kind: "remove-tail-space", text };
    return null;
  }
  if (anchorOffset === 1 && data === " ") return { kind: "remove-tail-space", text };
  return null;
}

function applyRemoveTailSpace(text: Text) {
  if (!text.data.startsWith(" ")) return;
  text.data = text.data.slice(1);
  placeCaret(text, 0);
}

function calendarChip(node: Node | null): HTMLElement | null {
  return node instanceof HTMLElement && node.dataset.calendarId ? node : null;
}

function chipWrapContaining(root: HTMLElement, node: Node): HTMLElement | null {
  const element = node instanceof HTMLElement ? node : node.parentElement;
  const wrap = element?.closest<HTMLElement>("[data-calendar-id]");
  return wrap && root.contains(wrap) ? wrap : null;
}

function chipAfterCaret(root: HTMLElement | null): HTMLElement | null {
  const sel = window.getSelection();
  if (!root || !sel?.isCollapsed || !sel.anchorNode || !root.contains(sel.anchorNode)) return null;
  const { anchorNode, anchorOffset } = sel;
  if (anchorNode.nodeType === Node.TEXT_NODE) {
    const text = anchorNode as Text;
    if (anchorOffset !== text.data.length) return null;
    return calendarChip(text.nextSibling);
  }
  if (anchorNode === root) return calendarChip(root.childNodes[anchorOffset] ?? null);
  return null;
}

function removeChipWrap(wrap: HTMLElement) {
  const root = wrap.parentElement;
  const prev = wrap.previousSibling;
  const next = wrap.nextSibling;
  wrap.remove();
  if (next?.nodeType === Node.TEXT_NODE) {
    const text = next as Text;
    if (text.data) {
      if (root) placeCaret(text, 0);
      return;
    }
    text.remove();
  }
  if (prev?.nodeType === Node.TEXT_NODE) {
    if (root) placeCaret(prev, prev.textContent?.length ?? 0);
    return;
  }
  if (root) placeCaretEnd(root);
}

function highlightName(name: string, query: string) {
  const needle = query.trim();
  if (!needle) return name;
  const index = name.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return name;
  return (
    <>
      {name.slice(0, index)}
      <mark>{name.slice(index, index + needle.length)}</mark>
      {name.slice(index + needle.length)}
    </>
  );
}
