import { apiJson } from "@/shared/api-base";

export type PlaceSuggestion = {
  label: string;
  mainText: string;
  secondaryText?: string;
};

function suggestionOf(raw: unknown): PlaceSuggestion | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const label = typeof rec.label === "string" ? rec.label.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  const mainText = typeof rec.mainText === "string" ? rec.mainText.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  if (!label || !mainText) return null;
  const secondary =
    typeof rec.secondaryText === "string" ? rec.secondaryText.replace(/\s+/g, " ").trim().slice(0, 240) : "";
  return secondary ? { label, mainText, secondaryText: secondary } : { label, mainText };
}

export async function autocompletePlaces(
  input: string,
  coords: { latitude: number; longitude: number } | null,
  signal: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const payload = await apiJson<{ suggestions?: unknown }>("/api/places/autocomplete", {
    method: "POST",
    signal,
    body: JSON.stringify({
      input: input.slice(0, 120),
      ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
    }),
  });
  if (!Array.isArray(payload.suggestions)) return [];
  const seen = new Set<string>();
  const suggestions: PlaceSuggestion[] = [];
  for (const row of payload.suggestions) {
    const suggestion = suggestionOf(row);
    if (!suggestion) continue;
    const key = suggestion.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push(suggestion);
    if (suggestions.length >= 5) break;
  }
  return suggestions;
}
