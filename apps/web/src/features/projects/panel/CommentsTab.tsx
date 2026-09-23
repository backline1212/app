import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type { RefObject } from "react";

import * as boardApi from "../../board/api";
import type { CommentOut, CommentStatus } from "../../board/api";
import { API_BASE_URL } from "../../../lib/api-client";
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
  canvasRef: RefObject<HTMLIFrameElement | null>;
  currentPageId: string | null;
  selectedCommentId?: string | null;
  onSelectComment?: (commentId: string) => void;
}

export function CommentsTab({
  projectId,
  workspaceId,
  canvasRef,
  currentPageId,
  selectedCommentId,
  onSelectComment,
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
  } = useCommentFilters();

  const allThreads = (comments ?? []).filter((c) => !c.parent_id);

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

  const openThreadComment = (comments ?? []).find((c) => c.id === openThreadId) ?? null;

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
    if (currentPageOnly && c.page_id !== currentPageId) return false;
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

  // The canvas iframe is served from the API's own origin (proxy mode), not the
  // dashboard's - postMessage is the only way to reach into it (apps/widget/src/index.ts
  // listens for this exact message). Not just cosmetic: a comment whose pin never
  // rendered (off-screen, or the target hadn't loaded yet) can still genuinely exist -
  // this is how a reviewer actually finds it again.
  function showOnPage(commentId: string) {
    onSelectComment?.(commentId);
    canvasRef.current?.contentWindow?.postMessage(
      { type: "backline:scroll-to-comment", commentId },
      new URL(API_BASE_URL).origin,
    );
  }

  // Clicking a comment opens its detail here *and* takes the canvas to its pin, the
  // two halves of "show me this comment".
  function openComment(commentId: string) {
    setOpenThreadId(commentId);
    showOnPage(commentId);
  }

  // A pin clicked in the canvas selects that comment (ProjectOverviewPage's
  // backline:comment-opened handler). With the detail open, follow it there rather
  // than leaving a different comment's detail on screen.
  useEffect(() => {
    if (openThreadId && selectedCommentId && selectedCommentId !== openThreadId) {
      setOpenThreadId(selectedCommentId);
    }
  }, [openThreadId, selectedCommentId, setOpenThreadId]);

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
        onShowOnPage={showOnPage}
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
        selectedCommentId={selectedCommentId}
      />
    </div>
  );
}
