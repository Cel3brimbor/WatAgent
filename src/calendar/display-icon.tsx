import type { ReactNode } from "react";
import type { QuickDisplayIcon } from "@/calendar/calendar-spaces";

export const DISPLAY_ICON_LABELS: Record<QuickDisplayIcon, string> = {
  layers: "Layers",
  sun: "Sun",
  moon: "Moon",
  book: "Book",
  bolt: "Bolt",
  heart: "Heart",
  star: "Star",
  flag: "Flag",
  leaf: "Leaf",
  bell: "Bell",
  pin: "Pin",
  compass: "Compass",
};

export function DisplayIcon({ id }: { id: QuickDisplayIcon }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      {ICON_PATHS[id]}
    </svg>
  );
}

const ICON_PATHS: Record<QuickDisplayIcon, ReactNode> = {
  layers: (
    <>
      <rect x="3.25" y="3.25" width="9.5" height="6.2" rx="1.3" />
      <path d="M4.4 11.6h7.2M5.4 13.35h5.2" />
    </>
  ),
  sun: (
    <>
      <circle cx="8" cy="8" r="2.35" />
      <path d="M8 2.35v1.45M8 12.2v1.45M2.35 8h1.45M12.2 8h1.45M4.05 4.05l1.05 1.05M10.9 10.9l1.05 1.05M11.95 4.05 10.9 5.1M5.1 10.9l-1.05 1.05" />
    </>
  ),
  moon: <path d="M10.2 2.6a5.15 5.15 0 1 0 3.2 8.9 4.35 4.35 0 0 1-3.2-8.9z" />,
  book: (
    <>
      <path d="M3.2 3.1h4.1c.7.7 1.5 1.05 2.35 1.05H12.8V13H8.7c-.7 0-1.4-.25-2.05-.75" />
      <path d="M3.2 3.1v9.15c.65.5 1.35.75 2.05.75H8" />
    </>
  ),
  bolt: <path d="M9.1 2.4 4.2 8.7h3.1L6.6 13.6l5.2-6.5H8.6z" />,
  heart: <path d="M8 13.2 3.4 8.7a2.7 2.7 0 0 1 3.8-3.8L8 5.7l.8-.8a2.7 2.7 0 0 1 3.8 3.8z" />,
  star: <path d="m8 2.5 1.45 3.15 3.45.4-2.55 2.35.7 3.4L8 10.15 4.95 11.8l.7-3.4L3.1 6.05l3.45-.4z" />,
  flag: (
    <>
      <path d="M4.25 2.6v11" />
      <path d="M4.25 3.2h7.1l-1.35 2.15 1.35 2.15H4.25" />
    </>
  ),
  leaf: <path d="M13 3.1S8.2 3.4 5.6 6.4 3.2 12.8 3.2 12.8s4.2-.2 6.6-2.8S13 3.1 13 3.1zM5.4 10.6l3.3-3.3" />,
  bell: (
    <>
      <path d="M8 2.6a.7.7 0 0 1 .7.7c1.7.3 2.9 1.7 2.9 3.5v2.1l.9 1.5H3.5l.9-1.5V6.8c0-1.8 1.2-3.2 2.9-3.5a.7.7 0 0 1 .7-.7z" />
      <path d="M6.7 11.6a1.35 1.35 0 0 0 2.6 0" />
    </>
  ),
  pin: (
    <>
      <path d="M8 14.2s4.1-3.7 4.1-6.7a4.1 4.1 0 1 0-8.2 0c0 3 4.1 6.7 4.1 6.7z" />
      <circle cx="8" cy="7.4" r="1.35" />
    </>
  ),
  compass: (
    <>
      <circle cx="8" cy="8" r="5.35" />
      <path d="m9.7 6.3-1.1 3.3-3.3 1.1 1.1-3.3z" />
    </>
  ),
};
