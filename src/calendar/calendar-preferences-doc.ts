import { importedCalendarsOf, legacyMergedCalendars, mergedCalendarsOf } from "@/calendar/imported-calendars";
import {
  ALL_SOURCES,
  DEFAULT_COLORS,
  HEX_COLOR,
  readCalendarColors,
  readCalendarView,
  readImportedCalendars,
  readCampusCalendars,
  readMergedCalendars,
  readAgentHiddenIds,
  readNewCalendarsShown,
  agentHiddenIdsOf,
  readColorOverrides,
  readSidePanelSections,
  readSourceFilter,
  protectBuiltinCalendarSources,
  calendarGroupsOf,
  DEFAULT_SIDE_PANEL_SECTIONS,
  type CalendarColors,
  type CalendarSourceFilter,
  type SidePanelSectionsOpen,
} from "@/calendar/preferences";
import { parseSmartTagsFromUnknown, readSmartTags, type SmartTag } from "@/calendar/smart-tags";
import { parseKeywordTasksFromUnknown, readKeywordTasks, type KeywordTasks } from "@/calendar/keyword-tasks";
import type { CalendarView, ImportedCalendar, MergedCalendar } from "@/calendar/types";
import {
  MAIN_CALENDAR_SPACE_ID,
  activeSpaceIdOf,
  calendarSpacesOf,
  readCalendarSpaces,
  type CalendarSpace,
} from "@/calendar/calendar-spaces";
import { splitCampusCalendars } from "@/campus/campus-events";
import { BUILTIN_CALENDARS, localCalendarsOf, readLocalCalendars, type LocalCalendar } from "@/calendar/local-calendars";
import {
  campusSubscriptionsOf,
  colorOverridesWithCampusSubscriptions,
  parseCampusSubscriptions,
  readCampusSubscriptions,
  type CampusSubscriptionPref,
} from "@/campus/campus-subscription-prefs";
export type UserCalendarPreferencesV1 = {
  version: 1;
  view: CalendarView;
  importedCalendars: ImportedCalendar[];
  campusCalendars: ImportedCalendar[];
  mergedCalendars: MergedCalendar[];
  agentHiddenCalendarIds: string[];
  newCalendarsShown: boolean;
  localCalendars: LocalCalendar[];
  sources: CalendarSourceFilter;
  colors: CalendarColors;
  colorOverrides: Record<string, string>;
  campusSubscriptions: CampusSubscriptionPref[];
  smartTags: SmartTag[];
  keywordTasks: KeywordTasks;
  navCollapsed: boolean;
  sidePanelSections: SidePanelSectionsOpen;
  calendarSpaces: CalendarSpace[];
  activeCalendarSpaceId: string;
};

export type UserCalendarPreferencesState = Omit<UserCalendarPreferencesV1, "version" | "campusSubscriptions">;

export function buildUserCalendarPreferencesDoc(state: UserCalendarPreferencesState): UserCalendarPreferencesV1 {
  const feeds = splitCampusCalendars(state.importedCalendars, state.campusCalendars);
  const reserved = new Set([...feeds.imported, ...feeds.campus].map((calendar) => calendar.id));
  const calendarSpaces = calendarSpacesOf(state.calendarSpaces, reserved);
  const campusSubscriptions = campusSubscriptionsOf(feeds.campus, state.colorOverrides);
  return {
    version: 1,
    ...state,
    importedCalendars: feeds.imported,
    campusCalendars: feeds.campus,
    calendarSpaces,
    activeCalendarSpaceId: activeSpaceIdOf(state.activeCalendarSpaceId, calendarSpaces),
    campusSubscriptions,
    colorOverrides: colorOverridesWithCampusSubscriptions(state.colorOverrides, campusSubscriptions),
  };
}

const VIEWS = new Set<CalendarView>(["day", "workweek", "week", "month", "year"]);

function idList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 1024).slice(0, 200);
}

function hexOr(raw: unknown, fallback: string): string {
  return typeof raw === "string" && HEX_COLOR.test(raw) ? raw.toLowerCase() : fallback;
}

function sourcesOf(raw: unknown): CalendarSourceFilter | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  return protectBuiltinCalendarSources({
    events: rec.events !== false,
    tasks: rec.tasks !== false,
    google: rec.google !== false,
    mutedGoogleIds: idList(rec.mutedGoogleIds),
    hiddenIds: idList(rec.hiddenIds),
    readOnlyCalendarIds: idList(rec.readOnlyCalendarIds),
    ...(rec.groups && typeof rec.groups === "object" ? { groups: calendarGroupsOf(rec.groups) } : {}),
  });
}

