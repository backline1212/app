import { StatusBadge } from "@backline/ui";
import type { CSSProperties } from "react";

import { redactReviewUrl } from "../../lib/review-page-path";
import { ticketRef } from "../../lib/ticket-ref";
import { timeAgo } from "../../lib/time";
import type { CommentOut } from "../board/api";
import type { PageOut } from "./api";

/**
 * Plan B for the canvas (TDR-0197): every thread on the screenshot it was posted with,
 * and a marker where its pin or drawn area was. Used when the live preview can't load
 * the site (bot protection, sign-in, frame refusal) - comments made with the extension
 * are then still visible in Backline - and on request from the canvas bar.
 */
export function ScreenshotBoard({
  comments,
  pages,
  activePageId,
  selectedId,
  onOpen,
}: {
  comments: CommentOut[];
  pages: PageOut[];
  activePageId: string | null;
  selectedId: string | null;
  onOpen: (comment: CommentOut) => void;
}) {
  const threads = comments
    .filter((comment) => !comment.parent_id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const onPage = activePageId ? threads.filter((comment) => comment.page_id === activePageId) : [];
  const shown = onPage.length > 0 ? onPage : threads;
  const groups = new Map<string, CommentOut[]>();
  for (const thread of shown) groups.set(thread.page_id, [...(groups.get(thread.page_id) ?? []), thread]);
  const pageName = (pageId: string): string => {
    const page = pages.find((p) => p.id === pageId);
    return page ? page.title?.trim() || redactReviewUrl(page.url_normalized) : "Other feedback";
  };

  if (threads.length === 0) {
    return (
      <div className="bl-shotboard-empty">
        <strong>No feedback yet</strong>
        <p>Comments left with Open with extension or the review link show up here on their screenshots.</p>
      </div>
    );
  }

  return (
    <div className="bl-shotboard">
      {[...groups.entries()].map(([pageId, items]) => (
        <section key={pageId} aria-label={pageName(pageId)}>
          {groups.size > 1 || onPage.length === 0 ? <h3>{pageName(pageId)} <span>{items.length}</span></h3> : null}
          <div className="bl-shotboard-grid">
            {items.map((comment) => {
              const marker = comment.screenshot_marker;
              const markerStyle = marker ? ({
                left: `${marker.x * 100}%`,
                top: `${marker.y * 100}%`,
                ...(marker.w != null && marker.h != null ? { width: `${marker.w * 100}%`, height: `${marker.h * 100}%` } : {}),
              } as CSSProperties) : undefined;
              return (
                <button
                  key={comment.id}
                  type="button"
                  className={`bl-shot-card${comment.id === selectedId ? " is-selected" : ""}`}
                  onClick={() => onOpen(comment)}
                  aria-label={`Open ${ticketRef(comment)}: ${comment.body.slice(0, 80)}`}
                >
                  <span className="bl-shot-frame">
                    {comment.screenshot_url ? (
                      <>
                        <img src={comment.screenshot_url} alt="" loading="lazy" decoding="async" />
                        {marker && (marker.w != null && marker.h != null
                          ? <span className="bl-shot-area" style={markerStyle} aria-hidden="true" />
                          : <span className="bl-shot-pin" style={markerStyle} aria-hidden="true">{comment.ticket_number ?? "•"}</span>)}
                      </>
                    ) : (
                      <span className="bl-shot-none">{comment.capture_status === "skipped" ? "Posted without a screenshot" : "No screenshot"}</span>
                    )}
                  </span>
                  <span className="bl-shot-meta">
                    <span className="bl-shot-head"><b>{ticketRef(comment)}</b><StatusBadge status={comment.status} /></span>
                    <span className="bl-shot-body">{comment.body}</span>
                    <span className="bl-shot-by">{comment.author_name} · {timeAgo(comment.created_at)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
