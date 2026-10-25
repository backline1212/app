import type { ApiClient } from "./api-client";
import type { OwnCommentHandlers } from "./thread-manager";
import type { CommentRecord } from "./types";

/** The author-only comment routes, for a viewer whose comments carry `viewer` as
 * their author. `canResolve` follows the project's reviewer setting (guests only). */
export function ownCommentHandlers(
  api: ApiClient,
  viewer: { type: "member" | "guest"; id: string },
  canResolve: boolean,
): OwnCommentHandlers {
  return {
    isOwn: comment => viewer.id !== "" && comment.author_type === viewer.type && comment.author_id === viewer.id,
    edit: (commentId, body) => api.request<CommentRecord>(`/api/v1/comments/${commentId}/body`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    }),
    remove: commentId => api.request<void>(`/api/v1/comments/${commentId}`, { method: "DELETE" }),
    resolve: canResolve
      ? commentId => api.request<CommentRecord>(`/api/v1/comments/${commentId}/resolve`, { method: "PATCH" })
      : null,
  };
}
