"use client";

import { useCallback, useEffect, useState } from "react";
import {
  completeIosGoogleConnect,
  disconnectGoogleCalendar,
  getGoogleCalendarStatus,
  startIosGoogleConnect,
  startWebGoogleConnect,
  type GoogleCalendarStatus,
} from "@/calendar/google-calendar-client";
import { isNativeShell } from "@/shared/platform";

type Props = {
  accountEmail: string | null;
  onChanged: () => void;
  onSyncNow: () => void;
  onNotice: (message: string) => void;
};

function formatSynced(ms: number | null): string {
  if (!ms) return "Not synced yet";
  return `Last synced ${new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export function SettingsPanel({ accountEmail, onChanged, onSyncNow, onNotice }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [working, setWorking] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await getGoogleCalendarStatus());
    } catch {
      setStatus({ connected: false, email: null, lastSyncedAt: null });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadStatus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loadStatus]);

  async function connect() {
    setWorking(true);
    try {
      if (!isNativeShell()) {
        window.location.assign(await startWebGoogleConnect());
        return;
      }
      const { startNativeOAuth } = await import("@/auth/native-oauth");
      const request = await startIosGoogleConnect();
      const code = await startNativeOAuth(request.url, request.callbackScheme);
      await completeIosGoogleConnect(code, request.state);
      await loadStatus();
      onChanged();
      onNotice("Google Calendar linked.");
    } catch {
      onNotice("Google Calendar could not be linked.");
    } finally {
      setWorking(false);
    }
  }

  async function unlink() {
    setWorking(true);
    try {
      await disconnectGoogleCalendar();
      await loadStatus();
      onChanged();
      onNotice("Google Calendar unlinked.");
    } catch {
      onNotice("Google Calendar could not be unlinked.");
    } finally {
      setWorking(false);
    }
  }

  const connected = status?.connected === true;

  return (
    <>
      <button
        type="button"
        className={`ghost-btn${open ? " is-active" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Settings
      </button>
      {open ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <div
            className="modal settings-panel"
            role="dialog"
            aria-labelledby="settings-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="settings-head">
              <h2 id="settings-title">Settings</h2>
              <button type="button" className="ghost-btn" aria-label="Close settings" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            {accountEmail ? <p className="settings-account">{accountEmail}</p> : null}

            <section className="settings-section" aria-labelledby="settings-gcal">
              <h3 id="settings-gcal">Google Calendar</h3>
              <p className="modal-hint">
                Show your Google events on this calendar and keep WatAgent items in a dedicated Google calendar. You
                can link or unlink at any time.
              </p>
              {connected ? (
                <>
                  <p className="settings-status">
                    Linked{status?.email ? ` as ${status.email}` : ""}
                  </p>
                  <p className="settings-meta">{formatSynced(status?.lastSyncedAt ?? null)}</p>
                  <div className="settings-actions">
                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={working}
                      onClick={() => {
                        onSyncNow();
                        window.setTimeout(() => void loadStatus(), 1500);
                      }}
                    >
                      Sync now
                    </button>
                    <button type="button" className="danger-btn" disabled={working} onClick={() => void unlink()}>
                      {working ? "Unlinking…" : "Unlink"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="settings-actions">
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={working || status === null}
                    onClick={() => void connect()}
                  >
                    {working ? "Linking…" : "Link Google Calendar"}
                  </button>
                </div>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </>
  );
}
