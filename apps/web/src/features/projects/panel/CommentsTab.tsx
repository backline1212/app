import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import * as boardApi from "../../board/api";
import type { CommentOut, CommentStatus } from "../../board/api";
import { qk } from "../../../lib/query-keys";
import * as pagesApi from "../../pages/api";
import * as workspacesApi from "../../workspaces/api";
import { CommentDetail } from "./comments/CommentDetail";
import { CommentsList } from "./comments/CommentsList";
import { FilterSortBar } from "./comments/FilterSortBar";
import { StatusChips } from "./comments/StatusChips";
import { commentBrowser, commentDeviceType } from "./comments/types";
import { ViewOptionsBar } from "./comments/ViewOptionsBar";
import { useCommentFilters } from "./comments/useCommentFilters";

interface CommentsTabProps {
  projectId: string;
  workspaceId: string;
  currentPageId: string | null;
  selectedCommentId?: string | null;
  /** Selects a comment and takes the canvas to its pin, switching pages if it has to
   * (ProjectOverviewPage's revealComment). */
  onRevealComment?: (commentId: string) => void;
  /** A pin clicked in the canvas (or a BugHunt AI finding): open that comment here. */
  openCommentRequest?: { commentId: string; nonce: number } | null;
  onOpenRequestHandled?: (nonce: number) => void;
}

