const RECENTS_KEY = "watagent.places.recents";
const CONSENT_KEY = "watagent.location.share";
const MAX_RECENTS = 8;

export type LocationConsent = "yes" | "no" | "ask";

export type DeviceCoords = { latitude: number; longitude: number };

let coordsCache: { coords: DeviceCoords; at: number } | null = null;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readPlaceRecents(): string[] {
  const store = storage();
  if (!store) return [];
  try {
    const raw = JSON.parse(store.getItem(RECENTS_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.replace(/\s+/g, " ").trim().slice(0, 300))
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

export function rememberPlace(label: string): string[] {
  const next = label.replace(/\s+/g, " ").trim().slice(0, 300);
  if (!next) return readPlaceRecents();
  const stored = [next, ...readPlaceRecents().filter((item) => item.toLowerCase() !== next.toLowerCase())].slice(
    0,
    MAX_RECENTS,
  );
  try {
    storage()?.setItem(RECENTS_KEY, JSON.stringify(stored));
  } catch {
    //storage full or blocked
  }
  return stored;
}

export function readLocationConsent(): LocationConsent {
  const value = storage()?.getItem(CONSENT_KEY);
  if (value === "yes" || value === "no") return value;
  return "ask";
}

export function writeLocationConsent(value: "yes" | "no"): void {
  try {
    storage()?.setItem(CONSENT_KEY, value);
  } catch {
    //storage blocked
  }
}

export function cachedDeviceCoords(): DeviceCoords | null {
  if (!coordsCache || Date.now() - coordsCache.at > 10 * 60 * 1000) return null;
  return coordsCache.coords;
}

//browser prompt, or the native location prompt inside the app webview
export function requestDeviceLocation(): Promise<DeviceCoords | null> {
  const cached = cachedDeviceCoords();
  if (cached) return Promise.resolve(cached);
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        coordsCache = { coords, at: Date.now() };
        resolve(coords);
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 },
    );
  });
}
