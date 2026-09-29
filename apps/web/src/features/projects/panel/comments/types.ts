import type { CommentOut, CommentStatus } from "../../../board/api";
import { STATUS_COLORS, STATUS_LABELS, TAGS, WORKFLOW_STATUSES } from "../../../../lib/workflow";

export type LayerFilter = "all" | "client" | "team";
export type SortOrder = "newest" | "oldest";
export type CommentPriority = NonNullable<CommentOut["priority"]>;

// Single source of truth is @backline/ui's workflow module (FE-05) - re-exported
// under the names this feature's components already import, so status label/color
// no longer drifts from the shared board/tickets/widget copy.
export const STATUS_ORDER: CommentStatus[] = WORKFLOW_STATUSES;

export interface StatusMeta {
  label: string;
  color: string;
}

export const STATUS_META: Record<CommentStatus, StatusMeta> = WORKFLOW_STATUSES.reduce(
  (meta, status) => {
    meta[status] = { label: STATUS_LABELS[status], color: STATUS_COLORS[status] };
    return meta;
  },
  {} as Record<CommentStatus, StatusMeta>,
);

export const COMMENT_TAGS = TAGS;

export const PRIORITY_ORDER: CommentPriority[] = ["high", "medium", "low"];

export const PRIORITY_META: Record<CommentPriority, StatusMeta> = {
  high: { label: "High", color: "#C2542E" },
  medium: { label: "Medium", color: "#E8B833" },
  low: { label: "Low", color: "#9A9D99" },
};

export interface DueMeta {
  text: string;
  tone: "" | "late" | "soon" | "ok";
}

// Mirrors the reference's dueLabel(): overdue/today/tomorrow read as plain language,
// everything else as a short date; a closed comment's date reads as "Done" rather
// than a stale countdown.
//
// A due date is a calendar day, stored as midnight UTC (DatePicker), so its day is
// read in UTC - read in local time it's the day before for anyone west of Greenwich,
// and "Due today" here disagreed with the date the detail printed beside it.
export function dueMeta(dueAt: string | null | undefined, closed: boolean): DueMeta | null {
  if (!dueAt) return null;
  if (closed) return { text: "Done", tone: "ok" };
  const due = new Date(dueAt);
  const now = new Date();
  const startOfDue = new Date(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86_400_000);
  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, tone: "late" };
  if (diffDays === 0) return { text: "Due today", tone: "soon" };
  if (diffDays === 1) return { text: "Due tomorrow", tone: "soon" };
  return { text: `Due ${startOfDue.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`, tone: "" };
}

export function commentDeviceType(comment: CommentOut): string | undefined {
  return (comment.context as { device_type?: string }).device_type;
}

export function commentBrowser(comment: CommentOut): string | undefined {
  return (comment.context as { browser?: string }).browser;
}

export const DEVICE_TYPE_LABELS: Record<string, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
};
