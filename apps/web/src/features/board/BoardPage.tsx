import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useOutletContext, useParams, useSearchParams } from "react-router-dom";

import { LoadingScreen } from "../../components/LoadingScreen";
import { useToast } from "../../components/Toast";
import { STATUS_LABELS } from "../../lib/workflow";
import { EmptyArt } from "../../components/illustrations";
import * as integrationsApi from "../integrations/api";
import { useProject, useProjectRole } from "../projects/use-project";
import type { WorkspaceOut } from "../workspaces/api";
import * as workspacesApi from "../workspaces/api";
import { useWSEvent } from "../../app/WSProvider";
import { patchProjectComment, removeProjectComment, upsertProjectComment } from "../../lib/comment-cache";
import { qk } from "../../lib/query-keys";
import { useDocumentTitle } from "../../lib/use-document-title";
import { useConnectionStore } from "../../stores/connectionStore";
import { usePresenceStore } from "../../stores/presenceStore";
import * as boardApi from "./api";
import type { CommentOut, CommentStatus } from "./api";
import { CommentThreadPanel } from "./CommentThreadPanel";
import { BoardHeader } from "./components/BoardHeader";
import { KanbanBoard } from "./components/KanbanBoard";
import { ListTable } from "./components/ListTable";
import { commentContext, filtersFromParams, type Filters } from "./components/types";

