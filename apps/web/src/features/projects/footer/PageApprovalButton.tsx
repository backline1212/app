import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { Schemas } from "@backline/types";
import { Dialog } from "../../../components/Dialog";
import { qk } from "../../../lib/query-keys";
import { projectCan } from "../../../lib/project-roles";
import { formatDate } from "../../../lib/date-format";
import * as api from "../api";
import { CheckCircleIcon } from "../panel/icons";

export function PageApprovalButton({ project, pageId, unresolvedCount }: {
  project: api.ProjectOut; pageId: string | null; unresolvedCount: number | null;
}) {
  const cache = useQueryClient();
  const busy = useRef(false);
  const [open, setOpen] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [candidate, setCandidate] = useState<Schemas["PageApprovalOut"] | null>(null);
  const approval = useQuery({ queryKey: qk.pageApproval(pageId ?? ""), queryFn: () => api.getPageApproval(pageId!), enabled: Boolean(pageId), refetchInterval: 30000 });
  const save = useMutation({
    mutationFn: async () => {
      if (busy.current || !candidate || !pageId) throw new Error("Load the page approval before saving.");
      busy.current = true;
      return api.updatePageApproval(pageId, { approved: !candidate.approved, revision_id: candidate.latest_revision_id, expected_updated_at: candidate.updated_at });
    },
    onSuccess: async result => {
      cache.setQueryData(qk.pageApproval(result.page_id), result);
      await cache.invalidateQueries({ queryKey: qk.activity(project.workspace_id) });
      setOpen(false);
    },
    onError: () => { setCandidate(null); setReviewed(false); void approval.refetch(); },
    onSettled: () => { busy.current = false; },
  });
  const canEdit = projectCan(project, "edit") && !project.archived_at;
  const loadCandidate = () => { save.reset(); setReviewed(false); setCandidate(approval.data ?? null); setOpen(true); };
  return <>
    <button type="button" className="bl-review-control bl-review-optional-control" disabled={!pageId} onClick={loadCandidate}>
      <CheckCircleIcon width={13} height={13} /><span>{approval.data?.approved ? "Approved" : approval.data?.stale ? "Review again" : "Approve"}</span>
    </button>
    {open && <Dialog title="Page approval" onClose={() => { if (!busy.current) setOpen(false); }}>
      <div className="bl-file-manager">
        <p>Approval records a team decision for one captured page version. It does not close tickets or prevent more feedback.</p>
        {approval.isLoading && <p role="status">Loading approval…</p>}
        {approval.error && <p role="alert" className="bl-error">{approval.error.message}</p>}
        {save.error && <p role="alert" className="bl-error">{save.error.message}</p>}
        {!candidate && approval.data && <button type="button" className="bl-button" onClick={() => { setCandidate(approval.data!); setReviewed(false); }}>Review current approval</button>}
        {candidate && <>
          <p><strong>{candidate.approved ? "This captured version is approved." : candidate.stale ? "The page has a newer captured version. Review it again." : "This page has not been approved for its current captured version."}</strong></p>
          {candidate.updated_at && <p>{candidate.updated_by_name ?? "Team member"} · {formatDate(candidate.updated_at, { dateStyle: "medium", timeStyle: "short" })}</p>}
          {candidate.latest_revision_id ? <p className="bl-mono">Current version: {candidate.latest_revision_id.slice(-8)}</p> : <p>Open website review to capture a page version first. An uncaptured live page cannot be approved.</p>}
          <p>{unresolvedCount === null ? "The current unresolved-comment count is unavailable. Check saved feedback before approving." : `${unresolvedCount} unresolved comment${unresolvedCount === 1 ? "" : "s"} on this page.`}</p>
          {canEdit && <label className="bl-setting-row"><input type="checkbox" checked={reviewed} disabled={save.isPending} onChange={event => setReviewed(event.target.checked)} /><span>{candidate.approved ? "Reopen this page for team review." : "I have reviewed this page and its saved feedback."}</span></label>}
        </>}
        {!canEdit && <p>Editors and managers can approve or reopen pages.</p>}
      </div>
      <footer className="bl-dialog-actions bl-dialog-actions-bordered"><button type="button" className="bl-quiet" disabled={save.isPending} onClick={() => setOpen(false)}>Close</button>
        {canEdit && <button type="button" className="bl-button mint" disabled={save.isPending || !candidate || !reviewed || (!candidate.approved && !candidate.latest_revision_id)} onClick={() => { if (!busy.current) save.mutate(); }}>{save.isPending ? "Saving…" : candidate?.approved ? "Reopen page" : "Approve captured version"}</button>}
      </footer>
    </Dialog>}
  </>;
}
