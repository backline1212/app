import type { CommentOut } from "../board/api";

/** A fix a coding agent reported over MCP (submit_fix): what changed, where to check it,
 * and - on the latest one while the ticket is in review - the person's verdict. */
export function FixCard({ fix, onVerify, onReopen, busy }: { fix: NonNullable<CommentOut["fix"]>; onVerify?: () => void; onReopen?: () => void; busy?: boolean }) {
  return (
    <div className="bl-fix-card">
      <strong>Fix ready for review</strong>
      <div className="bl-chip-row">
        {fix.preview_url && <a className="bl-chip" href={fix.preview_url} target="_blank" rel="noreferrer">Open preview ↗</a>}
        {fix.change_url && <a className="bl-chip" href={fix.change_url} target="_blank" rel="noreferrer">View change ↗</a>}
      </div>
      {(onVerify || onReopen) && (
        <div className="bl-fix-actions">
          {onReopen && <button type="button" className="bl-quiet" disabled={busy} onClick={onReopen}>Reopen</button>}
          {onVerify && <button type="button" className="bl-button" disabled={busy} onClick={onVerify}>Verified – resolve</button>}
        </div>
      )}
    </div>
  );
}