export function BoardPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const filters = filtersFromParams(searchParams);

  // Both `view` and the open-thread id live in the URL (not useState) so a deep
  // link, refresh, or back-button all reproduce the same screen (FE-03).
  const view: "kanban" | "list" = searchParams.get("view") === "list" ? "list" : "kanban";

  function setView(next: "kanban" | "list") {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === "kanban") {
          params.delete("view");
        } else {
          params.set("view", next);
        }
        return params;
      },
      { replace: true },
    );
  }

  const openThreadId = searchParams.get("comment");

  const setOpenThreadId = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (id) {
            params.set("comment", id);
          } else {
            params.delete("comment");
          }
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Only clears the URL's ?comment= if it still points at the comment being removed -
  // avoids clobbering a thread the user has since navigated to.
  const closeThreadIfMatches = useCallback(
    (commentId: string) => {
      setSearchParams(
        (prev) => {
          if (prev.get("comment") !== commentId) return prev;
          const params = new URLSearchParams(prev);
          params.delete("comment");
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  function setFilter(key: keyof Filters, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setSearchParams(next, { replace: true });
  }

  const { toast } = useToast();
  const { data: project } = useProject(projectId);
  const { canEdit, canComment } = useProjectRole(projectId);
  useDocumentTitle([project?.name, "Board"]);

  const { data: comments, isLoading, error: commentsError, refetch: refetchComments } = useQuery({
    queryKey: qk.projectComments(projectId ?? ""),
    queryFn: () => boardApi.listProjectComments(projectId!),
    enabled: !!projectId,
  });

  const { data: members } = useQuery({
    queryKey: qk.members(workspace.id),
    queryFn: () => workspacesApi.listMembers(workspace.id),
  });

  const { data: integrations } = useQuery({
    queryKey: qk.integrations(workspace.id),
    queryFn: () => integrationsApi.listIntegrations(workspace.id),
  });
  // Trackers are sent from the ticket dialog, which remembers what was already filed and
  // shows sending/errors; the board's own buttons forgot after a reload, so the same
  // issue could be filed twice (TDR-0229).
  const hasTracker = (integrations ?? []).some((item) => item.kind === "tracker" && !item.needs_destination);

  const memberName = useMemo(() => {
    const byId = new Map((members ?? []).map((member) => [member.user_id, member.name]));
    return (userId: string | null) => (userId ? (byId.get(userId) ?? "Unknown") : null);
  }, [members]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: qk.projectComments(projectId ?? "") });

  const connectionStatus = useConnectionStore((state) => state.status);
  const presenceByPageId = usePresenceStore((state) => state.byPageId);

  // Targeted cache merges on live events, not a blind invalidate (14-State-Management.md
  // §14.4) - a busy review session would otherwise thrash the board with full refetches.
  const upsertComment = useCallback(
    (payload: CommentOut & { project_id: string }) => {
      if (payload.project_id !== projectId) return;
      upsertProjectComment(queryClient, projectId ?? "", payload);
    },
    [projectId, queryClient],
  );
  useWSEvent("comment.created", upsertComment);
  useWSEvent("comment.updated", upsertComment);

  // comment.recovery_updated (10-Revision-Recovery.md §10.4) carries just
  // {comment_id, recovery_status, confidence} - no project_id, unlike
  // comment.created/updated - so instead of a project match, this patches by id and
  // silently no-ops if the id isn't in the currently-viewed project's cache (i.e. the
  // event was for a different project in the same workspace).
  const patchRecoveryStatus = useCallback(
    (payload: { comment_id: string; recovery_status: CommentOut["recovery_status"] }) => {
      patchProjectComment(queryClient, projectId ?? "", payload.comment_id, {
        recovery_status: payload.recovery_status,
      });
    },
    [projectId, queryClient],
  );
  useWSEvent("comment.recovery_updated", patchRecoveryStatus);

  // Widget-only feature (comment delete/reply are not exposed from this dashboard board
  // in this pass) - this just keeps the Board's own cache honest when a guest deletes a
  // comment or a whole thread from the widget canvas, so it doesn't linger here stale.
  const removeComment = useCallback(
    (payload: { comment_id: string; parent_id: string | null; project_id: string }) => {
      if (payload.project_id !== projectId) return;
      removeProjectComment(queryClient, projectId ?? "", payload.comment_id);
      closeThreadIfMatches(payload.comment_id);
    },
    [projectId, queryClient, closeThreadIfMatches],
  );
  useWSEvent("comment.deleted", removeComment);

  useWSEvent(
    "presence.updated",
    useCallback((payload: { page_id: string; active_sessions: string[] }) => {
      usePresenceStore.getState().setPresence(payload.page_id, payload.active_sessions);
    }, []),
  );

  // page_id -> url, so a presence.updated event (page-scoped) can be shown next to the
  // matching page filter option - the only place BoardPage otherwise keeps that mapping.
  const pageIdToUrl = useMemo(() => {
    const map = new Map<string, string>();
    for (const comment of comments ?? []) {
      const url = commentContext(comment).url;
      if (url) map.set(comment.page_id, url);
    }
    return map;
  }, [comments]);

  const reviewerCountByUrl = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [pageId, sessions] of Object.entries(presenceByPageId)) {
      const url = pageIdToUrl.get(pageId);
      if (url) counts.set(url, sessions.length);
    }
    return counts;
  }, [presenceByPageId, pageIdToUrl]);

  const updateMutation = useMutation({
    mutationFn: ({
      commentId,
      patch,
    }: {
      commentId: string;
      patch: { status?: CommentStatus; assignee_id?: string | null };
    }) => {
      const current = comments?.find(comment => comment.id === commentId);
      if (!current) throw new Error("This comment is no longer in the board. Reload before editing.");
      return boardApi.updateComment(commentId, patch, current.revision ?? 0);
    },
    onSuccess: invalidate,
    onError: invalidate,
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: (status: CommentStatus) => {
      const rows = [...selected].map(id => comments?.find(comment => comment.id === id));
      if (rows.some(row => !row)) throw new Error("The selection changed. Reload the board before updating it.");
      return Promise.all(rows.map(row => boardApi.updateComment(row!.id, { status }, row!.revision ?? 0)));
    },
    onSuccess: (saved, status) => {
      setSelected(new Set());
      invalidate();
      toast(`${saved.length} ticket${saved.length === 1 ? "" : "s"} moved to ${STATUS_LABELS[status]}.`, "success");
    },
    onError: invalidate,
  });

  const pageUrls = useMemo(() => {
    const urls = new Set<string>();
    for (const comment of comments ?? []) {
      const url = commentContext(comment).url;
      if (url) urls.add(url);
    }
    return [...urls];
  }, [comments]);

  // Replies (parent_id set) share the same flat list as top-level comments
  // (`GET /projects/{id}/comments`) - grouped here rather than rendered as their own
  // board cards, which is what a top-level-only filter below guards against.
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

  // A link to a reply (activity, notifications, search) opens its thread: the reply
  // itself is not a ticket and has no status, assignee or priority of its own.
  const linkedComment = (comments ?? []).find((c) => c.id === openThreadId) ?? null;
  const openThreadComment = linkedComment?.parent_id
    ? (comments ?? []).find((c) => c.id === linkedComment.parent_id) ?? null
    : linkedComment;

  const filtered = useMemo(() => {
    return (comments ?? []).filter((comment) => {
      if (comment.parent_id) return false;
      if (filters.status && comment.status !== filters.status) return false;
      if (filters.layer && comment.layer !== filters.layer) return false;
      if (filters.assignee && comment.assignee_id !== filters.assignee) return false;
      if (filters.device && commentContext(comment).device_type !== filters.device) return false;
      if (filters.page && commentContext(comment).url !== filters.page) return false;
      return true;
    });
  }, [comments, filters]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  if (!projectId) {
    return <main className="bl-review-gate"><p role="alert">Missing project context.</p></main>;
  }

  if (isLoading) {
    return <LoadingScreen label="Loading board" />;
  }

  return (
    <main className="bl-wrap">
      {(updateMutation.error || bulkUpdateMutation.error) && <p role="alert" className="bl-error">
        {updateMutation.error?.message ?? bulkUpdateMutation.error?.message} Reload the board before trying again.
      </p>}
      <BoardHeader
        connectionStatus={connectionStatus}
        view={view}
        setView={setView}
        filters={filters}
        setFilter={setFilter}
        members={members}
        pageUrls={pageUrls}
        reviewerCountByUrl={reviewerCountByUrl}
        workspaceSlug={workspace.slug}
        projectId={projectId}
        projectName={project?.name}
      />

      {view === "kanban" ? (
        <KanbanBoard
          filtered={filtered}
          memberName={memberName}
          repliesByParent={repliesByParent}
          setOpenThreadId={setOpenThreadId}
          updateMutation={updateMutation}
          hasTracker={hasTracker}
          canEdit={canEdit}
          canComment={canComment}
        />
      ) : (
        <ListTable
          filtered={filtered}
          selected={selected}
          setSelected={setSelected}
          toggleSelected={toggleSelected}
          memberName={memberName}
          repliesByParent={repliesByParent}
          setOpenThreadId={setOpenThreadId}
          bulkUpdateMutation={bulkUpdateMutation}
          canEdit={canEdit}
        />
      )}

      {openThreadComment && (
        <CommentThreadPanel
          key={openThreadComment.id}
          comment={openThreadComment}
          replies={repliesByParent.get(openThreadComment.id) ?? []}
          projectId={projectId}
          onClose={() => setOpenThreadId(null)}
        />
      )}

      {commentsError ? (
        <div className="bl-empty" role="alert">
          <EmptyArt kind="search" />
          <strong>The board couldn't load</strong>
          <p>{commentsError.message}</p>
          <button type="button" className="bl-quiet" onClick={() => void refetchComments()}>Try again</button>
        </div>
      ) : filtered.length === 0 && (Object.values(filters).some(Boolean) ? (
        <div className="bl-empty"><EmptyArt kind="search" /><strong>No matching tickets</strong><p>Try clearing one or more board filters.</p></div>
      ) : (
        <div className="bl-empty"><EmptyArt kind="search" /><strong>No tickets yet</strong><p>Feedback left on this project's review link shows up here.</p></div>
      ))}
    </main>
  );
}
