"use client";

import type { ReactNode } from "react";

export type AppSection = "calendar" | "tasks" | "events" | "map" | "settings";

type Props = {
  section: AppSection;
  collapsed: boolean;
  onSection: (section: AppSection) => void;
  onToggle: () => void;
  /** False hides the Calendars section. */
  advanced?: boolean;
  children?: ReactNode;
};

const BARS: Array<{ id: AppSection; label: string }> = [
  { id: "calendar", label: "Calendar" },
  { id: "tasks", label: "Tasks" },
  { id: "events", label: "Events" },
  { id: "map", label: "Calendars" },
];

export function SideNav({ section, collapsed, onSection, onToggle, advanced = true, children }: Props) {
  return (
    <nav className="side-nav" aria-label="Sections">
      <div className="side-nav-head">
        <button
          type="button"
          className="side-nav-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={onToggle}
        >
          <MenuIcon />
        </button>
        <span className="side-nav-brand" aria-hidden="true">
          WatAgent
        </span>
        <button
          type="button"
          className={`side-nav-gear${section === "settings" ? " is-active" : ""}`}
          aria-current={section === "settings" ? "page" : undefined}
          aria-label="Settings"
          title="Settings"
          onClick={() => onSection("settings")}
        >
          <BarIcon id="settings" />
        </button>
      </div>
      <div className="side-nav-group">
        {BARS.filter((bar) => advanced || bar.id !== "map").map((bar) => (
          <button
            key={bar.id}
            type="button"
            className={`side-nav-bar${section === bar.id ? " is-active" : ""}`}
            aria-current={section === bar.id ? "page" : undefined}
            aria-label={bar.label}
            onClick={() => onSection(bar.id)}
          >
            <BarIcon id={bar.id} />
            <span className="side-nav-label">{bar.label}</span>
          </button>
        ))}
      </div>
      <div className="side-nav-extra">{children}</div>
    </nav>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 4.25h11M2.5 8h11M2.5 11.75h11" />
    </svg>
  );
}

function BarIcon({ id }: { id: AppSection }) {
  if (id === "calendar") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="1.5" />
        <path d="M2.25 6.25h11.5M5.25 2.25v2.25M10.75 2.25v2.25" />
      </svg>
    );
  }
  if (id === "map") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="3.75" cy="4" r="1.75" />
        <circle cx="12.25" cy="4" r="1.75" />
        <circle cx="8" cy="12" r="1.75" />
        <path d="M5.5 4h5M4.6 5.6l2.5 4.8M11.4 5.6l-2.5 4.8" />
      </svg>
    );
  }
  if (id === "events") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2.25 4.25h11.5v2.2a1.55 1.55 0 0 0 0 3.1v2.2H2.25v-2.2a1.55 1.55 0 0 0 0-3.1z" />
        <path d="M10 4.75v1.1M10 7.45v1.1M10 10.15v1.1" />
      </svg>
    );
  }
  if (id === "tasks") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3.25 4.5 4.6 5.85 7.1 3.15M3.25 9.25l1.35 1.35L7.1 7.9M8.75 4.75h4.5M8.75 9.5h4.5M3.25 13h9.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
