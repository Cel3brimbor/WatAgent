"use client";

import { useId, useRef } from "react";
import { useDialogAction } from "@/shared/use-dialog-action";
import { useDialog } from "@/shared/use-dialog";

type Props = {
  title: string;
  message: string;
  confirmLabel?: string;
  //false while the exit transition plays
  open?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  //runs on the click, before the exit animation
  onCommit?: () => void;
};

export function ConfirmDialog({ title, message, confirmLabel = "Delete", open = true, onCancel, onConfirm, onCommit }: Props) {
  const action = useDialogAction(open);
  const cancel = () => action.run(onCancel);
  const confirm = () => action.run(onConfirm, onCommit);
  const ref = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();
  //destructive confirms start on the safe choice
  useDialog(ref, { open, onEscape: cancel, initialFocus: cancelRef });

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      data-state={action.visible ? "open" : "closed"}
      data-pending={action.pending || undefined} onAnimationEnd={(event) => { if (event.target === event.currentTarget && action.pending) action.complete(); }}
      inert={!open}
      onClick={cancel}
    >
      <div
        ref={ref}
        inert={action.pending}
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
          <button ref={cancelRef} type="button" className="ghost-btn" onClick={cancel}>
            Cancel
          </button>
          <button type="button" className="danger-btn" onClick={confirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
