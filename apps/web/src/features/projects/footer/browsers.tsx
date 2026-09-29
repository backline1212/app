// Kept apart from BrowserMenu.tsx so that file exports only its component (React Fast
// Refresh cannot hot-swap a module that also exports data).
export interface BrowserOption {
  name: string;
  version: string;
  icon: JSX.Element;
}

export const BROWSERS: BrowserOption[] = [
  {
    name: "Chrome",
    version: "v125",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="4" />
        <line x1="21.17" y1="8" x2="12" y2="8" />
        <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
        <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
      </svg>
    ),
  },
  {
    name: "Safari",
    version: "v17.4",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
      </svg>
    ),
  },
  {
    name: "Firefox",
    version: "v126",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 9.22 13.84c-1.35 1.54-3.3 2.5-5.4 2.16-2.58-.4-4.24-2.82-3.8-5.32.32-1.76 1.4-3.23 2.92-4C13.62 7 12.04 6.54 11 6.54a4.15 4.15 0 0 0-4 4.54c.26 1.95 1.6 3.55 3.32 4.14-1.3-.2-2.38-.85-3.04-1.84a10.02 10.02 0 0 1-.9-8.47 9.94 9.94 0 0 1 9.4-6.42A9.97 9.97 0 0 1 21 7.24a10.05 10.05 0 0 0-9 5.24" />
      </svg>
    ),
  },
  {
    name: "Edge",
    version: "v124",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
        <path d="M12 22A10 10 0 0 1 2 12a10 10 0 0 1 10-10c2.58 0 4.96.96 6.8 2.57L12 12l5.5 8.16A9.96 9.96 0 0 1 12 22z" opacity=".2" />
      </svg>
    ),
  },
];
