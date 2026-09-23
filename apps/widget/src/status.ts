// FE-05: hand-kept copy of @backline/ui's WORKFLOW_STATUSES/STATUS_LABELS/STATUS_COLORS
// (packages/ui/src/workflow.ts) - the widget deliberately never depends on any
// @backline/* package (bundle-size/isolation boundary, same reasoning as this package's
// own types.ts). Keep these in sync with that file by hand if either changes.
export const WORKFLOW_STATUSES = ["todo", "in_progress", "in_review", "blocked", "resolved", "wont_fix"];

export const STATUS_LABELS: Record<string, string> = {
  todo: "Not started",
  in_progress: "In progress",
  in_review: "In review",
  blocked: "Blocked",
  resolved: "Resolved",
  wont_fix: "Won't fix",
};

export const STATUS_COLORS: Record<string, string> = {
  todo: "#94A3B8",
  in_progress: "#F59E0B",
  in_review: "#396586",
  blocked: "#A33D1F",
  resolved: "#22C55E",
  wont_fix: "#64748B",
};

/**
 * Changes one comment's status and resolves with the status the server actually saved.
 * The guest widget can't do this itself - guests never change a status (13-Authentication.md
 * §13.5) - so where it's offered at all, it goes through someone who can: the dashboard
 * around the canvas iframe (dashboard-bridge.ts), or the extension's member token.
 */
export type StatusUpdater = (commentId: string, status: string) => Promise<string>;
