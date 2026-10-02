// Shared stroke icons for components outside the bl-* panel/sidebar icon sets
// (features/projects/panel/icons.tsx, app/layout/sidebar-icons.tsx) - same
// hand-drawn convention, so raw emoji/glyph icons (FD-AUD FE-08) can be replaced
// consistently regardless of which CSS dialect (bl-* vs Tailwind) a component uses.
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

export function BellIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z" />
      <path d="M9.5 18.5a2.5 2.5 0 0 0 5 0" />
    </Icon>
  );
}

export function PaperclipIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M16.5 6.5 8.8 14.2a3 3 0 0 0 4.2 4.2l7.1-7.1a5 5 0 0 0-7.1-7.1L5.6 11.5a7 7 0 0 0 9.9 9.9" />
    </Icon>
  );
}

export function GearIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.9-1.5-2-3.4-2.3.7a7.7 7.7 0 0 0-2.6-1.5L14 2.2h-4l-.4 2.6a7.7 7.7 0 0 0-2.6 1.5l-2.3-.7-2 3.4L4.6 10.5a7.6 7.6 0 0 0 0 3L2.7 15l2 3.4 2.3-.7c.75.66 1.63 1.17 2.6 1.5l.4 2.6h4l.4-2.6a7.7 7.7 0 0 0 2.6-1.5l2.3.7 2-3.4-1.9-1.5Z" />
    </Icon>
  );
}

export function CommentBubbleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z" />
    </Icon>
  );
}

export function FolderIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3.5 6.5h6l2 2.5h9v9.5h-17Z" strokeLinejoin="round" />
    </Icon>
  );
}

export function BuildingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 20V6.5L12 3l8 3.5V20" />
      <path d="M9 20v-5.5h6V20M9 9h.01M15 9h.01M9 12.5h.01M15 12.5h.01" />
    </Icon>
  );
}

export function LinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M11 6.5 13 4.6a3.6 3.6 0 0 1 5 5L16.1 11.6" />
      <path d="M13 17.4 11 19.4a3.6 3.6 0 0 1-5-5l1.9-1.9" />
    </Icon>
  );
}

export function PersonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c0-4.1 3.4-7.5 7.5-7.5s7.5 3.4 7.5 7.5" />
    </Icon>
  );
}

export function BoltIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M13 3 5 13.5h5.5L11 21l8-10.5h-5.5Z" strokeLinejoin="round" />
    </Icon>
  );
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4.5 4.5" />
    </Icon>
  );
}

export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

/** A private project (TDR-0056). Decorative by default; pass aria-label to announce it. */
export function LockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon width="12" height="12" strokeWidth="2" {...props}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Icon>
  );
}
