import type { StatusUpdater } from "./status";

// Longer than any real PATCH should take, short enough that a dashboard which never
// answers (an older build, or no dashboard at all) doesn't leave the card waiting.
const STATUS_REPLY_TIMEOUT_MS = 15_000;

/**
 * Lets the comment card change a comment's status when this widget is running inside
 * the dashboard's canvas iframe (ProjectOverviewPage). The widget itself is always a
 * guest there, and guests never change a status (13-Authentication.md §13.5) - but the
 * team member looking at the canvas can, so the change is handed to the dashboard,
 * which makes it with that member's own session and reports back what was saved.
 *
 * Returns a getter rather than a value: whether the dashboard allows it is only known
 * once it answers the request sent below, which can be after the first card opens.
 * Outside an iframe, or wherever nothing answers, the getter stays null and the card
 * shows the status read-only.
 *
 * Messages go to "*" for the same reason as index.ts's backline:page-registered - this
 * script has no fixed dashboard origin to address. Nothing sent is sensitive, and a
 * page that frames the site and answers in the dashboard's place gains nothing: the
 * status change is only ever made by the dashboard, with a member's own session.
 */
export function connectDashboardStatusBridge(): () => StatusUpdater | null {
  if (window.parent === window) return () => null;

  let allowed = false;
  const pending = new Map<
    string,
    { resolve: (status: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (data?.type === "backline:status-access") {
      allowed = data.canUpdateStatus === true;
      return;
    }
    if (data?.type !== "backline:comment-status-result") return;
    const request = typeof data.requestId === "string" ? pending.get(data.requestId) : undefined;
    if (!request) return;
    pending.delete(data.requestId);
    clearTimeout(request.timer);
    if (data.ok === true && typeof data.status === "string") request.resolve(data.status);
    else request.reject(new Error("The dashboard could not change this comment's status."));
  });
  window.parent.postMessage({ type: "backline:request-status-access" }, "*");

  const updateStatus: StatusUpdater = (commentId, status) =>
    new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("The dashboard did not answer."));
      }, STATUS_REPLY_TIMEOUT_MS);
      pending.set(requestId, { resolve, reject, timer });
      window.parent.postMessage({ type: "backline:update-comment-status", requestId, commentId, status }, "*");
    });

  return () => (allowed ? updateStatus : null);
}
