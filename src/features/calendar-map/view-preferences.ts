export type ViewPreferences = {
  zoom: number | null;
  background: boolean;
  labels: boolean;
  locked: boolean;
  connections: "all" | "selected" | "none";
};
export const DEFAULT_VIEW: ViewPreferences = { zoom: null, background: true, labels: false, locked: false, connections: "all" };
export function parseView(raw: unknown): ViewPreferences {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_VIEW };
  const value = raw as Record<string, unknown>;
  return {
    zoom: typeof value.zoom === "number" && Number.isFinite(value.zoom) ? Math.min(1.5, Math.max(0.5, value.zoom)) : null,
    background: typeof value.background === "boolean" ? value.background : DEFAULT_VIEW.background,
    labels: typeof value.labels === "boolean" ? value.labels : DEFAULT_VIEW.labels,
    locked: typeof value.locked === "boolean" ? value.locked : DEFAULT_VIEW.locked,
    connections: value.connections === "selected" || value.connections === "none" ? value.connections : "all",
  };
}
