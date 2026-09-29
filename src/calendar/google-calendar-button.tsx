"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

export function GoogleCalendarButton({ onChanged, onSyncNow, onNotice }: Props) {
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await getGoogleCalendarStatus());
    } catch {
      setStatus({ connected: false, email: null, lastSyncedAt: null });
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
      onNotice("Google Calendar connected.");
    } catch {
      onNotice("Google Calendar could not be connected.");
    } finally {
      setWorking(false);
    }
  }

  async function disconnect() {
    setWorking(true);
    try {
      await disconnectGoogleCalendar();
      await loadStatus();
      onChanged();
      onNotice("Google Calendar disconnected.");
    } catch {
      onNotice("Google Calendar could not be disconnected.");
    } finally {
      setWorking(false);
    }
  }

  const connected = status?.connected === true;

  return (
    <div className="gcal-connect" ref={rootRef}>
      <button
        type="button"
        className={`ghost-btn${connected ? " is-active" : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void loadStatus();
        }}
      >
        Google
      </button>
      {open ? (
        <div className="gcal-popover" role="dialog" aria-label="Google Calendar">
          {connected ? (
            <>
              <p className="gcal-popover-title">Connected</p>
              {status?.email ? <p className="gcal-popover-meta">{status.email}</p> : null}
              <p className="gcal-popover-meta">{formatSynced(status?.lastSyncedAt ?? null)}</p>
              <div className="gcal-popover-actions">
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
                <button type="button" className="danger-btn" disabled={working} onClick={() => void disconnect()}>
                  Disconnect
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="gcal-popover-title">Google Calendar</p>
              <p className="gcal-popover-meta">
                Show your Google events alongside WATerflow and keep your WATerflow items in a dedicated calendar.
              </p>
              <div className="gcal-popover-actions">
                <button
                  type="button"
                  className="primary-btn"
                  disabled={working || status === null}
                  onClick={() => void connect()}
                >
                  {working ? "Connecting…" : "Connect"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
