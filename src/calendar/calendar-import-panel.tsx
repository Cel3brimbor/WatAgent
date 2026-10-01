"use client";

import { useState, type FormEvent } from "react";
import { importCalendarLink, type CalendarImportProgress } from "@/calendar/client";
import { detectCalendarLink, isCalendarLink } from "@/calendar/calendar-priority";
import type { CalendarFeedSource } from "@/calendar/types";

function dateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

//school year runs september through may. january–may still belongs to the september that just passed
export function academicImportRange(today: Date): { from: string; to: string } {
  const startYear = today.getMonth() <= 4 ? today.getFullYear() - 1 : today.getFullYear();
  return {
    from: dateValue(new Date(startYear, 8, 1)),
    to: dateValue(new Date(startYear + 1, 4, 31)),
  };
}

const DETECTED: Record<CalendarFeedSource, string> = {
  learn: "Detected as LEARN / Brightspace",
  portal: "Detected as Portal",
};

export function CalendarImportPanel({ onImported }: {
  onImported: (source: "learn" | "portal" | "other", url: string) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [from, setFrom] = useState(() => academicImportRange(new Date()).from);
  const [to, setTo] = useState(() => academicImportRange(new Date()).to);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<CalendarImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  function changeUrl(next: string) {
    setUrl(next);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working) return;
    setError(null);
    setResult(null);
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || +end <= +start || +end - +start > 366 * 86400000) {
      setError("Choose a valid date range of up to one year.");
      return;
    }
    const link = url.trim();
    if (!isCalendarLink(link)) {
      setError("Enter an https or webcal calendar link.");
      return;
    }
    const source = detectCalendarLink(link);
    setUrl("");
    setWorking(true);
    setProgress({ done: 0, total: null });
    try {
      const imported = await importCalendarLink(
        { url: link, source, rangeStartUTC: +start, rangeEndUTC: +end },
        setProgress,
      );
      await onImported(imported.source, link);
      const noun = (value: number) => `event${value === 1 ? "" : "s"}`;
      setResult(imported.imported === 0 && imported.removed === 0
        ? "No events found in this date range."
        : imported.existed
          ? `Updated ${imported.updated} ${noun(imported.updated)}. ${imported.added} added, ${imported.removed} deleted, ${imported.unchanged} unchanged.`
          : `Imported ${imported.imported} ${noun(imported.imported)}. ${imported.added} added, ${imported.updated} updated, ${imported.removed} deleted, ${imported.unchanged} unchanged.`);
    } catch (err) {
      setUrl(link);
      setError(err instanceof Error ? err.message : "Unable to import this calendar. Try again.");
    } finally {
      setWorking(false);
      setProgress(null);
    }
  }

  const progressLabel = progress?.total == null
    ? "Opening calendar…"
    : progress.total === 0
      ? "No events in this date range."
      : `Importing ${progress.done} of ${progress.total}`;

  const trimmed = url.trim();
  const detected = isCalendarLink(trimmed) ? detectCalendarLink(trimmed) : null;
  const detectedFeed = detected === "learn" || detected === "portal" ? detected : null;

  return (
    <section className="settings-section" aria-labelledby="settings-ics">
      <h3 id="settings-ics">Calendar link</h3>
      <p id="ics-hint" className="modal-hint">
        Paste a LEARN (Brightspace) or Portal calendar link. WatAgent detects which one it is and clears the field once you import.
        The calendar shows in the priority list after its events finish importing. Remove it from that list to take it off.
      </p>
      <form className="calendar-import-form" onSubmit={(event) => void submit(event)} aria-busy={working}>
        <label className="calendar-editor-field" htmlFor="ics-url">
          Calendar link
          <input id="ics-url" className="calendar-editor-input" type={showLink ? "text" : "password"} inputMode="url"
            placeholder="https://example.com/calendar.ics" maxLength={4096}
            value={url} onChange={(event) => changeUrl(event.target.value)} disabled={working}
            aria-describedby="ics-hint ics-detected" autoComplete="off" spellCheck={false} />
        </label>
        <p id="ics-detected" className="modal-hint">
          {detectedFeed ? DETECTED[detectedFeed] : detected === "other" ? "This link is not recognized as LEARN or Portal." : "LEARN and Portal links are detected from the address."}
        </p>
        <div className="calendar-import-link-actions">
          <button type="button" className="ghost-btn" onClick={() => setShowLink((current) => !current)}
            disabled={working} aria-controls="ics-url" aria-pressed={showLink}>
            {showLink ? "Hide link" : "Show link"}
          </button>
        </div>
        <div className="calendar-import-dates">
          <label className="calendar-editor-field" htmlFor="ics-from">
            From
            <input id="ics-from" className="calendar-editor-input" type="date" required
              value={from} onChange={(event) => setFrom(event.target.value)} disabled={working} />
          </label>
          <label className="calendar-editor-field" htmlFor="ics-to">
            Through
            <input id="ics-to" className="calendar-editor-input" type="date" required min={from}
              value={to} onChange={(event) => setTo(event.target.value)} disabled={working} />
          </label>
        </div>
        {working && progress ? (
          <div className="calendar-import-status">
            <progress
              className="calendar-import-meter"
              aria-label={progressLabel}
              {...(progress.total == null ? {} : { value: progress.done, max: Math.max(progress.total, 1) })}
            />
            <p className="modal-hint">{progressLabel}</p>
          </div>
        ) : null}
        {error ? <p className="calendar-import-error" role="alert">{error}</p> : null}
        {result ? <p className="settings-status" role="status">{result}</p> : null}
        <div className="settings-actions">
          <button type="submit" className="primary-btn" disabled={working || !isCalendarLink(trimmed)}>
            {working ? "Importing…" : "Import events"}
          </button>
        </div>
      </form>
    </section>
  );
}
