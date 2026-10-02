"use client";

import { useState, type FormEvent } from "react";
import { importCalendarLink, type CalendarImportProgress } from "@/calendar/client";
import { detectCalendarLink, isCalendarLink } from "@/calendar/calendar-priority";
import type { CalendarFeedSource } from "@/calendar/types";
import { CheckIcon, ChevronRightIcon, EyeIcon, EyeOffIcon } from "@/shared/icons";

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
  learn: "LEARN / Brightspace",
  portal: "Portal",
};

const RANGE_FORMAT = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

function rangeLabel(from: string, to: string): string {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (!Number.isFinite(+start) || !Number.isFinite(+end)) return "Choose dates";
  return `${RANGE_FORMAT.format(start)} – ${RANGE_FORMAT.format(end)}`;
}

export function CalendarImportPanel({ onImported }: {
  onImported: (source: "learn" | "portal" | "other", url: string) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [showRange, setShowRange] = useState(false);
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
      setShowRange(true);
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
          ? `Updated ${imported.updated} ${noun(imported.updated)}. ${imported.added} added, ${imported.removed} removed, ${imported.unchanged} unchanged.`
          : `Imported ${imported.imported} ${noun(imported.imported)}. ${imported.added} added, ${imported.updated} updated, ${imported.removed} removed, ${imported.unchanged} unchanged.`);
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
      <h3 id="settings-ics">Add a calendar</h3>
      <p id="ics-hint" className="modal-hint">
        Paste a LEARN (Brightspace) or Portal calendar link. Once its events import, it joins the priority list below.
      </p>
      <form className="calendar-import-form" onSubmit={(event) => void submit(event)} aria-busy={working}>
        <div className="calendar-editor-field calendar-import-field">
          <label htmlFor="ics-url">Calendar link</label>
          <div className="calendar-import-link">
            <input id="ics-url" className="calendar-editor-input" type={showLink ? "text" : "password"} inputMode="url"
              placeholder="https://… or webcal://…" maxLength={4096}
              value={url} onChange={(event) => changeUrl(event.target.value)} disabled={working}
              aria-describedby="ics-hint ics-detected" autoComplete="off" spellCheck={false} />
            <button type="button" className="icon-btn calendar-import-reveal" onClick={() => setShowLink((current) => !current)}
              disabled={working} aria-controls="ics-url" aria-pressed={showLink} aria-label={showLink ? "Hide link" : "Show link"}
              title={showLink ? "Hide link" : "Show link"}>
              {showLink ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          <p id="ics-detected" className="calendar-import-detected" data-state={detectedFeed ? "match" : detected ?? "empty"} aria-live="polite">
            {detectedFeed ? (
              <>
                <CheckIcon />
                {DETECTED[detectedFeed]}
              </>
            ) : detected === "other"
              ? "Not recognized as a LEARN or Portal link."
              : trimmed
                ? "Links start with https:// or webcal://"
                : "Links stay private and are hidden while you type."}
          </p>
        </div>
        <div className="calendar-import-range">
          <button type="button" className="calendar-import-range-toggle" onClick={() => setShowRange((current) => !current)}
            disabled={working} aria-expanded={showRange} aria-controls="ics-range">
            <span className="calendar-import-range-label">Events from</span>
            <span className="calendar-import-range-value">{rangeLabel(from, to)}</span>
            <ChevronRightIcon />
          </button>
          <div id="ics-range" className="calendar-import-dates" hidden={!showRange}>
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
        </div>
        {working && progress ? (
          <div className="calendar-import-status" role="status">
            <progress
              className="calendar-import-meter"
              aria-label={progressLabel}
              {...(progress.total == null ? {} : { value: progress.done, max: Math.max(progress.total, 1) })}
            />
            <p className="modal-hint">{progressLabel}</p>
          </div>
        ) : null}
        {error ? <p className="calendar-import-error" role="alert">{error}</p> : null}
        {result && !working ? <p className="settings-status" role="status">{result}</p> : null}
        <div className="settings-actions">
          <button type="submit" className="primary-btn" disabled={working || !isCalendarLink(trimmed)}>
            {working ? "Adding…" : "Add calendar"}
          </button>
        </div>
      </form>
    </section>
  );
}