function colorsOf(raw: unknown): CalendarColors | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  return {
    event: hexOr(rec.event, DEFAULT_COLORS.event),
    task: hexOr(rec.task, DEFAULT_COLORS.task),
    google: hexOr(rec.google, DEFAULT_COLORS.google),
    useGoogleColors: rec.useGoogleColors !== false,
  };
}

function sidePanelSectionsOf(raw: unknown, fallbacks: SidePanelSectionsOpen): SidePanelSectionsOpen {
  if (!raw || typeof raw !== "object") return fallbacks;
  const rec = raw as Record<string, unknown>;
  return {
    watagent: typeof rec.watagent === "boolean" ? rec.watagent : fallbacks.watagent,
    campus: typeof rec.campus === "boolean" ? rec.campus : fallbacks.campus,
    other: typeof rec.other === "boolean" ? rec.other : fallbacks.other,
    hidden: typeof rec.hidden === "boolean" ? rec.hidden : fallbacks.hidden,
    smartTags: typeof rec.smartTags === "boolean" ? rec.smartTags : fallbacks.smartTags,
  };
}

function overridesOf(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key.length > 1024 || !HEX_COLOR.test(String(value))) continue;
    next[key] = String(value).toLowerCase();
  }
  return next;
}

export function readLocalCalendarPreferences(): UserCalendarPreferencesV1 {
  let navCollapsed = false;
  try {
    navCollapsed = window.localStorage.getItem("watagent.nav.collapsed") === "1";
  } catch {
    navCollapsed = false;
  }
  const storedFeeds = splitCampusCalendars(readImportedCalendars(), readCampusCalendars());
  const importedCalendars = storedFeeds.imported;
  const campusCalendars = storedFeeds.campus;
  const colorOverrides = readColorOverrides();
  const campusSubscriptions =
    readCampusSubscriptions() ?? campusSubscriptionsOf(campusCalendars, colorOverrides);
  const storedSpaces = readCalendarSpaces();
  const reservedFeeds = new Set([...importedCalendars, ...campusCalendars].map((calendar) => calendar.id));
  const calendarSpaces = calendarSpacesOf(storedSpaces.spaces, reservedFeeds);
  return {
    version: 1,
    view: readCalendarView(),
    importedCalendars,
    campusCalendars,
    mergedCalendars: readMergedCalendars([...importedCalendars, ...campusCalendars]),
    agentHiddenCalendarIds: readAgentHiddenIds(),
    newCalendarsShown: readNewCalendarsShown(),
    localCalendars: readLocalCalendars(),
    sources: readSourceFilter(),
    colors: readCalendarColors(),
    colorOverrides: colorOverridesWithCampusSubscriptions(colorOverrides, campusSubscriptions),
    campusSubscriptions,
    smartTags: readSmartTags(),
    keywordTasks: readKeywordTasks(),
    navCollapsed,
    sidePanelSections: readSidePanelSections(),
    calendarSpaces,
    activeCalendarSpaceId: activeSpaceIdOf(storedSpaces.activeId, calendarSpaces),
  };
}

