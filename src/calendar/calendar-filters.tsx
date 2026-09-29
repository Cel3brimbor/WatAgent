"use client";

import type { CalendarSourceFilter } from "@/calendar/preferences";

type Props = {
  value: CalendarSourceFilter;
  onChange: (value: CalendarSourceFilter) => void;
};

export function CalendarFilters({ value, onChange }: Props) {
  return (
    <fieldset className="calendar-filters">
      <legend className="calendar-filters-legend">Show calendars</legend>
      <label className="calendar-filter">
        <input
          type="checkbox"
          checked={value.app}
          onChange={(event) => onChange({ ...value, app: event.target.checked })}
        />
        <span className="calendar-filter-swatch is-app" aria-hidden="true" />
        WatAgent
      </label>
      <label className="calendar-filter">
        <input
          type="checkbox"
          checked={value.google}
          onChange={(event) => onChange({ ...value, google: event.target.checked })}
        />
        <span className="calendar-filter-swatch is-google" aria-hidden="true" />
        Google
      </label>
    </fieldset>
  );
}
