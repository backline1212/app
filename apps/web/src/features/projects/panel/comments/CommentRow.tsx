import { Avatar, LayerBadge, RecoveryBadge } from "@backline/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import * as boardApi from "../../../board/api";
import type { CommentOut, CommentStatus } from "../../../board/api";
import { ConfirmDialog } from "../../../../components/ConfirmDialog";
import { useToast } from "../../../../components/Toast";
import { qk } from "../../../../lib/query-keys";
import { upsertProjectComment } from "../../../../lib/comment-cache";
import { useFloatingPosition } from "../../../../lib/use-floating-position";
import { useOnClickOutside } from "../../../../lib/use-click-outside";
import { renderWithMentions } from "../../../../lib/mentions";
import { ticketRef } from "../../../../lib/ticket-ref";
import { timeAgo } from "../../../../lib/time";
import { isClosed } from "../../../../lib/workflow";
import type { MemberOut } from "../../../workspaces/api";
import { MonitorIcon } from "../icons";
import { PRIORITY_META, STATUS_META, STATUS_ORDER, commentDeviceType, dueMeta } from "./types";

export interface CommentRowProps {
  comment: CommentOut;
  projectId: string;
  replyCount: number;
  members: MemberOut[];
  onNavigate: (commentId: string) => void;
  onOpenThread: (commentId: string) => void;
  selected?: boolean;
  /** The list's "Compact" display: the text clamped to two lines, no screenshot or
   * attachment row, tighter spacing. */
  compact?: boolean;
}

function memberName(members: MemberOut[], userId: string): string {
  const member = members.find((m) => m.user_id === userId);
  return member?.name || member?.email || "Former member";
}

