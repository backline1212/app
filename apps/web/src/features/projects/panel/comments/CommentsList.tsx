import type { CommentOut } from "../../../board/api";
import type { PageOut } from "../../../pages/api";
import { CommentRow } from "./CommentRow";
import type { MemberOut } from "../../../workspaces/api";

export interface CommentsListProps {
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  allThreads: CommentOut[];
  filteredThreads: CommentOut[];
  sortedThreads: CommentOut[];
  displayMode: "comfortable" | "compact";
  groupBy: "none" | "page";
  projectId: string;
  pages: PageOut[];
  members: MemberOut[];
  replyCountByCommentId: Map<string, number>;
  onNavigate: (commentId: string) => void;
  onOpenThread: (commentId: string) => void;
  selectedCommentId?: string | null;
}

function pageLabel(pages: PageOut[], pageId: string): string {
  const page = pages.find((p) => p.id === pageId);
  return page?.title || page?.url_normalized || "Untitled page";
}

export function CommentsList({
  isLoading,
  isError,
  onRetry,
  allThreads,
  filteredThreads,
  sortedThreads,
  displayMode,
  groupBy,
  projectId,
  pages,
  members,
  replyCountByCommentId,
  onNavigate,
  onOpenThread,
  selectedCommentId,
}: CommentsListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" role="status" aria-label="Loading comments">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bl-skeleton" style={{ height: 84, borderRadius: 3 }} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bl-review-inline-error" role="alert">
        <span>Comments could not load.</span>
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  if (allThreads.length === 0) {
    return (
      <div className="bl-state-panel">
        <h3>No comments yet</h3>
        <p>Comments left on this project will show up here.</p>
      </div>
    );
  }

  if (filteredThreads.length === 0) {
    return (
      <div className="bl-state-panel">
        <h3>No comments match</h3>
        <p>Nothing matches the current filters. Clear them to see every comment.</p>
      </div>
    );
  }

  function renderRow(comment: CommentOut) {
    return (
      <CommentRow
        key={comment.id}
        comment={comment}
        projectId={projectId}
        replyCount={replyCountByCommentId.get(comment.id) ?? 0}
        members={members}
        onNavigate={onNavigate}
        onOpenThread={onOpenThread}
        selected={comment.id === selectedCommentId}
      />
    );
  }

  if (groupBy === "none") {
    return <div className={`flex flex-col ${displayMode === "compact" ? "gap-1" : "gap-2"}`}>{sortedThreads.map(renderRow)}</div>;
  }

  const groups = new Map<string, CommentOut[]>();
  for (const comment of sortedThreads) {
    const list = groups.get(comment.page_id) ?? [];
    list.push(comment);
    groups.set(comment.page_id, list);
  }

  return (
    <div className="flex flex-col">
      {Array.from(groups.entries()).map(([pageId, comments]) => (
        <div key={pageId} className="mb-4">
          <h3 className="bl-group-title">
            {pageLabel(pages, pageId)}
            <span>{comments.length}</span>
          </h3>
          <div className={`flex flex-col ${displayMode === "compact" ? "gap-1" : "gap-2"}`}>{comments.map(renderRow)}</div>
        </div>
      ))}
    </div>
  );
}
