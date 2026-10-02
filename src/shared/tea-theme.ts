"use client";

import { useCallback, useEffect, useState } from "react";

//keep in sync with public/tea-theme.js, which applies the saved theme and scheme before first paint
const STORAGE_KEY = "watagent.theme.v1";

export const APPEARANCE_LOCAL_EVENT = "watagent-appearance-local";
export const APPEARANCE_REMOTE_EVENT = "watagent-appearance-remote";

function notifyAppearanceLocal(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(APPEARANCE_LOCAL_EVENT));
}

function notifyAppearanceRemote(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(APPEARANCE_REMOTE_EVENT));
}

export type TeaThemeId =
  | "earl-grey"
  | "lady-grey"
  | "assam"
  | "ceylon"
  | "matcha"
  | "sunrouge"
  | "hojicha"
  | "sakura"
  | "yuzu"
  | "omija"
  | "longjing"
  | "jasmine"
  | "puerh"
  | "tieguanyin";

export type TeaTheme = {
  id: TeaThemeId;
  name: string;
  note: string;
  /** swatch colors for the picker: paper and accent, light scheme */
  paper: string;
  accent: string;
};

export type TeaOrigin = { origin: string; themes: TeaTheme[] };

export const DEFAULT_TEA_THEME: TeaThemeId = "earl-grey";

export const TEA_THEMES: TeaOrigin[] = [
  {
    origin: "British",
    themes: [
      { id: "earl-grey", name: "Earl Grey", note: "Warm paper, terracotta", paper: "#faf7f2", accent: "#c2593b" },
      { id: "lady-grey", name: "Lady Grey", note: "Soft grey, cornflower blue", paper: "#f5f6f8", accent: "#5a6fa8" },
      { id: "assam", name: "Assam", note: "Malty, deep copper", paper: "#f7f1ea", accent: "#9a4a1f" },
      { id: "ceylon", name: "Ceylon", note: "Bright amber citrus", paper: "#fbf6ec", accent: "#b0600f" },
    ],
  },
  {
    origin: "Japan",
    themes: [
      { id: "matcha", name: "Matcha", note: "Creamy whisked green", paper: "#f5f6ec", accent: "#6f8f3a" },
      { id: "sunrouge", name: "Sunrouge", note: "Purple-leaf green tea", paper: "#f7f4f8", accent: "#7b4a9c" },
      { id: "hojicha", name: "Hojicha", note: "Roasted, caramel brown", paper: "#f6f1ea", accent: "#8a5a33" },
      { id: "sakura", name: "Sakura", note: "Cherry blossom pink", paper: "#fbf5f5", accent: "#c25b78" },
    ],
  },
  {
    origin: "Korea",
    themes: [
      { id: "yuzu", name: "Yuja-cha", note: "Honeyed citron gold", paper: "#fbf8ee", accent: "#a17208" },
      { id: "omija", name: "Omija-cha", note: "Five-flavor berry red", paper: "#faf5f3", accent: "#b0303f" },
    ],
  },
  {
    origin: "China",
    themes: [
      { id: "longjing", name: "Longjing", note: "Dragon Well jade", paper: "#f2f6f3", accent: "#3d8a6e" },
      { id: "jasmine", name: "Jasmine", note: "Pale and cool, misty teal", paper: "#f7f8f5", accent: "#4e7f88" },
      { id: "puerh", name: "Pu-erh", note: "Aged, earthy mahogany", paper: "#f4efeb", accent: "#7a3b2e" },
      {
        id: "tieguanyin",
        name: "Tieguanyin",
        note: "Pale creamy yellow, orchid gold",
        paper: "#faf6e8",
        accent: "#b8943a",
      },
    ],
  },
];

const IDS = new Set<string>(TEA_THEMES.flatMap((group) => group.themes.map((theme) => theme.id)));

function isTeaThemeId(value: unknown): value is TeaThemeId {
  return typeof value === "string" && IDS.has(value);
}

export function readTeaTheme(): TeaThemeId {
  if (typeof window === "undefined") return DEFAULT_TEA_THEME;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isTeaThemeId(raw) ? raw : DEFAULT_TEA_THEME;
  } catch {
    return DEFAULT_TEA_THEME;
  }
}

export function applyTeaTheme(id: TeaThemeId): void {
  if (typeof document === "undefined") return;
  if (id === DEFAULT_TEA_THEME) document.documentElement.removeAttribute("data-tea");
  else document.documentElement.setAttribute("data-tea", id);
}

export function writeTeaTheme(id: TeaThemeId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
    notifyAppearanceLocal();
  } catch {
    return;
  }
}

export function applyStoredAppearance(): void {
  applyTeaTheme(readTeaTheme());
  applyColorScheme(readColorScheme());
  notifyAppearanceRemote();
}

export function useTeaTheme(): [TeaThemeId, (id: TeaThemeId) => void] {
  const [theme, setTheme] = useState<TeaThemeId>(readTeaTheme);
  useEffect(() => {
    const onRemote = () => setTheme(readTeaTheme());
    window.addEventListener(APPEARANCE_REMOTE_EVENT, onRemote);
    return () => window.removeEventListener(APPEARANCE_REMOTE_EVENT, onRemote);
  }, []);
  const choose = useCallback((id: TeaThemeId) => {
    setTheme(id);
    applyTeaTheme(id);
    writeTeaTheme(id);
  }, []);
  return [theme, choose];
}

const SCHEME_KEY = "watagent.scheme.v1";

export type ColorSchemePreference = "light" | "dark" | "system";

function isSchemePreference(value: unknown): value is ColorSchemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function readColorScheme(): ColorSchemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(SCHEME_KEY);
    return isSchemePreference(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

//public/tea-theme.js re-resolves "system" whenever the OS setting flips, reading the saved preference
export function applyColorScheme(pref: ColorSchemePreference): void {
  if (typeof window === "undefined") return;
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-scheme", dark ? "dark" : "light");
}

export function writeColorScheme(pref: ColorSchemePreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SCHEME_KEY, pref);
    notifyAppearanceLocal();
  } catch {
    return;
  }
}

export function useColorScheme(): [ColorSchemePreference, (pref: ColorSchemePreference) => void] {
  const [scheme, setScheme] = useState<ColorSchemePreference>(readColorScheme);
  useEffect(() => {
    const onRemote = () => setScheme(readColorScheme());
    window.addEventListener(APPEARANCE_REMOTE_EVENT, onRemote);
    return () => window.removeEventListener(APPEARANCE_REMOTE_EVENT, onRemote);
  }, []);
  const choose = useCallback((pref: ColorSchemePreference) => {
    setScheme(pref);
    writeColorScheme(pref);
    applyColorScheme(pref);
  }, []);
  return [scheme, choose];
}
