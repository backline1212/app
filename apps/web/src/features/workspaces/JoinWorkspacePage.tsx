import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { ApiError } from "../../lib/api-client";
import { qk } from "../../lib/query-keys";
import { timeAgo } from "../../lib/time";
import { useDocumentTitle } from "../../lib/use-document-title";
import { useAuth } from "../auth/AuthContext";
import * as workspacesApi from "./api";
import type { JoinPreviewOut } from "./api";

function clean(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase();
}

/**
 * Joining a workspace with its room code (TDR-0056). The code is checked first, so the
 * person sees which workspace they're about to join - and whether an admin has to let
 * them in - before anything happens. `/join?code=…` links fill the code in.
 */
export function JoinWorkspacePage() {
  useDocumentTitle("Join a workspace");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { switchWorkspace, user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState(() => clean(params.get("code") ?? ""));
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<(JoinPreviewOut & { code: string }) | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const mine = useQuery({ queryKey: qk.myJoinRequests(), queryFn: workspacesApi.listMyJoinRequests });

  const lookup = useMutation({
    mutationFn: (value: string) => workspacesApi.previewJoin(value),
    onSuccess: (result, value) => {
      setPreview({ ...result, code: value });
      setSent(null);
      setParams({ code: value }, { replace: true });
    },
    onError: () => setPreview(null),
  });

  const open = async (workspaceId: string, slug: string) => {
    await queryClient.invalidateQueries({ queryKey: qk.workspaces() });
    await switchWorkspace(workspaceId);
    navigate(`/w/${slug}`, { replace: true });
  };

  const join = useMutation({
    mutationFn: () => workspacesApi.submitJoinRequest(preview!.code, message),
    onSuccess: async (result) => {
      void queryClient.invalidateQueries({ queryKey: qk.myJoinRequests() });
      if ((result.status === "joined" || result.status === "already_member") && result.workspace_slug) {
        await open(result.workspace_id, result.workspace_slug);
        return;
      }
      setSent(result.workspace_name);
      setPreview((current) => (current ? { ...current, status: "pending" } : current));
    },
  });

  const withdraw = useMutation({
    mutationFn: (requestId: string) => workspacesApi.cancelMyJoinRequest(requestId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.myJoinRequests() });
      setPreview((current) => (current?.status === "pending" ? { ...current, status: "can_join" } : current));
      setSent(null);
    },
  });

  // A shared /join?code=… link looks the code up straight away.
  const looked = useRef(false);
  useEffect(() => {
    if (looked.current) return;
    looked.current = true;
    const initial = clean(params.get("code") ?? "");
    if (initial) lookup.mutate(initial);
    else inputRef.current?.focus();
  }, [params, lookup]);

  function submitCode(event: FormEvent) {
    event.preventDefault();
    const value = clean(code);
    if (value && !lookup.isPending) lookup.mutate(value);
  }

  const lookupError =
    lookup.error instanceof ApiError && lookup.error.status === 404
      ? "That code doesn't match any workspace. Check it with whoever shared it."
      : lookup.error?.message;
  const pending = (mine.data ?? []).filter((r) => r.status === "pending");
  const declined = (mine.data ?? []).filter((r) => r.status === "rejected");
  const pendingForPreview = preview && pending.find((r) => r.workspace_id === preview.workspace_id);

  return (
    <main className="wsp join-page">
      <div className="wsp-card join-card">
        <div className="wsp-head">
          <span className="lg-mark">B</span>
          <span>
            <b>Backline</b>
            <em>JOIN A WORKSPACE</em>
          </span>
        </div>

        <div className="wsp-body">
          <div className="wsp-title">
            <h1>Join with a room code</h1>
            <Link className="wsp-signout" to="/">Your workspaces</Link>
          </div>
          {user && <p className="wsp-email">Signed in as {user.email}</p>}

          <form className="join-code-form" onSubmit={submitCode}>
            <label htmlFor="room-code-input">Room code</label>
            <div className="join-code-row">
              <input
                id="room-code-input"
                ref={inputRef}
                className="join-code-input"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.toUpperCase());
                  if (preview) setPreview(null);
                }}
                placeholder="K7QM-2XRD-P4WN"
                autoComplete="off"
                spellCheck={false}
                maxLength={40}
                disabled={lookup.isPending || join.isPending}
                aria-describedby="room-code-help"
              />
              <button type="submit" className="wsp-submit join-check" disabled={!clean(code) || lookup.isPending}>
                {lookup.isPending ? <span className="lg-spin" /> : null}
                {lookup.isPending ? "Checking…" : "Continue"}
              </button>
            </div>
            <small id="room-code-help">Ask an owner or admin of the workspace for its code. Capitals and spaces don't matter.</small>
            {lookupError && (
              <p className="wsp-err" role="alert">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
                <span>{lookupError}</span>
              </p>
            )}
          </form>

          {preview && (
            <section className="join-preview" aria-live="polite">
              <div className="join-preview-head">
                <span className="wsp-mark join-mark">{preview.workspace_name.slice(0, 1).toUpperCase()}</span>
                <span>
                  <strong>{preview.workspace_name}</strong>
                  <small>
                    {preview.member_count} {preview.member_count === 1 ? "member" : "members"} ·{" "}
                    {preview.requires_approval ? "an admin approves new people" : "join straight away"}
                  </small>
                </span>
              </div>

              {preview.status === "already_member" ? (
                <>
                  <p>You're already a member of {preview.workspace_name}.</p>
                  <button
                    type="button"
                    className="wsp-submit"
                    onClick={() => preview.workspace_slug && void open(preview.workspace_id, preview.workspace_slug)}
                  >
                    Open {preview.workspace_name}
                  </button>
                </>
              ) : preview.status === "pending" || sent ? (
                <div className="join-waiting">
                  <span className="join-pulse" aria-hidden="true" />
                  <div>
                    <strong>{sent ? "Request sent" : "Waiting for approval"}</strong>
                    <p>
                      An owner or admin of {preview.workspace_name} has been told. You'll get an email when they let you
                      in, and it will appear under your workspaces.
                    </p>
                  </div>
                  {pendingForPreview && (
                    <button type="button" className="wsp-signout" disabled={withdraw.isPending} onClick={() => withdraw.mutate(pendingForPreview.id)}>
                      Withdraw
                    </button>
                  )}
                </div>
              ) : (
                <form
                  className="join-submit"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!join.isPending) join.mutate();
                  }}
                >
                  {preview.requires_approval && (
                    <label>
                      <span className="join-label">
                        Note to the admins <span className="join-optional">Optional</span>
                      </span>
                      <textarea
                        value={message}
                        maxLength={280}
                        onChange={(event) => setMessage(event.target.value)}
                        placeholder="Hi - I'm joining the design team on Monday."
                        rows={2}
                      />
                    </label>
                  )}
                  {join.error && (
                    <p className="wsp-err" role="alert"><span>{join.error.message}</span></p>
                  )}
                  <button type="submit" className="wsp-submit" disabled={join.isPending}>
                    {join.isPending ? <span className="lg-spin" /> : null}
                    {preview.requires_approval ? "Ask to join" : `Join ${preview.workspace_name}`}
                  </button>
                </form>
              )}
            </section>
          )}

          {(pending.length > 0 || declined.length > 0) && (
            <section className="join-mine">
              <h2>Your requests</h2>
              <ul>
                {pending.map((request) => (
                  <li key={request.id}>
                    <span className="join-state is-pending">Waiting</span>
                    <span className="join-mine-name">{request.workspace_name}</span>
                    <small>asked {timeAgo(request.created_at)}</small>
                    <button type="button" className="wsp-signout" disabled={withdraw.isPending} onClick={() => withdraw.mutate(request.id)}>
                      Withdraw
                    </button>
                  </li>
                ))}
                {declined.map((request) => (
                  <li key={request.id}>
                    <span className="join-state is-declined">Declined</span>
                    <span className="join-mine-name">{request.workspace_name}</span>
                    <small>{request.decided_at ? timeAgo(request.decided_at) : ""}</small>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="wsp-foot">
          <span className="c">&copy; {new Date().getFullYear()} Backline</span>
          <Link to="/">Back to your workspaces</Link>
        </div>
      </div>
    </main>
  );
}
