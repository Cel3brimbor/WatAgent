"use client";

import { useId, useRef } from "react";
import { useDialog } from "@/shared/use-dialog";

type Props = {
  title: string;
  message: string;
  confirmLabel?: string;
  //false while the exit transition plays
  open?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({ title, message, confirmLabel = "Delete", open = true, onCancel, onConfirm }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();
  //destructive confirms start on the safe choice
  useDialog(ref, { open, onEscape: onCancel, initialFocus: cancelRef });

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      data-state={open ? "open" : "closed"}
      inert={!open}
      onClick={onCancel}
    >
      <div
        ref={ref}
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>{title}</h2>
        <p id={messageId} className="modal-hint">
          {message}
        </p>
        <div className="modal-actions">
          <button ref={cancelRef} type="button" className="ghost-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="danger-btn" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
