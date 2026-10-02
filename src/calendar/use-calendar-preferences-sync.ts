"use client";

import { useEffect, useRef } from "react";
import {
  parseUserCalendarPreferencesDoc,
  preferencesDocHasContent,
  readLocalCalendarPreferences,
  serverPreferencesEmpty,
  type UserCalendarPreferencesV1,
} from "@/calendar/calendar-preferences-doc";
import { fetchCalendarPreferences, saveCalendarPreferences } from "@/calendar/calendar-preferences-client";
import {
  writeCalendarColors,
  writeCalendarView,
  writeCalendarPriority,
  writeCalendarNames,
  writeCalendarLinks,
  writeColorOverrides,
  writeSidePanelSections,
  writeSourceFilter,
  type CalendarColors,
  type CalendarSourceFilter,
  type SidePanelSectionsOpen,
} from "@/calendar/preferences";
import { writeSmartTags, type SmartTag } from "@/calendar/smart-tags";
import { writeLocalCalendars, type LocalCalendar } from "@/calendar/local-calendars";
import type { CalendarLinks, CalendarNames, CalendarPriorityOrder, CalendarView } from "@/calendar/types";

const SAVE_DEBOUNCE_MS = 600;

export type CalendarPreferencesState = {
  view: CalendarView;
  calendarNames: CalendarNames;
  calendarLinks: CalendarLinks;
  calendarPriorityOrder: CalendarPriorityOrder;
  showDuplicateEvents: boolean;
  localCalendars: LocalCalendar[];
  sources: CalendarSourceFilter;
  colors: CalendarColors;
  colorOverrides: Record<string, string>;
  smartTags: SmartTag[];
  navCollapsed: boolean;
  sidePanelSections: SidePanelSectionsOpen;
};

function writeLocalCache(doc: UserCalendarPreferencesV1): void {
  writeCalendarView(doc.view);
  writeCalendarNames(doc.calendarNames);
  writeCalendarLinks(doc.calendarLinks);
  writeCalendarPriority(doc.calendarPriorityOrder, doc.showDuplicateEvents);
  writeLocalCalendars(doc.localCalendars);
  writeSourceFilter(doc.sources);
  writeCalendarColors(doc.colors);
  writeColorOverrides(doc.colorOverrides);
  writeSmartTags(doc.smartTags);
  writeSidePanelSections(doc.sidePanelSections);
  try {
    window.localStorage.setItem("watagent.nav.collapsed", doc.navCollapsed ? "1" : "0");
  } catch {
    return;
  }
}

function toDoc(state: CalendarPreferencesState): UserCalendarPreferencesV1 {
  return { version: 1, ...state };
}

type ApplyPatch = {
  setView: (view: CalendarView) => void;
  setCalendarNames: (names: CalendarNames) => void;
  setCalendarLinks: (links: CalendarLinks) => void;
  setCalendarPriorityOrder: (order: CalendarPriorityOrder) => void;
  setShowDuplicateEvents: (show: boolean) => void;
  setLocalCalendars: (calendars: LocalCalendar[]) => void;
  setSources: (sources: CalendarSourceFilter) => void;
  setColors: (colors: CalendarColors) => void;
  setColorOverrides: (overrides: Record<string, string>) => void;
  setSmartTags: (tags: SmartTag[]) => void;
  setNavCollapsed: (collapsed: boolean) => void;
  setSidePanelSections: (sections: SidePanelSectionsOpen) => void;
};

function applyDoc(doc: UserCalendarPreferencesV1, apply: ApplyPatch): void {
  apply.setView(doc.view);
  apply.setCalendarNames(doc.calendarNames);
  apply.setCalendarLinks(doc.calendarLinks);
  apply.setCalendarPriorityOrder(doc.calendarPriorityOrder);
  apply.setShowDuplicateEvents(doc.showDuplicateEvents);
  apply.setLocalCalendars(doc.localCalendars);
  apply.setSources(doc.sources);
  apply.setColors(doc.colors);
  apply.setColorOverrides(doc.colorOverrides);
  apply.setSmartTags(doc.smartTags);
  apply.setNavCollapsed(doc.navCollapsed);
  apply.setSidePanelSections(doc.sidePanelSections);
  writeLocalCache(doc);
}

/** Loads preferences from the server (with one-time local → server migration) and debounces saves. */
export function useCalendarPreferencesSync(ready: boolean, state: CalendarPreferencesState, apply: ApplyPatch): void {
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const skipSaveRef = useRef(true);
  const saveTimerRef = useRef(0);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      try {
        const local = readLocalCalendarPreferences();
        const remote = await fetchCalendarPreferences();
        if (cancelled) return;
        if (serverPreferencesEmpty(remote.preferences)) {
          if (preferencesDocHasContent(local)) {
            await saveCalendarPreferences(local);
            if (cancelled) return;
            applyDoc(local, applyRef.current);
          }
        } else {
          const parsed = parseUserCalendarPreferencesDoc(remote.preferences, local);
          if (parsed) applyDoc(parsed, applyRef.current);
        }
      } catch {
        // Keep localStorage-backed state when offline or API errors.
      } finally {
        if (!cancelled) skipSaveRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  const { view, calendarNames, calendarLinks, calendarPriorityOrder, showDuplicateEvents, localCalendars, sources, colors, colorOverrides, smartTags, navCollapsed, sidePanelSections } = state;

  useEffect(() => {
    if (!ready || skipSaveRef.current) return;
    const doc = toDoc({ view, calendarNames, calendarLinks, calendarPriorityOrder, showDuplicateEvents, localCalendars, sources, colors, colorOverrides, smartTags, navCollapsed, sidePanelSections });
    writeLocalCache(doc);
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void saveCalendarPreferences(doc).catch(() => undefined);
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(saveTimerRef.current);
  }, [ready, view, calendarNames, calendarLinks, calendarPriorityOrder, showDuplicateEvents, localCalendars, sources, colors, colorOverrides, smartTags, navCollapsed, sidePanelSections]);
}
