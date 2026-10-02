"use client";

import { useEffect, useRef } from "react";
import {
  applyStoredAppearance,
  applyTeaTheme,
  APPEARANCE_LOCAL_EVENT,
  readColorScheme,
  readTeaTheme,
  writeColorScheme,
  writeTeaTheme,
  type ColorSchemePreference,
  type TeaThemeId,
} from "@/shared/tea-theme";
import { getCalendarSettings, patchCalendarSettings } from "@/calendar/approval-client";

const SAVE_DEBOUNCE_MS = 600;

function serverAppearanceEmpty(settings: {
  teaTheme: TeaThemeId | null;
  colorScheme: ColorSchemePreference | null;
}): boolean {
  return settings.teaTheme == null && settings.colorScheme == null;
}

function applyRemoteAppearance(teaTheme: TeaThemeId | null, colorScheme: ColorSchemePreference | null): void {
  if (teaTheme) {
    applyTeaTheme(teaTheme);
    writeTeaTheme(teaTheme);
  }
  if (colorScheme) writeColorScheme(colorScheme);
  applyStoredAppearance();
}

/** Loads tea theme and color scheme from the profile (with one-time local → server migration) and debounces saves. */
export function useAppearanceSync(ready: boolean): void {
  const skipSaveRef = useRef(true);
  const saveTimerRef = useRef(0);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      try {
        const remote = await getCalendarSettings();
        if (cancelled) return;
        const localTea = readTeaTheme();
        const localScheme = readColorScheme();
        if (serverAppearanceEmpty(remote)) {
          await patchCalendarSettings({ teaTheme: localTea, colorScheme: localScheme });
          if (cancelled) return;
        } else {
          applyRemoteAppearance(remote.teaTheme, remote.colorScheme);
        }
      } catch {
        //keep localStorage-backed appearance when offline or API errors
      } finally {
        if (!cancelled) skipSaveRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const onLocalChange = () => {
      if (skipSaveRef.current) return;
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        void patchCalendarSettings({
          teaTheme: readTeaTheme(),
          colorScheme: readColorScheme(),
        }).catch(() => undefined);
      }, SAVE_DEBOUNCE_MS);
    };
    window.addEventListener(APPEARANCE_LOCAL_EVENT, onLocalChange);
    return () => {
      window.removeEventListener(APPEARANCE_LOCAL_EVENT, onLocalChange);
      window.clearTimeout(saveTimerRef.current);
    };
  }, [ready]);
}
