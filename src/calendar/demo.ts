import type { AuthUser } from "@/auth/types";
import type { CalendarItemDoc } from "./types";

/*dev-only preview: `npm run dev:web` then open /?demo=1 to see the calendar with sample data and no sign-in*/
export function isDemoMode(): boolean {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("demo");
}

export const DEMO_USER: AuthUser = { id: "00000000-0000-4000-8000-000000000000", email: "demo@example.com" };

export function demoItems(): CalendarItemDoc[] {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  const at = (offsetDays: number, hour: number) => day.getTime() + offsetDays * 864e5 + hour * 36e5;
  const rows: [string, "event" | "task", number, number, number, boolean?][] = [
    ["Team standup", "event", 0, 9, 0.5],
    ["Design review", "event", 0, 11, 1.5],
    ["Lunch with Sam", "event", 0, 12.5, 1],
    ["Write project brief", "task", 0, 15, 1],
    ["Gym", "event", 0, 18, 1],
    ["Dentist", "event", 1, 10, 1],
    ["Submit expenses", "task", 1, 14, 0.5],
    ["Planning session", "event", 2, 13, 2],
    ["Call landlord", "task", 2, 9, 0.5, true],
    ["Dinner", "event", 3, 19, 2],
    ["Sprint demo", "event", -1, 15, 1],
    ["Book flights", "task", -1, 10, 0.5],
  ];
  return rows.map(([title, kind, d, h, len, completed], i) => ({
    id: `demo-${i}`,
    title,
    calendar: { kind, startUTC: at(d, h), endUTC: at(d, h + len), allDay: false, completed },
    createdAt: at(0, 0),
    updatedAt: at(0, 0),
  }));
}
