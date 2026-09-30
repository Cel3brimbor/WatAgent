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
  syncedAt: number | null;
  onChanged: () => void;
  onSyncNow: () => Promise<number | null>;
  onNotice: (message: string) => void;
  requireAiApproval: boolean;
  onRequireAiApprovalChange: (value: boolean) => void;
  onSignOut: () => void;
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

export function SettingsPanel({
  accountEmail,
  syncedAt,
  onChanged,
  onSyncNow,
  onNotice,
  requireAiApproval,
  onRequireAiApprovalChange,
  onSignOut,
}: Props) {
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [working, setWorking] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await getGoogleCalendarStatus());
    } catch {
      setStatus({ connected: false, email: null, lastSyncedAt: null });
    }
  }, []);

  useEffect(() => {
    if (!syncedAt || status?.connected !== true) return;
    setStatus((prev) => (prev ? { ...prev, lastSyncedAt: syncedAt } : prev));
  }, [syncedAt, status?.connected]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

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

  async function syncNow() {
    setSyncing(true);
    try {
      const syncedAtMs = await onSyncNow();
      if (syncedAtMs) {
        setStatus((prev) => (prev ? { ...prev, lastSyncedAt: syncedAtMs } : prev));
      }
    } catch {
      onNotice("Google Calendar could not be synced.");
    } finally {
      setSyncing(false);
    }
  }

  const connected = status?.connected === true;

  return (
    <section className="settings-page" aria-labelledby="settings-title">
      <h2 id="settings-title">Settings</h2>
      {accountEmail ? <p className="settings-account">{accountEmail}</p> : null}

      <section className="settings-section" aria-labelledby="settings-gcal">
        <h3 id="settings-gcal">Google Calendar</h3>
        <p className="modal-hint">
          Show your Google events on this calendar and keep WatAgent items in a dedicated Google calendar. You can
          link or unlink at any time.
        </p>
        {connected ? (
          <>
            <p className="settings-status">Linked{status?.email ? ` as ${status.email}` : ""}</p>
            <p className="settings-meta">{formatSynced(status?.lastSyncedAt ?? null)}</p>
            <div className="settings-actions">
              <button
                type="button"
                className={`ghost-btn${syncing ? " is-syncing" : ""}`}
                disabled={working || syncing}
                aria-busy={syncing}
                aria-label={syncing ? "Syncing" : "Sync now"}
                onClick={() => void syncNow()}
              >
                {syncing ? <span className="sync-spinner" aria-hidden="true" /> : "Sync now"}
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

      <section className="settings-section" aria-labelledby="settings-agent">
        <h3 id="settings-agent">Agent</h3>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={requireAiApproval}
            onChange={(event) => onRequireAiApprovalChange(event.target.checked)}
          />
          Require approval for Agent calendar edits
        </label>
        <p className="modal-hint">
          When on, the Agent queues adds, updates, and deletes for you to approve or reject. Pending changes stay saved
          until you decide and are not sent to Google Calendar until approved.
        </p>
      </section>

      <div className="settings-actions">
        <button type="button" className="ghost-btn" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </section>
  );
}
