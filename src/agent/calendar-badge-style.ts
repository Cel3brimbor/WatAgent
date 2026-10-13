import type { CSSProperties } from "react";
import { HEX_COLOR } from "@/calendar/preferences";

const CHIP_INK = "#1d1b18";
const CHIP_PAPER = "#fffaf5";

function hexRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return null;
  const n = Number.parseInt(match[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function luminance(rgb: { r: number; g: number; b: number }): number {
  const channel = (value: number) => {
    const unit = value / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

function chipForeground(bg: string): { fg: string; soft: string } {
  const rgb = hexRgb(bg);
  if (!rgb) return { fg: "var(--on-accent)", soft: "color-mix(in srgb, var(--on-accent) 78%, transparent)" };
  const light = luminance(rgb) > 0.55;
  return light
    ? { fg: CHIP_INK, soft: "color-mix(in srgb, #1d1b18 72%, transparent)" }
    : { fg: CHIP_PAPER, soft: "color-mix(in srgb, #fffaf5 78%, transparent)" };
}

/**dot-only spots (mention menu, popover title) just need the swatch*/
export function calendarSwatchStyle(color: string): CSSProperties {
  return { "--cal": HEX_COLOR.test(color) ? color : "var(--accent)" } as CSSProperties;
}

/**calendar chips carry their own fill and contrasting label, including inside user bubbles*/
export function calendarBadgeStyle(color: string): CSSProperties {
  if (!HEX_COLOR.test(color)) {
    return {
      "--cal": "var(--accent)",
      "--cal-chip-bg": "var(--accent)",
      "--cal-chip-fg": "var(--on-accent)",
      "--cal-chip-fg-soft": "color-mix(in srgb, var(--on-accent) 78%, transparent)",
    } as CSSProperties;
  }
  const { fg, soft } = chipForeground(color);
  return {
    "--cal": color,
    "--cal-chip-bg": color,
    "--cal-chip-fg": fg,
    "--cal-chip-fg-soft": soft,
  } as CSSProperties;
}
