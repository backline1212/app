import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { formatDate } from "../../../lib/date-format";
import { qk } from "../../../lib/query-keys";
import { redactReviewUrl } from "../../../lib/review-page-path";
import { useOnClickOutside } from "../../../lib/use-click-outside";
import * as api from "../api";
import { ChevronIcon } from "../panel/icons";

interface VersionMenuProps {
  projectId: string;
  currentPageId: string | null;
  onSelectPage: (pageId: string) => void;
}

export function VersionMenu({ projectId, currentPageId, onSelectPage }: VersionMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useOnClickOutside(ref, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const revisions = useQuery({
    queryKey: qk.projectRevisions(projectId),
    queryFn: ({ signal }) => api.listRevisions(projectId, signal),
    enabled: open,
  });
  const currentPageRevisions = (revisions.data ?? []).filter((item) => item.page_id === currentPageId);

  return (
    <div className="bl-review-popover-anchor" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="bl-review-control"
      >
        <span>{currentPageRevisions.length ? `${currentPageRevisions.length} versions` : "Version history"}</span>
        <ChevronIcon width={11} height={11} className={open ? "rotate-180" : ""} />
      </button>
      {open && (
        <div role="menu" className="bl-review-popover bl-version-popover">
          <header>
            <strong>Captured versions</strong>
            <p>A version is saved whenever the page changes during review.</p>
          </header>
          {revisions.isLoading && (
            <div className="bl-version-loading" role="status">
              <i aria-hidden="true" />
              <span>Loading version history…</span>
            </div>
          )}
          {revisions.error && (
            <div className="bl-review-inline-error" role="alert">
              <span>{revisions.error.message}</span>
              <button type="button" onClick={() => void revisions.refetch()}>Try again</button>
            </div>
          )}
          {!revisions.isLoading && !revisions.error && (revisions.data ?? []).length === 0 && (
            <div className="bl-version-empty">
              <strong>No captured versions yet</strong>
              <span>A version appears after the snapshot pipeline detects a meaningful page change.</span>
            </div>
          )}
          {revisions.data && revisions.data.length > 0 && (
            <ol className="bl-version-list">
              {revisions.data.map((revision) => {
                const changed = revision.changes.moved + revision.changes.modified + revision.changes.removed + revision.changes.added;
                const recoveryIssues = revision.recovery.low_confidence + revision.recovery.orphaned + revision.recovery.permanently_orphaned;
                return (
                  <li key={revision.id}>
                    <button
                      type="button"
                      role="menuitem"
                      aria-current={revision.is_current ? "true" : undefined}
                      className={revision.page_id === currentPageId ? "is-page-current" : ""}
                      onClick={() => {
                        onSelectPage(revision.page_id);
                        setOpen(false);
                      }}
                    >
                      <span className="bl-version-heading">
                        <strong>{revision.page_title || redactReviewUrl(revision.page_url)}</strong>
                        {revision.is_current && <em>Current</em>}
                      </span>
                      <time>{formatDate(revision.captured_at, { dateStyle: "medium", timeStyle: "short" })}</time>
                      <span>{changed} DOM changes · {recoveryIssues ? `${recoveryIssues} anchors need attention` : `${revision.recovery.ok} anchors recovered`}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          <footer>
            <span className="bl-review-unavailable-dot" aria-hidden="true" />
            Connect Deploy sync to label versions with your releases.
          </footer>
        </div>
      )}
    </div>
  );
}
