import type { LayoutStore, MapPoint } from "./types";

const MAX_NODES = 200;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

//anything malformed is dropped rather than trusted; positions are clamped to the canvas
export function parseLayout(raw: unknown): Record<string, MapPoint> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const entries: Array<[string, MapPoint]> = [];
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (entries.length >= MAX_NODES) break;
    if (!id || id.length > 200 || UNSAFE_KEYS.has(id) || !value || typeof value !== "object") continue;
    const { x, y } = value as Record<string, unknown>;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    entries.push([id, { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }]);
  }
  return Object.fromEntries(entries);
}

function rounded(positions: Record<string, MapPoint>): Record<string, MapPoint> {
  return Object.fromEntries(
    Object.entries(positions).map(([id, point]) => [id, { x: Math.round(point.x * 1e4) / 1e4, y: Math.round(point.y * 1e4) / 1e4 }]),
  );
}

/** Keeps one device's arrangement in localStorage. Private windows and blocked storage just start fresh. */
export function createLocalLayoutStore(key: string): LayoutStore {
  return {
    load() {
      try {
        const raw = globalThis.localStorage?.getItem(key);
        return raw ? parseLayout(JSON.parse(raw)) : {};
      } catch {
        return {};
      }
    },
    save(positions) {
      try {
        if (Object.keys(positions).length === 0) globalThis.localStorage?.removeItem(key);
        else globalThis.localStorage?.setItem(key, JSON.stringify(rounded(positions)));
      } catch {
        return;
      }
    },
  };
}
