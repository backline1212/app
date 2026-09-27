// Small hand-drawn stroke icons for the workspace sidebar, matching the convention
// already established in features/projects/panel/icons.tsx - no icon library
// dependency for a fixed, small icon set.
import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function RecentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </Icon>
  );
}

export function WebsiteIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.2 2 3.5 5.6 3.5 9s-1.3 7-3.5 9c-2.2-2-3.5-5.6-3.5-9s1.3-7 3.5-9Z" />
    </Icon>
  );
}

export function WebAppIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M3 9h18" />
    </Icon>
  );
}

export function MobileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="7" y="2.5" width="10" height="19" rx="1.8" />
      <path d="M11 18.5h2" />
    </Icon>
  );
}

export function ImagePdfIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <circle cx="9" cy="10" r="1.7" />
      <path d="m4.5 18 5-5.5 3 3 3.5-4.5 4.5 7" />
    </Icon>
  );
}

export function UsageIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 18V9M9 18V4M15 18v-7M21 18v-3" />
    </Icon>
  );
}

export function McpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="9" width="7" height="7" rx="1.5" />
      <rect x="14" y="4" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <path d="M10 12.5h4M17.5 11v3" />
    </Icon>
  );
}

export function MembersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17.5" cy="9" r="2.3" />
      <path d="M21 20c0-2.5-1.7-4.6-4-5.3" />
    </Icon>
  );
}

export function BillingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="1.8" />
      <path d="M2.5 10h19" />
    </Icon>
  );
}

export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.9-1.5-2-3.4-2.3.7a7.7 7.7 0 0 0-2.6-1.5L14 2.2h-4l-.4 2.6a7.7 7.7 0 0 0-2.6 1.5l-2.3-.7-2 3.4L4.6 10.5a7.6 7.6 0 0 0 0 3L2.7 15l2 3.4 2.3-.7c.75.66 1.63 1.17 2.6 1.5l.4 2.6h4l.4-2.6a7.7 7.7 0 0 0 2.6-1.5l2.3.7 2-3.4-1.9-1.5Z" />
    </Icon>
  );
}

export function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </Icon>
  );
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  );
}

export function ProjectsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon strokeWidth="1.8" width="15" height="15" {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Icon>
  );
}

export function AssignedToMeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon strokeWidth="1.8" width="15" height="15" {...props}>
      <path d="M21 11.5a8.4 8.4 0 01-9 8.4L3 21l1.1-8.9A8.4 8.4 0 1121 11.5z" />
    </Icon>
  );
}

export function TicketsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon strokeWidth="1.8" width="15" height="15" {...props}>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </Icon>
  );
}

export function ActivityClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon strokeWidth="1.8" width="15" height="15" {...props}>
      <path d="M12 8v4l3 2" />
      <circle cx="12" cy="12" r="9" />
    </Icon>
  );
}

export function ClientsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon strokeWidth="1.8" width="15" height="15" {...props}>
      <path d="M17 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9.5" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 00-3-3.9" />
    </Icon>
  );
}

// The design's workspace switcher affordance: an up/down chevron pair.
export function SwitchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon strokeWidth="2" width="14" height="14" {...props}>
      <path d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
    </Icon>
  );
}
