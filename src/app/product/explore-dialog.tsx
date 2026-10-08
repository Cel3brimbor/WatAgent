"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import styles from "./product.module.css";

type Props = {
  onClose: () => void;
};

//leaving the preview is a choice. escape, the scrim, and keep looking all stay here.
export function ExploreDialog({ onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stayRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const items = [...root.querySelectorAll<HTMLElement>("button, a")];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, []);

  return (
    <div className={styles.scrim} role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="explore-title"
        onClick={(event) => event.stopPropagation()}
      >
        <p className={styles.dialogKicker}>IN THE APP</p>
        <h2 id="explore-title">The assistant lives with your calendars.</h2>
        <p>This page is a sample. It will not open a chat on its own. Open WatAgent when you want to talk through your own week.</p>
        <div className={styles.dialogActions}>
          <button ref={stayRef} type="button" className={styles.dialogStay} onClick={onClose}>Keep looking</button>
          <Link className={styles.dialogGo} href="/">Open the app <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
    </div>
  );
}
