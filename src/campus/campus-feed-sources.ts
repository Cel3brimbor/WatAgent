//uwaterloo feed ids. imported calendars must ignore these even when react state has not caught up yet
const campusFeedSources = new Set<string>();

export function markCampusFeed(id: string): void {
  campusFeedSources.add(id);
}

export function unmarkCampusFeed(id: string): void {
  campusFeedSources.delete(id);
}

export function isCampusFeedSource(id: string): boolean {
  return campusFeedSources.has(id);
}
