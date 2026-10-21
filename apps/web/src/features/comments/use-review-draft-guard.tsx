import { useRef, useState } from "react";
import { Dialog } from "../../components/Dialog";
import { useDraftNavigationGuard } from "../../lib/draft-navigation";

export function useReviewDraftGuard({ dirty, pending, unconfirmed, discard, draftName = "reply" }: {
  dirty: boolean; pending: boolean; unconfirmed: boolean; discard: () => void; draftName?: string;
}) {
  const [leaveAction, setLeaveAction] = useState<(() => void) | null>(null);
  const approvedNavigation = useRef(false);
  const protect = dirty || pending || unconfirmed;
  useDraftNavigationGuard({ name: draftName, dirty, pending, unconfirmed, discard: () => { setLeaveAction(null); discard(); }, shouldBlock: ({ currentLocation, nextLocation }) => {
    if (approvedNavigation.current) { approvedNavigation.current = false; return false; }
    const contextSearch = (search: string) => {
      const params = new URLSearchParams(search);
      // A reply stays bound to its parent thread while the canvas changes page or
      // size. Background page registration must not interrupt a portal draft.
      for (const key of ["mode", "viewport", "width", "height", "zoom", "browser", "orientation", "page"]) params.delete(key);
      params.sort();
      return params.toString();
    };
    return currentLocation.pathname !== nextLocation.pathname
      || contextSearch(currentLocation.search) !== contextSearch(nextLocation.search) || currentLocation.hash !== nextLocation.hash;
  }});
  function stay(): void { setLeaveAction(null); }
  function leave(): void {
    if (pending) return;
    discard();
    const action = leaveAction;
    setLeaveAction(null);
    approvedNavigation.current = true;
    action?.();
    queueMicrotask(() => { approvedNavigation.current = false; });
  }
  return {
    requestLeave: (action: () => void) => { if (protect) setLeaveAction(() => action); else action(); },
    dialog: leaveAction !== null && <Dialog title={`Keep your ${draftName} draft?`} onClose={stay}>
      <div className="bl-form"><p>{pending ? "Your feedback is being saved or an attachment is uploading. Wait for the result before leaving." : unconfirmed ? "Saving was not confirmed. The original reply may already exist. Stay to retry or copy it; check Backline before posting it again." : `You have unsaved changes to your ${draftName}. Stay to save or copy your draft, or discard it and continue.`}</p></div>
      <footer className="bl-dialog-actions bl-dialog-actions-bordered"><button type="button" className="bl-button" onClick={stay}>Stay and review</button><button type="button" className="bl-button" disabled={pending} onClick={leave}>{dirty || unconfirmed ? "Discard draft and continue" : "Continue"}</button></footer>
    </Dialog>,
  };
}
