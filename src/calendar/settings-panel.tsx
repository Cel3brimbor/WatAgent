"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  completeIosGoogleConnect,
  disconnectGoogleCalendar,
  getGoogleCalendarStatus,
  startIosGoogleConnect,
  startWebGoogleConnect,
  type GoogleCalendarStatus,
} from "@/calendar/google-calendar-client";
import type { ImportedCalendar, ImportedCalendarSource, MergedCalendar } from "@/calendar/types";
import { ImportedCalendarsPanel } from "@/calendar/imported-calendars-panel";
import { CalendarImportPanel } from "@/calendar/calendar-import-panel";
import { isNativeShell } from "@/shared/platform";
import { Switch } from "@/shared/switch";
import { MoonIcon, SunIcon, SystemIcon } from "@/shared/icons";
import { TEA_THEMES, useColorScheme, useTeaTheme, type ColorSchemePreference } from "@/shared/tea-theme";

type Props = {
  importedCalendars: ImportedCalendar[];
  campusCalendars?: ImportedCalendar[];
  mergedCalendars: MergedCalendar[];
  onRenameCalendar: (id: ImportedCalendarSource, name: string) => void;
  accountEmail: string | null;
  syncedAt: number | null;
  onChanged: () => void;
  onImported: (calendar: ImportedCalendar) => Promise<void>;
  onRefresh: () => Promise<void>;
  onRemoveCalendar: (id: ImportedCalendarSource) => Promise<void>;
  onSyncGoogle: () => Promise<number | null>;
  onNotice: (message: string) => void;
  advancedView: boolean;
  onAdvancedViewChange: (value: boolean) => void;
  requireAiApproval: boolean;
  onRequireAiApprovalChange: (value: boolean) => void;
  onSignOut: () => void;
};

const SCHEMES: { value: ColorSchemePreference; label: string; Icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: SystemIcon },
];

//a miniature app window: nav rail, a few lines of text, one accent pill
function SchemeWindow() {
  return (
    <span className="scheme-window">
      <span className="scheme-rail" />
      <span className="scheme-body">
        <span className="scheme-line is-head" />
        <span className="scheme-line" />
        <span className="scheme-line is-short" />
        <span className="scheme-pill" />
      </span>
    </span>
  );
}

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
  importedCalendars,
  campusCalendars = [],
  mergedCalendars,
  onRenameCalendar,
  accountEmail,
  syncedAt,
  onChanged,
  onImported,
  onRefresh,
  onRemoveCalendar,
  onSyncGoogle,
  onNotice,
  advancedView,
  onAdvancedViewChange,
  requireAiApproval,
  onRequireAiApprovalChange,
  onSignOut,
}: Props) {
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [working, setWorking] = useState(false);
  const [teaTheme, setTeaTheme] = useTeaTheme();
  const [colorScheme, setColorScheme] = useColorScheme();
  const tea = TEA_THEMES.flatMap((group) => group.themes).find((theme) => theme.id === teaTheme);

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

      <CalendarImportPanel importedCalendars={[...importedCalendars, ...campusCalendars]} onImported={onImported} />

      <ImportedCalendarsPanel
        calendars={importedCalendars}
        mergedCalendars={mergedCalendars}
        googleConnected={connected}
        onRename={onRenameCalendar}
        onRemove={onRemoveCalendar}
        onRefresh={onRefresh}
        onSyncGoogle={onSyncGoogle}
      />

      <section className="settings-section" aria-labelledby="settings-agent">
        <h3 id="settings-agent">Agent</h3>
        <div className="settings-toggle">
          <label htmlFor="settings-approval">Require approval for Agent calendar edits</label>
          <Switch
            id="settings-approval"
            checked={requireAiApproval}
            aria-describedby="settings-approval-hint"
            onChange={onRequireAiApprovalChange}
          />
        </div>
        <p id="settings-approval-hint" className="modal-hint">
          When on, the Agent queues adds, updates, and deletes for you to approve or reject. Pending changes stay saved
          until you decide and are not sent to Google Calendar until approved.
        </p>
      </section>

      <section className="settings-section" aria-labelledby="settings-view">
        <h3 id="settings-view">View</h3>
        <div className="settings-toggle">
          <label htmlFor="settings-advanced">Advanced view</label>
          <Switch
            id="settings-advanced"
            checked={advancedView}
            aria-describedby="settings-advanced-hint"
            onChange={onAdvancedViewChange}
          />
        </div>
        <p id="settings-advanced-hint" className="modal-hint">
          Shows the Calendars section for merging calendars, rules and the calendar map.
        </p>
      </section>

      <section className="settings-section" aria-labelledby="settings-theme">
        <h3 id="settings-theme">Appearance</h3>
        <fieldset className="tea-group">
          <legend>Mode</legend>
          <div
            className="scheme-options"
            style={{ "--swatch-paper": tea?.paper, "--swatch-accent": tea?.accent } as CSSProperties}
          >
            {SCHEMES.map(({ value, label, Icon }) => (
              <label key={value} className="scheme-option">
                <input
                  type="radio"
                  name="color-scheme"
                  value={value}
                  checked={colorScheme === value}
                  onChange={() => setColorScheme(value)}
                />
                <span className={`scheme-preview is-${value}`} aria-hidden="true">
                  {value === "system" ? (
                    <>
                      <span className="scheme-half is-light">
                        <SchemeWindow />
                      </span>
                      <span className="scheme-half is-dark">
                        <SchemeWindow />
                      </span>
                    </>
                  ) : (
                    <SchemeWindow />
                  )}
                </span>
                <span className="scheme-label">
                  <Icon />
                  {label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="modal-hint">System follows your device and switches automatically.</p>
        {TEA_THEMES.map((group) => (
          <fieldset key={group.origin} className="tea-group">
            <legend>{group.origin}</legend>
            <div className="tea-options">
              {group.themes.map((theme) => (
                <label key={theme.id} className="tea-option">
                  <input
                    type="radio"
                    name="tea-theme"
                    value={theme.id}
                    checked={teaTheme === theme.id}
                    onChange={() => setTeaTheme(theme.id)}
                  />
                  <span
                    className="tea-swatch"
                    aria-hidden="true"
                    style={{ "--swatch-paper": theme.paper, "--swatch-accent": theme.accent } as CSSProperties}
                  />
                  <span className="tea-text">
                    <span className="tea-name">{theme.name}</span>
                    <span className="tea-note">{theme.note}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </section>

      <div className="settings-actions">
        <button type="button" className="ghost-btn" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </section>
  );
}
