"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ApiError } from "@/shared/api-base";
import { autocompletePlaces, type PlaceSuggestion } from "@/calendar/places-client";
import {
  cachedDeviceCoords,
  readLocationConsent,
  readPlaceRecents,
  rememberPlace,
  requestDeviceLocation,
  writeLocationConsent,
  type DeviceCoords,
  type LocationConsent,
} from "@/calendar/place-memory";

type Props = {
  value: string;
  labelId: string;
  label?: string;
  onChange: (value: string) => void;
};

type Row =
  | { kind: "recent"; label: string }
  | { kind: "place"; suggestion: PlaceSuggestion };

export function LocationField({ value, labelId, label = "Location", onChange }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState<LocationConsent>("ask");
  const [coords, setCoords] = useState<DeviceCoords | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    setConsent(readLocationConsent());
    setRecents(readPlaceRecents());
    setCoords(cachedDeviceCoords());
  }, []);

  useEffect(() => {
    if (!open || consent !== "yes") return;
    let cancelled = false;
    void requestDeviceLocation().then((next) => {
      if (!cancelled && next) setCoords(next);
    });
    return () => {
      cancelled = true;
    };
  }, [open, consent]);

  useEffect(() => {
    const query = value.trim();
    if (!open || query.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      void autocompletePlaces(query, consent === "yes" ? coords : null, controller.signal)
        .then((rows) => {
          if (controller.signal.aborted) return;
          setSuggestions(rows);
          setSearchNote(null);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setSuggestions([]);
          if (err instanceof ApiError && err.status === 503) {
            setSearchNote("Place search isn’t available right now. You can still type a location.");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [value, open, consent, coords]);

  const query = value.trim().toLowerCase();
  const recentRows = recents.filter((item) => !query || item.toLowerCase().includes(query));
  const placeRows = suggestions.filter(
    (suggestion) => !recentRows.some((item) => item.toLowerCase() === suggestion.label.toLowerCase()),
  );
  const rows: Row[] = [
    ...recentRows.map((item) => ({ kind: "recent" as const, label: item })),
    ...placeRows.map((suggestion) => ({ kind: "place" as const, suggestion })),
  ];
  const showAsk = open && consent === "ask";
  const showMenu = open && (showAsk || rows.length > 0 || searching || Boolean(searchNote) || consent === "no");
  const activeIndex = active >= 0 && active < rows.length ? active : -1;

  function pick(nextLabel: string) {
    const next = nextLabel.slice(0, 300);
    onChange(next);
    setRecents(rememberPlace(next));
    setOpen(false);
  }

  async function shareLocation() {
    writeLocationConsent("yes");
    setConsent("yes");
    const next = await requestDeviceLocation();
    if (!next) {
      writeLocationConsent("no");
      setConsent("no");
      setBlocked(true);
      return;
    }
    setBlocked(false);
    setCoords(next);
  }

  function declineLocation() {
    writeLocationConsent("no");
    setConsent("no");
  }

  return (
    <div ref={rootRef} className="place-location-block">
      <div className="place-location-head">
        <span id={labelId} className="calendar-editor-cell-label">{label}</span>
        <input
          className="calendar-editor-input calendar-editor-input-inset"
          value={value}
          maxLength={300}
          role="combobox"
          aria-labelledby={labelId}
          aria-autocomplete="list"
          aria-expanded={showMenu}
          aria-controls={showMenu ? listId : undefined}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          placeholder="Add a location"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onBlur={(event) => {
            if (rootRef.current?.contains(event.relatedTarget as Node)) return;
            setOpen(false);
          }}
          onChange={(event) => {
            onChange(event.target.value.slice(0, 300));
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && showMenu) {
              event.stopPropagation();
              setOpen(false);
              return;
            }
            if (!showMenu || rows.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((current) => (current + 1) % rows.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((current) => (current <= 0 ? rows.length - 1 : current - 1));
            } else if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && activeIndex >= 0) {
              event.preventDefault();
              const row = rows[activeIndex];
              pick(row.kind === "recent" ? row.label : row.suggestion.label);
            }
          }}
        />
      </div>
      {showMenu ? (
        <div className="place-dropdown" onMouseDown={(event) => event.preventDefault()}>
          {showAsk ? (
            <div className="place-ask">
              <p>Share your location so nearby places come up first?</p>
              <div className="place-ask-actions">
                <button type="button" className="primary-btn place-ask-btn" onClick={() => void shareLocation()}>
                  Share location
                </button>
                <button type="button" className="ghost-btn place-ask-btn" onClick={declineLocation}>
                  Not now
                </button>
              </div>
            </div>
          ) : null}
          {rows.length > 0 ? (
            <ul id={listId} role="listbox" aria-label="Locations" className="place-dropdown-list">
              {recentRows.length > 0 ? <li className="place-menu-label">Recent</li> : null}
              {rows.map((row, index) => {
                const isPlace = row.kind === "place";
                const rowLabel = isPlace ? row.suggestion.mainText : row.label;
                const secondary = isPlace ? row.suggestion.secondaryText : undefined;
                const showPlacesLabel = isPlace && index === recentRows.length;
                return (
                  <li key={`${row.kind}:${isPlace ? row.suggestion.label : row.label}`}>
                    {showPlacesLabel ? <div className="place-menu-label">Places</div> : null}
                    <button
                      type="button"
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={index === activeIndex}
                      className={`place-option${index === activeIndex ? " is-active" : ""}`}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => pick(isPlace ? row.suggestion.label : row.label)}
                    >
                      <span>{rowLabel}</span>
                      {secondary ? <small>{secondary}</small> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {searching ? <p className="place-note">Searching places…</p> : null}
          {searchNote && !searching ? <p className="place-note">{searchNote}</p> : null}
          {blocked && !showAsk ? <p className="place-note">Nearby bias is off until location is shared.</p> : null}
          {consent === "no" && !showAsk ? (
            <button type="button" className="place-use-location" onClick={() => void shareLocation()}>
              Use my location
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
