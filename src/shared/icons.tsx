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

export function ChevronDownIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M3.75 6.25 8 10.5l4.25-4.25" />
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

export function SunIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={1.5}>
      <circle cx="8" cy="8" r="2.75" />
      <path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05" />
    </Glyph>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={1.5}>
      <path d="M13.25 9.6A5.5 5.5 0 0 1 6.4 2.75a5.5 5.5 0 1 0 6.85 6.85Z" />
    </Glyph>
  );
}

export function SystemIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={1.5}>
      <rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1.5" />
      <path d="M5.75 14h4.5M8 11.25V14" />
    </Glyph>
  );
}

export function DotsVerticalIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
      className={className ? `glyph ${className}` : "glyph"}
    >
      <circle cx="8" cy="3.2" r="1.15" />
      <circle cx="8" cy="8" r="1.15" />
      <circle cx="8" cy="12.8" r="1.15" />
    </svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={1.6}>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
      <path d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7" />
    </Glyph>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={1.5}>
      <path d="M1.75 8S4 3.75 8 3.75 14.25 8 14.25 8 12 12.25 8 12.25 1.75 8 1.75 8z" />
      <circle cx="8" cy="8" r="2" />
    </Glyph>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={1.5}>
      <path d="M6.6 3.9A6.4 6.4 0 0 1 8 3.75C12 3.75 14.25 8 14.25 8a11 11 0 0 1-1.6 2.1M4.2 5.1A10.7 10.7 0 0 0 1.75 8S4 12.25 8 12.25a6 6 0 0 0 2.9-.75" />
      <path d="M6.6 6.6a2 2 0 0 0 2.8 2.8M2.5 2.5l11 11" />
    </Glyph>
  );
}

export function SyncIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={1.6}>
      <path d="M12.75 6.5A5 5 0 0 0 3.6 5.2M3.25 9.5a5 5 0 0 0 9.15 1.3" />
      <path d="M3.4 2.75v2.6H6M12.6 13.25v-2.6H10" />
    </Glyph>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={1.6}>
      <path d="M3 4.25A1.5 1.5 0 0 1 4.5 2.75h7A1.5 1.5 0 0 1 13 4.25v5.5a1.5 1.5 0 0 1-1.5 1.5H7l-3 2.25v-2.25h0A1 1 0 0 1 3 10.25z" />
    </Glyph>
  );
}

export function ShieldCheckIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={1.6}>
      <path d="M8 1.9 3.25 3.75v3.6c0 3 2 5.2 4.75 6.75 2.75-1.55 4.75-3.75 4.75-6.75v-3.6z" />
      <path d="m5.9 8 1.5 1.5 2.75-3" />
    </Glyph>
  );
}

export function RouteIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={1.6}>
      <circle cx="4" cy="12" r="1.75" />
      <circle cx="12" cy="4" r="1.75" />
      <path d="M5.75 12H9a2.25 2.25 0 0 0 0-4.5H7A2.25 2.25 0 0 1 7 3h3.25" />
    </Glyph>
  );
}
