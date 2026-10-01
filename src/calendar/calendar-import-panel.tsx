"use client";

import { useState, type FormEvent } from "react";
import { importCalendarLink } from "@/calendar/client";

function dateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function CalendarImportPanel({ onImported }: { onImported: (source: "learn" | "portal" | "other") => Promise<void> }) {
  const [url, setUrl] = useState("");
  const [source, setSource] = useState<"auto" | "learn" | "portal" | "other">("auto");
  const [showLink, setShowLink] = useState(false);
  const [from, setFrom] = useState(() => dateValue(new Date()));
  const [to, setTo] = useState(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 1);
    date.setDate(date.getDate() - 1);
    return dateValue(date);
  });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

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
    if (!/^(https|webcal):\/\//i.test(url.trim())) {
      setError("Enter an https or webcal calendar link.");
      return;
    }
    setWorking(true);
    try {
      const link = url.trim();
      setUrl("");
      setShowLink(false);
      const imported = await importCalendarLink({ url: link, source, rangeStartUTC: +start, rangeEndUTC: +end });
      await onImported(imported.source);
      setResult(imported.imported === 0
        ? "No events found in this date range."
        : `Imported ${imported.imported} event${imported.imported === 1 ? "" : "s"}: ${imported.added} added, ${imported.updated} updated, ${imported.unchanged} unchanged.`);
      setUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to import this calendar. Try again.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="settings-section" aria-labelledby="settings-ics">
      <h3 id="settings-ics">Import calendar link</h3>
      <p id="ics-hint" className="modal-hint">
        Paste your own LEARN (Brightspace), Portal, or other .ics calendar link. This saves a snapshot for the
        selected dates, including recurring events. Import again to add new events and update existing ones.
        Private access tokens are not saved, and the link does not refresh automatically.
      </p>
      <form className="calendar-import-form" onSubmit={(event) => void submit(event)} aria-busy={working}>
        <label className="calendar-editor-field" htmlFor="ics-url">
          Calendar link
          <input id="ics-url" className="calendar-editor-input" type={showLink ? "text" : "password"} inputMode="url"
            placeholder="https://example.com/calendar.ics" required maxLength={4096}
            value={url} onChange={(event) => setUrl(event.target.value)} disabled={working}
            aria-describedby="ics-hint" autoComplete="off" spellCheck={false} />
        </label>
        <div className="calendar-import-link-actions">
          <button type="button" className="ghost-btn" onClick={() => setShowLink((current) => !current)}
            disabled={working} aria-controls="ics-url" aria-pressed={showLink}>
            {showLink ? "Hide link" : "Show link"}
          </button>
        </div>
        <label className="calendar-editor-field" htmlFor="ics-source">
          Calendar source
          <select id="ics-source" className="calendar-editor-input" value={source} disabled={working}
            onChange={(event) => setSource(event.target.value as typeof source)} aria-describedby="ics-source-hint">
            <option value="auto">Detect from link</option>
            <option value="learn">LEARN / Brightspace</option>
            <option value="portal">Portal</option>
            <option value="other">Other calendar</option>
          </select>
        </label>
        <p id="ics-source-hint" className="modal-hint">
          LEARN links are detected automatically. Choose Portal for a Portal export so duplicate priority can apply.
          Use an HTTPS link to protect its access token.
        </p>
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
        {error ? <p className="calendar-import-error" role="alert">{error}</p> : null}
        {result ? <p className="settings-status" role="status">{result}</p> : null}
        <div className="settings-actions">
          <button type="submit" className="primary-btn" disabled={working || !url.trim()}>
            {working ? "Importing…" : "Import events"}
          </button>
        </div>
      </form>
    </section>
  );
}
