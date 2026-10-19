import type { Schemas } from "../../../packages/types/src/index";
import type { ApiClient } from "./api-client";
import type { CommentRecord } from "./types";

type CommentPayload = Omit<Schemas["CommentCreate"], "client_request_id">;

/** One composer owns one request. An ambiguous response must replay identical
 * evidence, not capture/upload again under the same idempotency key. Memory only;
 * nothing from a review is persisted in the site's browser storage. */
export function createCommentSubmission(api: ApiClient, pageId: string, pageUrl = location.href) {
  const requestId = crypto.randomUUID();
  let serialized: string | null = null;
  let ambiguous = false;
  let saved: CommentRecord | null = null;
  let pending: Promise<CommentRecord> | null = null;

  function requireOriginalPage(): void {
    if (location.href !== pageUrl) {
      throw new Error("The page changed. Copy your text, then close this draft and comment on the new page.");
    }
  }

  async function send(prepare: () => Promise<CommentPayload>): Promise<CommentRecord> {
    if (saved) return saved;
    requireOriginalPage();
    if (serialized === null) {
      const payload = await prepare();
      requireOriginalPage();
      serialized = JSON.stringify({ ...payload, client_request_id: requestId });
    }
    try {
      saved = await api.request<CommentRecord>(`/api/v1/pages/${pageId}/comments`, {
        method: "POST", body: serialized,
      });
      return saved;
    } catch (error) {
      // These responses reject the write before creating a comment. Once an
      // earlier response was lost, even a subsequent auth failure cannot prove
      // the original write failed: keep its exact payload for future retries.
      const status = error instanceof Error && "status" in error ? Number(error.status) : 0;
      // A local SESSION_ENDED error also uses 401 and can race a committed write,
      // so authentication loss is deliberately treated as unconfirmed.
      if (!ambiguous && [400, 403, 404, 413, 422].includes(status)) serialized = null;
      else ambiguous = true;
      throw error;
    }
  }

  return {
    isPrepared: () => serialized !== null,
    submit(prepare: () => Promise<CommentPayload>): Promise<CommentRecord> {
      if (pending) return pending;
      pending = send(prepare).finally(() => { pending = null; });
      return pending;
    },
  };
}