export function parseUserCalendarPreferencesDoc(
  raw: unknown,
  fallbacks: UserCalendarPreferencesV1 = readLocalCalendarPreferences(),
): UserCalendarPreferencesV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const view =
    typeof rec.view === "string" && VIEWS.has(rec.view as CalendarView)
      ? (rec.view as CalendarView)
      : fallbacks.view;
  const sources = sourcesOf(rec.sources) ?? fallbacks.sources;
  const colors = colorsOf(rec.colors) ?? fallbacks.colors;
  //docs saved before these lists keep their links in fixed slots and their duplicate rule as a priority order
  const hasFeedList = rec.importedCalendars !== undefined || rec.calendarLinks !== undefined;
  const listed = hasFeedList
    ? importedCalendarsOf(rec.importedCalendars, rec.calendarLinks, rec.calendarNames)
    : fallbacks.importedCalendars;
  const explicitCampus = rec.campusCalendars !== undefined
    ? importedCalendarsOf(rec.campusCalendars)
    : hasFeedList
      ? []
      : fallbacks.campusCalendars;
  const feeds = splitCampusCalendars(listed, explicitCampus);
  const importedCalendars = feeds.imported;
  const campusCalendars = feeds.campus;
  const mergedCalendars =
    rec.mergedCalendars !== undefined
      ? mergedCalendarsOf(rec.mergedCalendars)
      : legacyMergedCalendars(rec.calendarPriorityOrder, rec.showDuplicateEvents, rec.duplicatePriority, [...importedCalendars, ...campusCalendars]);
  const colorOverrides = rec.colorOverrides !== undefined ? overridesOf(rec.colorOverrides) : fallbacks.colorOverrides;
  const campusSubscriptions =
    rec.campusSubscriptions !== undefined
      ? (parseCampusSubscriptions(rec.campusSubscriptions) ?? campusSubscriptionsOf(campusCalendars, colorOverrides))
      : campusSubscriptionsOf(campusCalendars, colorOverrides);
  const reservedFeeds = new Set([...importedCalendars, ...campusCalendars].map((calendar) => calendar.id));
  const calendarSpaces = rec.calendarSpaces !== undefined
    ? calendarSpacesOf(rec.calendarSpaces, reservedFeeds)
    : calendarSpacesOf(fallbacks.calendarSpaces, reservedFeeds);
  return {
    version: 1,
    view,
    importedCalendars,
    campusCalendars,
    mergedCalendars,
    agentHiddenCalendarIds:
      rec.agentHiddenCalendarIds !== undefined ? agentHiddenIdsOf(rec.agentHiddenCalendarIds) : fallbacks.agentHiddenCalendarIds,
    newCalendarsShown: typeof rec.newCalendarsShown === "boolean" ? rec.newCalendarsShown : fallbacks.newCalendarsShown,
    localCalendars: rec.localCalendars !== undefined ? localCalendarsOf(rec.localCalendars) : fallbacks.localCalendars,
    sources,
    colors,
    colorOverrides: colorOverridesWithCampusSubscriptions(colorOverrides, campusSubscriptions),
    campusSubscriptions,
    smartTags: rec.smartTags !== undefined ? parseSmartTagsFromUnknown(rec.smartTags) : fallbacks.smartTags,
    keywordTasks: rec.keywordTasks !== undefined ? parseKeywordTasksFromUnknown(rec.keywordTasks) : fallbacks.keywordTasks,
    navCollapsed: typeof rec.navCollapsed === "boolean" ? rec.navCollapsed : fallbacks.navCollapsed,
    sidePanelSections:
      rec.sidePanelSections !== undefined
        ? sidePanelSectionsOf(rec.sidePanelSections, fallbacks.sidePanelSections)
        : fallbacks.sidePanelSections,
    calendarSpaces,
    activeCalendarSpaceId: rec.activeCalendarSpaceId !== undefined
      ? activeSpaceIdOf(rec.activeCalendarSpaceId, calendarSpaces)
      : activeSpaceIdOf(fallbacks.activeCalendarSpaceId, calendarSpaces),
  };
}

export function preferencesDocHasContent(doc: UserCalendarPreferencesV1): boolean {
  if (doc.importedCalendars.length > 0 || doc.campusCalendars.length > 0 || doc.mergedCalendars.length > 0 || doc.agentHiddenCalendarIds.length > 0) return true;
  if (!doc.newCalendarsShown) return true;
  if (doc.smartTags.length > 0) return true;
  if (doc.keywordTasks.rules.length > 0 || doc.keywordTasks.doneKeys.length > 0) return true;
  if (JSON.stringify(doc.localCalendars) !== JSON.stringify(BUILTIN_CALENDARS)) return true;
  if (doc.navCollapsed) return true;
  if (JSON.stringify(doc.sidePanelSections) !== JSON.stringify(DEFAULT_SIDE_PANEL_SECTIONS)) return true;
  if (doc.view !== "week") return true;
  if (JSON.stringify(doc.sources) !== JSON.stringify(ALL_SOURCES)) return true;
  if (JSON.stringify(doc.colors) !== JSON.stringify(DEFAULT_COLORS)) return true;
  if (Object.keys(doc.colorOverrides).length > 0) return true;
  if (doc.campusSubscriptions.length > 0) return true;
  if (doc.calendarSpaces.length > 0 || doc.activeCalendarSpaceId !== MAIN_CALENDAR_SPACE_ID) return true;
  return false;
}

export function serverPreferencesEmpty(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return true;
  const keys = Object.keys(raw as Record<string, unknown>).filter((key) => key !== "version");
  return keys.length === 0;
}
