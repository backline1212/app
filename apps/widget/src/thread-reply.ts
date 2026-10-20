import type { ApiClient } from "./api-client";
import type { CommentRecord } from "./types";
import type { ThreadReplyRequest } from "./ui-thread-reply";

/** The caller retains the original request after a timeout/lost acknowledgement.
 * Aborting this HTTP read cannot establish whether the server committed a reply. */
export async function postThreadReply(api: ApiClient, topId: string, request: ThreadReplyRequest): Promise<CommentRecord> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    return await api.request<CommentRecord>(`/api/v1/comments/${topId}/replies`, {
      method: "POST", body: JSON.stringify(request), signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
