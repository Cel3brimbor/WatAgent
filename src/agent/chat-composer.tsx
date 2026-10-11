"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent } from "react";
import { AgentEffortButton } from "@/agent/agent-effort-button";
import type { AgentEffort } from "@/agent/agent-effort";
import { filesFromClipboard, MAX_CHAT_IMAGES, readChatImage, type ChatImage, type PendingChatImage } from "@/agent/chat-image";
import { MentionField, type MentionFieldHandle } from "@/agent/mention-field";
import type { MentionCalendar } from "@/agent/calendar-mention";
import type { CalendarItemDoc } from "@/calendar/types";
import { ArrowUpIcon, CloseIcon, PaperclipIcon, StopIcon } from "@/shared/icons";

const MAX_CHARS = 20_000;

type Props = {
  busy: boolean;
  restricted?: boolean;
  error: string | null;
  effort: AgentEffort;
  calendars: MentionCalendar[];
  items: CalendarItemDoc[];
  openBadge: string | null;
  onOpenBadge: (id: string | null) => void;
  onEffort: (effort: AgentEffort) => void;
  onSend: (payload: { text: string; calendarIds?: string[]; images?: ChatImage[] }) => void;
  onStop: () => void;
  onError: (message: string | null) => void;
  onEditCalendarItem?: (item: CalendarItemDoc) => void;
  /** Attach a calendar from outside the composer, such as the map's Ask Agent. A new nonce attaches again. */
  attachRequest?: { id: string; nonce: number } | null;
};

export function ChatComposer({
  busy,
  restricted = false,
  error,
  effort,
  calendars,
  items,
  openBadge,
  onOpenBadge,
  onEffort,
  onSend,
  onStop,
  onError,
  onEditCalendarItem,
  attachRequest,
}: Props) {
  const fieldRef = useRef<MentionFieldHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef<PendingChatImage[]>([]);
  const attachGeneration = useRef(0);
  const [ready, setReady] = useState(false);
  const [hasChip, setHasChip] = useState(false);
  const [images, setImages] = useState<PendingChatImage[]>([]);
  imagesRef.current = images;

  useEffect(() => {
    return () => {
      for (const image of imagesRef.current) URL.revokeObjectURL(image.previewUrl);
    };
  }, []);

  function dropImages(drop: PendingChatImage[]) {
    for (const image of drop) URL.revokeObjectURL(image.previewUrl);
  }

  async function addFiles(files: File[]) {
    if (restricted || files.length === 0) return;
    const room = MAX_CHAT_IMAGES - imagesRef.current.length;
    if (room <= 0) {
      onError("You can attach up to 4 images.");
      return;
    }
    const generation = attachGeneration.current;
    const added: PendingChatImage[] = [];
    let failed: string | null = null;
    for (const file of files.slice(0, room)) {
      try {
        added.push(await readChatImage(file));
      } catch (err) {
        failed = err instanceof Error ? err.message : "That image couldn't be read.";
      }
    }
    if (generation !== attachGeneration.current) {
      dropImages(added);
      return;
    }
    if (files.length > room) failed = "You can attach up to 4 images.";
    if (added.length === 0) {
      if (failed) onError(failed);
      return;
    }
    setImages((current) => {
      const space = MAX_CHAT_IMAGES - current.length;
      const take = added.slice(0, Math.max(0, space));
      dropImages(added.slice(take.length));
      return [...current, ...take];
    });
    onError(failed);
  }

  function removeImage(id: string) {
    setImages((current) => {
      const image = current.find((item) => item.id === id);
      if (image) URL.revokeObjectURL(image.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (restricted || busy) return;
    const payload = fieldRef.current?.read() ?? { text: "", calendarIds: [] as string[] };
    const value = payload.text.trim();
    const attached = imagesRef.current.map((image) => ({ mediaType: image.mediaType, data: image.data }));
    if (!value && payload.calendarIds.length === 0 && attached.length === 0) return;
    if (value.length > MAX_CHARS) {
      onError("That message is too long.");
      return;
    }
    onError(null);
    attachGeneration.current += 1;
    fieldRef.current?.clear();
    dropImages(imagesRef.current);
    setImages([]);
    setReady(false);
    setHasChip(false);
    onOpenBadge(null);
    onSend({
      text: value,
      calendarIds: payload.calendarIds,
      images: attached.length > 0 ? attached : undefined,
    });
    fieldRef.current?.focus();
  }

  function onFormPaste(event: ClipboardEvent<HTMLFormElement>) {
    const files = filesFromClipboard(event.clipboardData);
    if (files.length === 0) return;
    const node = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null;
    if (node?.closest("[contenteditable='true']")) return;
    event.preventDefault();
    void addFiles(files);
  }

  return (
    <form
      className={`composer${restricted ? " is-restricted" : ""}`}
      onSubmit={(event) => submit(event)}
      onPaste={onFormPaste}
      onDragOver={(event) => {
        if ([...event.dataTransfer.types].includes("Files")) event.preventDefault();
      }}
      onDrop={(event: DragEvent<HTMLFormElement>) => {
        const files = [...event.dataTransfer.files];
        if (files.length === 0) return;
        const node = event.target instanceof Element ? event.target : null;
        if (node?.closest("[contenteditable='true']")) return;
        event.preventDefault();
        void addFiles(files);
      }}
    >
      {error ? (
        <p className="composer-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="composer-box">
        {images.length > 0 ? (
          <div className="composer-images" aria-label="Attached images">
            {images.map((image) => (
              <div className="composer-image" key={image.id}>
                <img src={image.previewUrl} alt="Attached image" />
                <button
                  type="button"
                  className="composer-image-remove"
                  aria-label="Remove image"
                  onClick={() => removeImage(image.id)}
                >
                  <CloseIcon />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <MentionField
          ref={fieldRef}
          className="composer-input"
          calendars={calendars}
          items={items}
          disabled={restricted}
          placeholder={
            restricted
              ? "AI features are restricted"
              : images.length > 0
                ? "Ask about the attached image…"
                : hasChip
                  ? "Ask about the attached calendar…"
                  : "Ask about this day, or add an event…"
          }
          onPasteFiles={(files) => {
            void addFiles(files);
          }}
          openCalendarId={openBadge?.startsWith("composer:") ? openBadge.slice("composer:".length) : null}
          onOpenCalendar={(id) => onOpenBadge(id ? `composer:${id}` : null)}
          onEditItem={onEditCalendarItem}
          onChange={(value) => {
            setReady(value.text.trim().length > 0 || value.calendarIds.length > 0);
            setHasChip(value.calendarIds.length > 0);
          }}
          enterSends
          onEnter={() => void submit()}
          attachRequest={attachRequest}
        />
        <div className="composer-bar">
          <div className="composer-tools">
            <input
              ref={fileRef}
              className="composer-file"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                event.target.value = "";
                void addFiles(files);
              }}
            />
            <button
              type="button"
              className="icon-btn composer-attach"
              aria-label="Attach image"
              disabled={restricted || images.length >= MAX_CHAT_IMAGES}
              onClick={() => fileRef.current?.click()}
            >
              <PaperclipIcon />
            </button>
            <AgentEffortButton value={effort} onChange={onEffort} disabled={restricted} />
          </div>
          {busy ? (
            <button type="button" className="composer-send is-stop" onClick={onStop} aria-label="Stop" disabled={restricted}>
              <StopIcon />
            </button>
          ) : (
            <button
              type="submit"
              className={`composer-send${(ready || images.length > 0) && !restricted ? " is-ready" : ""}`}
              disabled={(!ready && images.length === 0) || restricted}
              aria-label="Send"
            >
              <ArrowUpIcon />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
