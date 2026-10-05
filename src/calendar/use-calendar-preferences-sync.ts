"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildUserCalendarPreferencesDoc,
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
  writeImportedCalendars,
  writeMergedCalendars,
  writeAgentHiddenIds,
  writeNewCalendarsShown,
  writeColorOverrides,
  writeSidePanelSections,
  writeSourceFilter,
  type CalendarColors,
  type CalendarSourceFilter,
  type SidePanelSectionsOpen,
} from "@/calendar/preferences";
import { writeSmartTags, type SmartTag } from "@/calendar/smart-tags";
import { writeKeywordTasks, type KeywordTasks } from "@/calendar/keyword-tasks";
import { writeLocalCalendars, type LocalCalendar } from "@/calendar/local-calendars";
import type { CalendarView, ImportedCalendar, MergedCalendar } from "@/calendar/types";
import { writeCampusSubscriptions } from "@/campus/campus-subscription-prefs";
import type { CampusSubscriptionPref } from "@/campus/campus-subscription-prefs";
import type { MutableRefObject } from "react";

const SAVE_DEBOUNCE_MS = 600;

export type CalendarPreferencesState = {
  view: CalendarView;
  importedCalendars: ImportedCalendar[];
  mergedCalendars: MergedCalendar[];
  agentHiddenCalendarIds: string[];
  newCalendarsShown: boolean;
  localCalendars: LocalCalendar[];
  sources: CalendarSourceFilter;
  colors: CalendarColors;
  colorOverrides: Record<string, string>;
  smartTags: SmartTag[];
  keywordTasks: KeywordTasks;
  navCollapsed: boolean;
  sidePanelSections: SidePanelSectionsOpen;
};

function writeLocalCache(doc: UserCalendarPreferencesV1): void {
  writeCalendarView(doc.view);
  writeImportedCalendars(doc.importedCalendars);
  writeMergedCalendars(doc.mergedCalendars);
  writeAgentHiddenIds(doc.agentHiddenCalendarIds);
  writeNewCalendarsShown(doc.newCalendarsShown);
  writeLocalCalendars(doc.localCalendars);
  writeSourceFilter(doc.sources);
  writeCalendarColors(doc.colors);
  writeColorOverrides(doc.colorOverrides);
  writeSmartTags(doc.smartTags);
  writeKeywordTasks(doc.keywordTasks);
  writeSidePanelSections(doc.sidePanelSections);
  writeCampusSubscriptions(doc.campusSubscriptions);
  try {
    window.localStorage.setItem("watagent.nav.collapsed", doc.navCollapsed ? "1" : "0");
  } catch {
    return;
  }
}

function toDoc(state: CalendarPreferencesState): UserCalendarPreferencesV1 {
  return buildUserCalendarPreferencesDoc(state);
}

type ApplyPatch = {
  setView: (view: CalendarView) => void;
  setImportedCalendars: (calendars: ImportedCalendar[]) => void;
  setMergedCalendars: (calendars: MergedCalendar[]) => void;
  setAgentHiddenCalendarIds: (ids: string[]) => void;
  setNewCalendarsShown: (shown: boolean) => void;
  setLocalCalendars: (calendars: LocalCalendar[]) => void;
  setSources: (sources: CalendarSourceFilter) => void;
  setColors: (colors: CalendarColors) => void;
  setColorOverrides: (overrides: Record<string, string>) => void;
  setSmartTags: (tags: SmartTag[]) => void;
  setKeywordTasks: (config: KeywordTasks) => void;
  setNavCollapsed: (collapsed: boolean) => void;
  setSidePanelSections: (sections: SidePanelSectionsOpen) => void;
  /** One-time restore list from the server; feeds may still need to be created on this device. */
  onCampusSubscriptionsRestore?: (subs: CampusSubscriptionPref[]) => void;
};

