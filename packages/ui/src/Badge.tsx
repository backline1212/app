import type { ReactNode } from "react";

import { STATUS_LABELS } from "./workflow";

export type BadgeTone =
  | "layer-client"
  | "layer-team"
  | "status-todo"
  | "status-in-progress"
  | "status-in-review"
  | "status-blocked"
  | "status-resolved"
  | "status-wont-fix"
  | "recovery-low-confidence"
  | "recovery-orphaned";

const toneClasses: Record<BadgeTone, string> = {
  "layer-client": "bg-layer-client/15 text-layer-client",
  "layer-team": "bg-layer-team/15 text-layer-team",
  "status-todo": "bg-status-todo/15 text-status-todo-ink",
  "status-in-progress": "bg-status-in-progress/15 text-status-in-progress-ink",
  "status-in-review": "bg-status-in-review/15 text-status-in-review-ink",
  "status-blocked": "bg-status-blocked/15 text-status-blocked-ink",
  "status-resolved": "bg-status-resolved/15 text-status-resolved-ink",
  "status-wont-fix": "bg-status-wont-fix/15 text-status-wont-fix-ink line-through",
  "recovery-low-confidence": "border border-recovery-low-confidence text-recovery-low-confidence",
  "recovery-orphaned": "border border-recovery-orphaned text-recovery-orphaned",
};

export interface BadgeProps {
  tone: BadgeTone;
  children: ReactNode;
}

export function Badge({ tone, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone = `status-${status.replace(/_/g, "-")}` as BadgeTone;
  const label = STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status;
  return (
    <Badge tone={tone}>
      {status === "todo" && (
        <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      )}
      {status === "in_progress" && (
        <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 2v5l3.5 2L12 9l-3-1.7V3H8z" />
        </svg>
      )}
      {status === "in_review" && (
        <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
          <path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zm.5 3v4.5H5v-1h2.5V5h1z" />
        </svg>
      )}
      {status === "resolved" && (
        <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
          <path d="M13.8 4.2L6 12 2.2 8.2l1.4-1.4 2.4 2.4 6.4-6.4 1.4 1.4z" />
        </svg>
      )}
      {status === "wont_fix" && (
        <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
          <path d="M12.7 4.7L11.3 3.3 8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8l3.3-3.3z" />
        </svg>
      )}
      {label}
    </Badge>
  );
}

// Layer distinction is a hard requirement, not a style preference: color alone fails
// colorblind users, so the lock icon + text label are mandatory alongside color,
// everywhere a layer badge renders (15-Design-System.md §15.3).
export function LayerBadge({ layer }: { layer: "client" | "team" }) {
  if (layer === "team") {
    return (
      <Badge tone="layer-team">
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          width="10"
          height="10"
          fill="currentColor"
        >
          <path d="M4 7V5a4 4 0 1 1 8 0v2h.5A1.5 1.5 0 0 1 14 8.5v5A1.5 1.5 0 0 1 12.5 15h-9A1.5 1.5 0 0 1 2 13.5v-5A1.5 1.5 0 0 1 3.5 7H4Zm1.5 0h5V5a2.5 2.5 0 0 0-5 0v2Z" />
        </svg>
        Team only
      </Badge>
    );
  }
  return (
    <Badge tone="layer-client">
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        width="10"
        height="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M8 3.5c-3 0-5.5 2-7 4.5 1.5 2.5 4 4.5 7 4.5s5.5-2 7-4.5c-1.5-2.5-4-4.5-7-4.5zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
      </svg>
      Client visible
    </Badge>
  );
}

export function RecoveryBadge({ status }: { status: string }) {
  if (status === "ok") return null;
  if (status === "low_confidence") {
    return <Badge tone="recovery-low-confidence">Anchor uncertain</Badge>;
  }
  return <Badge tone="recovery-orphaned">Anchor lost</Badge>;
}
