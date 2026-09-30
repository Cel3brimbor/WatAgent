export function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={open ? "is-open" : ""}>
      <path d="M4.5 6.25 8 9.75l3.5-3.5" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.2 8.3 6.4 11.4 12.8 4.6" />
    </svg>
  );
}

export function DotsIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="3.2" r="1.15" />
      <circle cx="8" cy="8" r="1.15" />
      <circle cx="8" cy="12.8" r="1.15" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 3.25v9.5M3.25 8h9.5" />
    </svg>
  );
}

export function GoogleCalendarIcon({ title = "Google Calendar" }: { title?: string }) {
  return (
    <svg viewBox="0 0 24 24" className="gcal-icon" role="img" aria-label={title}>
      <title>{title}</title>
      <rect x="6.5" y="6.5" width="11" height="11" fill="#fff" />
      <path d="M6.5 3h11v3.5h-11z" fill="#4285f4" />
      <path d="M17.5 6.5H21v11h-3.5z" fill="#4285f4" />
      <path d="M6.5 17.5h11V21h-11z" fill="#34a853" />
      <path d="M3 6.5h3.5v11H3z" fill="#fbbc04" />
      <path d="M3 5.2A2.2 2.2 0 0 1 5.2 3h1.3v3.5H3z" fill="#1967d2" />
      <path d="M17.5 3h1.3A2.2 2.2 0 0 1 21 5.2v1.3h-3.5z" fill="#1967d2" />
      <path d="M3 17.5h3.5V21H5.2A2.2 2.2 0 0 1 3 18.8z" fill="#188038" />
      <path d="M17.5 17.5H21L17.5 21z" fill="#ea4335" />
      <path d="M9.2 9.3h5.6M9.2 12h5.6M9.2 14.7h3.6" stroke="#4285f4" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