export function CommentsTab({
  projectId,
  workspaceId,
  currentPageId,
  selectedCommentId,
  onRevealComment,
  openCommentRequest,
  onOpenRequestHandled,
}: CommentsTabProps) {
  const commentsQuery = useQuery({
    queryKey: qk.projectComments(projectId),
    queryFn: () => boardApi.listProjectComments(projectId),
  });
  const comments = commentsQuery.data;

  const { data: members = [] } = useQuery({
    queryKey: qk.members(workspaceId),
    queryFn: () => workspacesApi.listMembers(workspaceId),
    enabled: !!workspaceId,
  });

  const { data: pages = [] } = useQuery({
    queryKey: qk.projectPages(projectId),
    queryFn: () => pagesApi.listProjectPages(projectId),
  });

  const {
    activeStatus,
    setActiveStatus,
    hideResolved,
    setHideResolved,
    layerFilter,
    setLayerFilter,
    sortOrder,
    setSortOrder,
    currentPageOnly,
    setCurrentPageOnly,
    activeTags,
    setActiveTags,
    activeDeviceTypes,
    setActiveDeviceTypes,
    activeBrowsers,
    setActiveBrowsers,
    activeAssignees,
    setActiveAssignees,
    displayMode,
    setDisplayMode,
    groupBy,
    setGroupBy,
    openThreadId,
    setOpenThreadId,
    clearFilters,
  } = useCommentFilters();

  const allThreads = useMemo(() => (comments ?? []).filter((c) => !c.parent_id), [comments]);

  // Replies (parent_id set) share the same flat list as top-level comments - grouped
  // here for the reply-count badge and the thread view, the same way BoardPage's own
  // repliesByParent works for the ticket board's copy of this same data.
  const repliesByParent = useMemo(() => {
    const map = new Map<string, CommentOut[]>();
    for (const comment of comments ?? []) {
      if (!comment.parent_id) continue;
      const list = map.get(comment.parent_id) ?? [];
      list.push(comment);
      map.set(comment.parent_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
    return map;
  }, [comments]);

  const replyCountByCommentId = useMemo(() => {
    const map = new Map<string, number>();
    for (const [parentId, replies] of repliesByParent) map.set(parentId, replies.length);
    return map;
  }, [repliesByParent]);

  const openThreadComment = allThreads.find((c) => c.id === openThreadId) ?? null;

  const statusCounts = useMemo(() => {
    const counts: Record<CommentStatus, number> = {
      todo: 0,
      in_progress: 0,
      in_review: 0,
      blocked: 0,
      resolved: 0,
      wont_fix: 0,
    };
    for (const c of allThreads) counts[c.status] += 1;
    return counts;
  }, [allThreads]);

  const filteredThreads = allThreads.filter((c) => {
    if (hideResolved && c.status === "resolved") return false;
    if (activeStatus && c.status !== activeStatus) return false;
    if (layerFilter !== "all" && c.layer !== layerFilter) return false;
    if (currentPageOnly && currentPageId && c.page_id !== currentPageId) return false;
    if (activeTags.length > 0 && !activeTags.some((t) => c.tags?.includes(t as NonNullable<CommentOut["tags"]>[number]))) return false;
    if (activeDeviceTypes.length > 0 && !activeDeviceTypes.includes(commentDeviceType(c) ?? "")) return false;
    if (activeBrowsers.length > 0 && !activeBrowsers.includes(commentBrowser(c) ?? "")) return false;
    if (activeAssignees.length > 0 && !activeAssignees.some((a) => c.assignee_id === a || c.assignee_ids?.includes(a))) return false;
    return true;
  });

  const sortedThreads = useMemo(
    () =>
      filteredThreads
        .slice()
        .sort((a, b) =>
          sortOrder === "newest"
            ? b.created_at.localeCompare(a.created_at)
            : a.created_at.localeCompare(b.created_at),
        ),
    [filteredThreads, sortOrder],
  );

  function onStatusChipClick(status: CommentStatus) {
    setActiveStatus((prev) => (prev === status ? null : status));
  }

  // Clicking a comment opens its detail here *and* takes the canvas to its pin, the
  // two halves of "show me this comment". The canvas side (ProjectOverviewPage) knows
  // which page is loaded and switches to the comment's own page when it isn't that one.
  function openComment(commentId: string) {
    setOpenThreadId(commentId);
    onRevealComment?.(commentId);
  }

  // A pin clicked in the canvas (or a BugHunt AI finding) opens that comment's detail,
  // whether the list or another comment's detail was showing.
  useEffect(() => {
    if (!openCommentRequest) return;
    setOpenThreadId(openCommentRequest.commentId);
    onOpenRequestHandled?.(openCommentRequest.nonce);
  }, [openCommentRequest, onOpenRequestHandled, setOpenThreadId]);

  // A ?thread= link (or an open detail) whose comment was deleted - here or by someone
  // else - falls back to the list instead of keeping a dead id in the URL.
  // Not while a refetch is in flight: a comment just posted in the canvas can be asked
  // for a moment before it reaches this list.
  const settled = commentsQuery.isSuccess && !commentsQuery.isFetching;
  useEffect(() => {
    if (!openThreadId || !settled) return;
    if (!allThreads.some((c) => c.id === openThreadId)) setOpenThreadId(null);
  }, [openThreadId, settled, allThreads, setOpenThreadId]);

  if (openThreadComment) {
    return (
      <CommentDetail
        comment={openThreadComment}
        replies={repliesByParent.get(openThreadComment.id) ?? []}
        projectId={projectId}
        workspaceId={workspaceId}
        members={members}
        pages={pages}
        onBack={() => setOpenThreadId(null)}
        onShowOnPage={(commentId) => onRevealComment?.(commentId)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <StatusChips
        activeStatus={activeStatus}
        statusCounts={statusCounts}
        filteredCount={filteredThreads.length}
        totalCount={allThreads.length}
        onSelectAll={() => setActiveStatus(null)}
        onStatusChipClick={onStatusChipClick}
      />

      <FilterSortBar
        allThreads={allThreads}
        members={members}
        sortOrder={sortOrder}
        setSortOrder={setSortOrder}
        layerFilter={layerFilter}
        setLayerFilter={setLayerFilter}
        activeTags={activeTags}
        setActiveTags={setActiveTags}
        activeDeviceTypes={activeDeviceTypes}
        setActiveDeviceTypes={setActiveDeviceTypes}
        activeBrowsers={activeBrowsers}
        setActiveBrowsers={setActiveBrowsers}
        activeAssignees={activeAssignees}
        setActiveAssignees={setActiveAssignees}
      />

      <ViewOptionsBar
        currentPageId={currentPageId}
        currentPageOnly={currentPageOnly}
        setCurrentPageOnly={setCurrentPageOnly}
        hideResolved={hideResolved}
        setHideResolved={setHideResolved}
        displayMode={displayMode}
        setDisplayMode={setDisplayMode}
        groupBy={groupBy}
        setGroupBy={setGroupBy}
      />

      <CommentsList
        isLoading={commentsQuery.isLoading}
        isError={commentsQuery.isError}
        onRetry={() => commentsQuery.refetch()}
        allThreads={allThreads}
        filteredThreads={filteredThreads}
        sortedThreads={sortedThreads}
        displayMode={displayMode}
        groupBy={groupBy}
        projectId={projectId}
        pages={pages}
        members={members}
        replyCountByCommentId={replyCountByCommentId}
        onNavigate={openComment}
        onOpenThread={openComment}
        onClearFilters={clearFilters}
        selectedCommentId={selectedCommentId}
      />
    </div>
  );
}