export function CommentRow({
  comment,
  projectId,
  replyCount,
  members,
  onNavigate,
  onOpenThread,
  selected = false,
  compact = false,
}: CommentRowProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Portaled to <body> (see the render below) so it can escape the review drawer's
  // own overflow-y:auto - a plain absolutely-positioned child gets clipped for any
  // row that isn't near the bottom of the drawer's visible scroll area.
  const popoverPos = useFloatingPosition(triggerRef, popoverRef, showMenu);
  useOnClickOutside([menuRef, popoverRef], () => setShowMenu(false));

  useEffect(() => {
    if (!showMenu) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Captured and stopped here, ahead of the review drawer's own Escape (which would
      // close the whole panel): Escape only closes this menu.
      event.stopPropagation();
      setShowMenu(false);
      triggerRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [showMenu]);

  // Merged into the cached list straight away, like the detail's edits, rather than
  // refetching every comment in the project for one changed status.
  const statusMutation = useMutation({
    mutationFn: (status: CommentStatus) => boardApi.updateComment(comment.id, { status }),
    onSuccess: (updated) => upsertProjectComment(queryClient, projectId, updated),
    onError: () => toast("Couldn't change that comment's status. Try again.", "error"),
  });

  const deleteThreadMutation = useMutation({
    mutationFn: () => boardApi.deleteThread(comment.id),
    onSuccess: () => {
      setConfirmDelete(false);
      queryClient.setQueryData<CommentOut[]>(qk.projectComments(projectId), (old) =>
        old ? old.filter((c) => c.id !== comment.id && c.parent_id !== comment.id) : old,
      );
      void queryClient.invalidateQueries({ queryKey: qk.projectPages(projectId) });
      toast(`Deleted ${ticketRef(comment)}`, "success");
    },
    onError: () => {
      setConfirmDelete(false);
      toast("Couldn't delete that thread. Try again.", "error");
    },
  });

  // A comment selected from its pin in the canvas (not from this list) can be scrolled
  // out of view in the drawer - bring it in. "nearest" is a no-op when the row is
  // already visible, which a row that was just clicked here always is.
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  const meta = STATUS_META[comment.status];
  const priority = comment.priority ? PRIORITY_META[comment.priority] : null;
  const due = dueMeta(comment.due_at, isClosed(comment.status));
  const assigneeIds = comment.assignee_ids?.length
    ? comment.assignee_ids
    : comment.assignee_id
      ? [comment.assignee_id]
      : [];
  const deviceType = commentDeviceType(comment);
  const orphaned = comment.recovery_status !== "ok";
  const resolved = comment.status === "resolved";

  return (
    <div
      ref={rowRef}
      onClick={() => onNavigate(comment.id)}
      role="button"
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      aria-label={`${ticketRef(comment)} by ${comment.author_name}: ${comment.body.slice(0, 80)}`}
      onKeyDown={(event) => {
        // Only the row's own key presses: Enter/Space on a button inside it (resolve,
        // the options menu - portaled, but still a React child of this row) belong to
        // that button, and preventing them here stopped those buttons working from the
        // keyboard at all.
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onNavigate(comment.id);
        }
      }}
      title={
        orphaned
          ? "This comment's position on the page could not be confirmed after a page change"
          : "Open this comment"
      }
      className={`bl-comment-row ${selected ? "is-selected" : ""} ${orphaned ? "bl-comment-orphaned" : ""} ${compact ? "is-compact" : ""} ${isClosed(comment.status) ? "is-closed" : ""}`}
    >
      <div className="bl-comment-head">
        <span className="bl-comment-badge" title={meta.label}>
          {ticketRef(comment)}
        </span>
        <Avatar name={comment.author_name} size={compact ? 20 : 24} />
        <div className="bl-comment-person">
          <span className="bl-comment-who">{comment.author_name}</span>
          <span className="bl-comment-when">{timeAgo(comment.created_at)}</span>
        </div>
        <div className="bl-comment-actions">
          {deviceType && (
            <span style={{ color: "var(--ink-4)" }} title={`Captured on ${deviceType}`}>
              <MonitorIcon width={13} height={13} />
            </span>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              statusMutation.mutate(resolved ? "todo" : "resolved");
            }}
            disabled={statusMutation.isPending}
            aria-pressed={resolved}
            aria-label={resolved ? "Reopen this comment" : "Mark as resolved"}
            title={resolved ? "Resolved — click to reopen" : "Mark as resolved"}
            className={`bl-comment-resolve ${resolved ? "is-resolved" : ""}`}
          >
            <svg viewBox="0 0 16 16" width="10" height="10" fill="none" aria-hidden="true">
              <path
                d="M3 8.5 6.5 12 13 4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="bl-comment-popover-anchor" ref={menuRef} onClick={(event) => event.stopPropagation()}>
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setShowMenu((prev) => !prev)}
              aria-label="Comment options"
              aria-haspopup="menu"
              aria-expanded={showMenu}
              className="bl-icon"
              style={{ width: 24, height: 24, fontSize: 14 }}
            >
              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
                <circle cx="3" cy="8" r="1.3" />
                <circle cx="8" cy="8" r="1.3" />
                <circle cx="13" cy="8" r="1.3" />
              </svg>
            </button>
            {showMenu && createPortal(
              <div
                ref={popoverRef}
                className="bl-comment-popover bl-comment-menu"
                role="menu"
                aria-label="Comment options"
                style={{
                  position: "fixed",
                  top: popoverPos?.top ?? -9999,
                  left: popoverPos?.left ?? -9999,
                  visibility: popoverPos ? "visible" : "hidden",
                }}
              >
                <div className="bl-review-popover-label">Move to</div>
                {STATUS_ORDER.map((status) => (
                  <button
                    key={status}
                    type="button"
                    role="menuitemradio"
                    aria-checked={status === comment.status}
                    onClick={() => {
                      setShowMenu(false);
                      triggerRef.current?.focus();
                      if (status !== comment.status) statusMutation.mutate(status);
                    }}
                    className="bl-review-menu-row"
                  >
                    <span className="bl-cd-opt">
                      <span className="bl-status-dot" style={{ background: STATUS_META[status].color }} />
                      {STATUS_META[status].label}
                    </span>
                  </button>
                ))}
                <div style={{ borderTop: "1px solid var(--line-soft)", margin: "4px 0" }} />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowMenu(false);
                    setConfirmDelete(true);
                  }}
                  className="bl-review-menu-row"
                  style={{ color: "var(--bl-error)" }}
                >
                  Delete thread…
                </button>
              </div>,
              document.body
            )}
          </div>
        </div>
      </div>

      <p className="bl-comment-body">{renderWithMentions(comment.body)}</p>

      {!compact && (comment.screenshot_url ? (
        <a
          href={comment.screenshot_url}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="bl-comment-shot-link"
        >
          <img src={comment.screenshot_url} alt="Captured review context" className="bl-comment-shot" />
        </a>
      ) : comment.capture_status === "failed" ? (
        <span className="bl-comment-shot-failed">Screenshot capture failed</span>
      ) : null)}

      {!compact && comment.attachments.length > 0 && (
        <div className="bl-chip-row">
          {comment.attachments.map((attachment) => (
            <a
              key={attachment.url}
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="bl-chip"
              title={attachment.filename}
            >
              {attachment.filename}
            </a>
          ))}
        </div>
      )}

      <div className="bl-comment-foot">
        <span className="bl-status-pill">
          <span className="bl-status-dot" style={{ background: meta.color }} />
          {meta.label}
        </span>
        {priority && (
          <span className="bl-status-pill" title="Priority">
            <span className="bl-status-dot" style={{ background: priority.color }} />
            {priority.label}
          </span>
        )}
        {due && (
          <span className={`bl-due-chip ${due.tone === "late" ? "is-late" : due.tone === "soon" ? "is-soon" : ""}`}>
            {due.text}
          </span>
        )}
        <LayerBadge layer={comment.layer} />
        {orphaned && <RecoveryBadge status={comment.recovery_status} />}
        {!compact &&
          comment.tags?.map((tag) => (
            <span key={tag} className="bl-chip">
              {tag}
            </span>
          ))}
        {assigneeIds.length > 0 && (
          <span
            className="flex items-center"
            title={`Assigned to ${assigneeIds.map((id) => memberName(members, id)).join(", ")}`}
          >
            {assigneeIds.slice(0, 3).map((id, index) => (
              <span key={id} style={{ marginLeft: index === 0 ? 0 : -6, display: "flex" }}>
                <Avatar name={memberName(members, id)} size={20} />
              </span>
            ))}
          </span>
        )}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenThread(comment.id);
          }}
          className="bl-comment-reply-count"
          title={replyCount > 0 ? `${replyCount} ${replyCount === 1 ? "reply" : "replies"} — open the thread` : "Reply"}
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21 11.5a8.4 8.4 0 01-9 8.4L3 21l1.1-8.9A8.4 8.4 0 1121 11.5z" />
          </svg>
          {replyCount > 0 ? replyCount : "Reply"}
        </button>
      </div>

      {confirmDelete && createPortal(
        // Portaled out of the row's DOM, but React still bubbles its events through the
        // row: stop them here, or a click in the dialog opens this comment underneath.
        <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <ConfirmDialog
            title={`Delete ${ticketRef(comment)}?`}
            message={
              replyCount > 0
                ? `This deletes the comment and its ${replyCount} ${replyCount === 1 ? "reply" : "replies"} for everyone, including the client.`
                : "This deletes the comment for everyone, including the client."
            }
            confirmLabel="Delete thread"
            destructive
            pending={deleteThreadMutation.isPending}
            onConfirm={() => deleteThreadMutation.mutate()}
            onCancel={() => setConfirmDelete(false)}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}