function applyDoc(doc: UserCalendarPreferencesV1, apply: ApplyPatch): void {
  apply.setView(doc.view);
  apply.setImportedCalendars(doc.importedCalendars);
  apply.setMergedCalendars(doc.mergedCalendars);
  apply.setAgentHiddenCalendarIds(doc.agentHiddenCalendarIds);
  apply.setNewCalendarsShown(doc.newCalendarsShown);
  apply.setLocalCalendars(doc.localCalendars);
  apply.setSources(doc.sources);
  apply.setColors(doc.colors);
  apply.setColorOverrides(doc.colorOverrides);
  apply.setSmartTags(doc.smartTags);
  apply.setKeywordTasks(doc.keywordTasks);
  apply.setNavCollapsed(doc.navCollapsed);
  apply.setSidePanelSections(doc.sidePanelSections);
  apply.onCampusSubscriptionsRestore?.(doc.campusSubscriptions);
  writeLocalCache(doc);
}

/** Loads preferences from the server (with one-time local → server migration) and debounces saves. False until that first load settles. */
export function useCalendarPreferencesSync(
  ready: boolean,
  state: CalendarPreferencesState,
  apply: ApplyPatch,
  flushSaveRef?: MutableRefObject<((overrides?: Partial<CalendarPreferencesState>) => void) | null>,
): boolean {
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const stateRef = useRef(state);
  stateRef.current = state;
  const skipSaveRef = useRef(true);
  const saveTimerRef = useRef(0);
  const pendingSaveRef = useRef<UserCalendarPreferencesV1 | null>(null);
  const mountedRef = useRef(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const atStart = stateRef.current;
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
          if (parsed) {
            const latest = stateRef.current;
            //subscribing while this load is in flight already wrote events; keep that link instead of restoring the older list
            const calendarsChanged = latest.importedCalendars !== atStart.importedCalendars || latest.mergedCalendars !== atStart.mergedCalendars;
            const { version: _version, campusSubscriptions: _campus, ...parsedState } = parsed;
            const doc = calendarsChanged
              ? buildUserCalendarPreferencesDoc({
                  ...parsedState,
                  importedCalendars: latest.importedCalendars,
                  mergedCalendars: latest.mergedCalendars,
                  colorOverrides: latest.colorOverrides,
                })
              : parsed;
            if (!cancelled) applyDoc(doc, applyRef.current);
            if (calendarsChanged) await saveCalendarPreferences(doc);
          }
        }
      } catch {
        // Keep localStorage-backed state when offline or API errors.
      } finally {
        if (!cancelled) {
          skipSaveRef.current = false;
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  const { view, importedCalendars, mergedCalendars, agentHiddenCalendarIds, newCalendarsShown, localCalendars, sources, colors, colorOverrides, smartTags, keywordTasks, navCollapsed, sidePanelSections } = state;

  useEffect(() => {
    if (!ready || skipSaveRef.current) return;
    const doc = toDoc({ view, importedCalendars, mergedCalendars, agentHiddenCalendarIds, newCalendarsShown, localCalendars, sources, colors, colorOverrides, smartTags, keywordTasks, navCollapsed, sidePanelSections });
    writeLocalCache(doc);
    pendingSaveRef.current = doc;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      pendingSaveRef.current = null;
      void saveCalendarPreferences(doc).catch(() => undefined);
    }, SAVE_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(saveTimerRef.current);
      const queued = pendingSaveRef.current;
      //only a real unmount flushes; saving here on every edit would let an older list overwrite the new one
      if (!queued || mountedRef.current) return;
      pendingSaveRef.current = null;
      void saveCalendarPreferences(queued).catch(() => undefined);
    };
  }, [ready, view, importedCalendars, mergedCalendars, agentHiddenCalendarIds, newCalendarsShown, localCalendars, sources, colors, colorOverrides, smartTags, keywordTasks, navCollapsed, sidePanelSections]);

  const flushSave = (overrides?: Partial<CalendarPreferencesState>) => {
    if (!ready || skipSaveRef.current) return;
    window.clearTimeout(saveTimerRef.current);
    pendingSaveRef.current = null;
    const doc = toDoc({ ...stateRef.current, ...overrides });
    writeLocalCache(doc);
    void saveCalendarPreferences(doc).catch(() => undefined);
  };

  useEffect(() => {
    if (!flushSaveRef) return;
    flushSaveRef.current = flushSave;
    return () => {
      flushSaveRef.current = null;
    };
  });

  //declared after the save effect so this cleanup runs first and the flush above can see the unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return loaded;
}
