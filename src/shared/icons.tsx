import type { ReactNode } from "react";

type IconProps = { className?: string };

//one stroke language for every glyph so icons stop inheriting whatever the font does with ‹ × ✓
function Glyph({ children, className, strokeWidth = 1.75 }: IconProps & { children: ReactNode; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ? `glyph ${className}` : "glyph"}
    >
      {children}
    </svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M9.75 3.75 5.5 8l4.25 4.25" />
    </Glyph>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M6.25 3.75 10.5 8l-4.25 4.25" />
    </Glyph>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    </Glyph>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M8 3.5v9M3.5 8h9" />
    </Glyph>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={2}>
      <path d="M8 12.75V3.5M4 7.25 8 3.25l4 4" />
    </Glyph>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={2}>
      <path d="M8 3.25v9.25M4 8.75l4 4 4-4" />
    </Glyph>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="4.5" y="4.5" width="7" height="7" rx="1.5" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={2}>
      <path d="M3.5 8.4 6.6 11.4 12.5 4.75" />
    </Glyph>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={2}>
      <path d="M8 4v4.75" />
      <circle cx="8" cy="11.6" r="0.4" fill="currentColor" />
    </Glyph>
  );
}

export function RedoIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={1.75}>
      <path d="M12.5 6.25H6.2a2.7 2.7 0 0 0 0 5.4H9" />
      <path d="M10.2 3.9 12.7 6.25 10.2 8.6" />
    </Glyph>
  );
}

export function ToolIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M5.5 10.5 10.5 5.5M7 5.5h3.5V9" />
    </Glyph>
  );
}
