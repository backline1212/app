import type { Schemas } from "@backline/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { upsertProjectComment } from "../../lib/comment-cache";
import { createReply, type CommentOut } from "../board/api";

type ReplyRequest = Schemas["ReplyCreate"] & { client_request_id: string };
type Prepared = { parentId: string; projectId: string; request: ReplyRequest };

/** A lost response never turns the same reply into a second write. Draft text and
 * evidence stay in memory; completed API saves are distinct from refresh failures. */
export function usePreparedReply({ commentId, projectId, draft, onSaved }: {
  commentId: string;
  projectId: string;
  draft: () => Schemas["ReplyCreate"];
  onSaved: (created: CommentOut) => void | Promise<void>;
}) {
  const cache = useQueryClient();
  const prepared = useRef<Prepared | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const resource = useRef({ commentId, projectId });
  resource.current = { commentId, projectId };
  const [locked, setLocked] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [validation, setValidation] = useState<Error | null>(null);
  const [completionWarning, setCompletionWarning] = useState("");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const sameResource = (value: Prepared) => mounted.current && resource.current.commentId === value.parentId && resource.current.projectId === value.projectId;
  const mutation = useMutation({
    gcTime: 0,
    mutationFn: async (value: Prepared) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      try { return await createReply(value.parentId, value.request, controller.signal); }
      finally { clearTimeout(timer); }
    },
    onSuccess: (created, value) => {
      if (!sameResource(value)) return;
      prepared.current = null;
      setLocked(false);
      setCopyStatus("");
      // A failed refetch after a confirmed POST is not an unconfirmed save.
      const warn = () => {
        if (sameResource(value)) setCompletionWarning("Reply saved. Some feedback could not refresh; reload the view to check it.");
      };
      try { void Promise.resolve(onSaved(created)).catch(warn); } catch { warn(); }
      try { upsertProjectComment(cache, value.projectId, created); } catch { warn(); }
    },
    onSettled: () => { submitting.current = false; },
  });
  function mutate(): void {
    if (submitting.current) return;
    if (!prepared.current) {
      const input = draft();
      const body = input.body.trim();
      if (!body || body.length > 10_000 || (input.attachments?.length ?? 0) > 10 || (input.mentioned_user_ids?.length ?? 0) > 20) {
        setValidation(new Error("Use 1–10,000 characters, up to 10 attachments and 20 mentions."));
        return;
      }
      prepared.current = { parentId: commentId, projectId, request: structuredClone({ ...input, body, client_request_id: crypto.randomUUID() }) };
    }
    submitting.current = true;
    setLocked(true);
    setValidation(null);
    setCompletionWarning("");
    mutation.mutate(prepared.current);
  }
  function reset(): void {
    if (submitting.current) return;
    prepared.current = null;
    setLocked(false);
    setCopyStatus("");
    setValidation(null);
    setCompletionWarning("");
    mutation.reset();
  }
  async function copyText(): Promise<void> {
    const text = prepared.current?.request.body ?? draft().body;
    try {
      if (!navigator.clipboard) throw new Error("Unavailable");
      await navigator.clipboard.writeText(text);
      if (mounted.current) setCopyStatus("Reply text copied. Saving status has not changed.");
    } catch { if (mounted.current) setCopyStatus("Select the reply text and press Ctrl+C or ⌘C to copy it."); }
  }
  return {
    ...mutation, mutate, reset, locked, copyText, copyStatus, completionWarning,
    isFrozen: () => submitting.current || prepared.current !== null,
    isError: mutation.isError || validation !== null,
    error: validation ?? mutation.error,
  };
}
