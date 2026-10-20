import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { API_BASE_URL, ApiError } from "../../lib/api-client";
import { qk } from "../../lib/query-keys";
import { useDocumentTitle } from "../../lib/use-document-title";
import { useOnlineStatus } from "../../lib/use-online-status";
import { AssetReview } from "../assets/AssetReview";
import * as reviewApi from "./api";
import { GuestBoard } from "./GuestBoard";
import { NativeReviewButton } from "./NativeReviewButton";
import {
  clearStoredGuestSession,
  getStoredGuestSession,
  setStoredGuestSession,
  type StoredGuestSession,
} from "./guest-session";

// Guest entry resolves the share link and passcode once. Website reviewers choose
// the real browser tab or the compatible embedded/snippet path; only the latter
// needs a guest token in its handoff URL for the installed widget.
export function ReviewEntryPage() {
  const cache = useQueryClient();
  const online = useOnlineStatus();
  const { shareToken } = useParams<{ shareToken: string }>();
  const [sessionShareToken, setSessionShareToken] = useState(shareToken);
  const sessionMatchesLink = sessionShareToken === shareToken;
  const [displayName, setDisplayName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryBlocked, setRecoveryBlocked] = useState(false);
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  const [siteNeedsLogin, setSiteNeedsLogin] = useState<"yes" | "no" | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const joining = useRef(false);
  const currentLink = useRef(shareToken);
  currentLink.current = shareToken;
  const [assetGuest, setAssetGuest] = useState<string | null>(null);
  // Let website reviewers choose browser review before entering the proxy.
  const [pendingHandoff, setPendingHandoff] = useState<{ token: string; destination: string } | null>(
    null,
  );
  const [showBoard, setShowBoard] = useState(false);

  const {
    data: resolved,
    isLoading,
    error: resolveError,
    refetch: reloadReview,
  } = useQuery({
    queryKey: qk.review(shareToken ?? ""),
    queryFn: () => reviewApi.resolveShareLink(shareToken!),
    enabled: !!shareToken,
    retry: false,
  });
  useDocumentTitle([resolved?.project_name, "Review"]);
  const activeToken = sessionMatchesLink ? assetGuest ?? pendingHandoff?.token ?? "" : "";
  const sessionStatus = useQuery({
    queryKey: qk.guestSession(activeToken),
    queryFn: ({ signal }) => reviewApi.getGuestSessionStatus(activeToken, signal),
    enabled: Boolean(activeToken), retry: false, refetchInterval: 15_000,
  });
  const sessionEnded = sessionStatus.error instanceof ApiError && [401, 403, 404].includes(sessionStatus.error.status);

  useEffect(() => {
    setAssetGuest(null);
    setPendingHandoff(null);
    setShowBoard(false);
    setSessionShareToken(shareToken);
    setError(null);
    setPasscode("");
    setDisplayName("");
    setRecoveryBlocked(false);
    setSiteNeedsLogin(null);
    setLeaveError(null);
    setLeaving(false);
  }, [shareToken]);

  useEffect(() => {
    if (!sessionEnded || !activeToken || !shareToken) return;
    clearStoredGuestSession(shareToken);
    setAssetGuest(null);
    setPendingHandoff(null);
    setShowBoard(false);
    setError("Your review session ended. Join again to continue.");
    const guestQueries = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey.includes(activeToken) };
    void cache.cancelQueries(guestQueries).then(() => cache.removeQueries(guestQueries));
    void cache.invalidateQueries({ queryKey: qk.review(shareToken) });
  }, [sessionEnded, activeToken, shareToken, cache]);

  // Routes an already-identified guest (freshly created, or recovered from a prior
  // visit this tab) to the right destination for this project's type, without
  // re-asking for a name/passcode. Shared by handleSubmit and the recovery effect
  // below so the two paths can't drift.
  const routeGuest = useCallback(
    (session: StoredGuestSession) => {
      if (!shareToken || !resolved) return;
      if (resolved.project_type && resolved.project_type !== "website") {
        setAssetGuest(session.guestSessionToken);
        return;
      }
      const proxyBase = resolved.preview_origin ?? `${API_BASE_URL}/proxy/${shareToken}`;
      const initial = new URL(resolved.start_url ?? resolved.target_origin);
      const destination = resolved.mode === "proxy"
        ? new URL(`${proxyBase}${initial.pathname}${initial.search}${initial.hash}`)
        : initial;
      destination.searchParams.set("backline_guest", session.guestSessionToken);
      destination.searchParams.set("backline_name", session.displayName);
      // Every website reviewer can choose native browser review before being sent
      // into a proxy that may not support the site's authentication.
      setPendingHandoff({ token: session.guestSessionToken, destination: destination.href });
    },
    [shareToken, resolved],
  );

  // Guest session recovery: a guest who already joined this share link earlier in
  // the same tab (refreshed, or came back from "Leave review" without actually
  // leaving) skips the name/passcode gate entirely instead of being asked again.
  useEffect(() => {
    if (!shareToken || !resolved) return;
    if (assetGuest || pendingHandoff || isSubmitting) return;
    const stored = getStoredGuestSession(shareToken);
    if (!stored) return;
    const controller = new AbortController();
    setIsRecovering(true);
    setRecoveryBlocked(false);
    reviewApi.getGuestSessionStatus(stored.guestSessionToken, controller.signal).then((current) => {
      if (controller.signal.aborted) return;
      if (current.share_link_id !== resolved.share_link_id || current.member_bound) {
        clearStoredGuestSession(shareToken);
        setError("Open the original review link to join this project again.");
        return;
      }
      const session = { ...stored, displayName: current.display_name };
      setDisplayName(session.displayName);
      routeGuest(session);
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiError && [401, 403, 404].includes(failure.status)) {
        clearStoredGuestSession(shareToken);
        setError("Your previous review session ended. Join again to continue.");
      } else {
        setRecoveryBlocked(true);
        setError("Couldn't check your previous session. Check your connection and try again.");
      }
    }).finally(() => { if (!controller.signal.aborted) setIsRecovering(false); });
    return () => { controller.abort(); setIsRecovering(false); };
  }, [shareToken, resolved, assetGuest, pendingHandoff, isSubmitting, routeGuest, recoveryAttempt]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!shareToken || !resolved || joining.current || recoveryBlocked || !online) return;
    const originalLink = shareToken;
    joining.current = true;
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await reviewApi.createGuestSession(
        shareToken,
        displayName,
        passcode || undefined,
      );
      const session: StoredGuestSession = {
        guestSessionToken: result.guest_session_token,
        displayName: result.display_name,
      };
      setStoredGuestSession(shareToken, session);
      if (currentLink.current !== originalLink) return;
      setDisplayName(result.display_name);
      setPasscode("");
      routeGuest(session);
    } catch (err) {
      if (currentLink.current === originalLink) setError(err instanceof Error ? err.message : "Could not join this review.");
    } finally {
      joining.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleLeave() {
    if (leaving) return;
    const originalLink = shareToken;
    setLeaving(true);
    setLeaveError(null);
    try {
      const token = activeToken || (shareToken ? getStoredGuestSession(shareToken)?.guestSessionToken : null);
      if (token) await reviewApi.endGuestSession(token);
    } catch (failure) {
      if (!(failure instanceof ApiError && [401, 403, 404].includes(failure.status))) {
        if (currentLink.current === originalLink) {
          setLeaveError("Couldn't end your session. Check your connection and try again.");
          setLeaving(false);
        }
        return;
      }
    }
    if (shareToken) clearStoredGuestSession(shareToken);
    if (currentLink.current !== originalLink) return;
    // Full reload, not just resetting local state: it also drops the in-memory
    // React Query cache for this guest's session-scoped data and returns to a
    // clean gate, matching the reference product's own "Leave review" behavior.
    window.location.reload();
  }

  if (!shareToken) {
    return <ErrorScreen message="Missing share link." />;
  }
  if (sessionEnded) return <ErrorScreen message="Your review session ended. Join again to continue." onRetry={() => { if (shareToken) clearStoredGuestSession(shareToken); window.location.reload(); }} retryLabel="Rejoin review" />;
  if (sessionMatchesLink && assetGuest && resolved) {
    return (<>
      {leaveError && <p role="alert" className="bl-error">{leaveError}</p>}
      <AssetReview
        key={resolved.project_id}
        projectId={resolved.project_id}
        title={resolved.project_name}
        guest={assetGuest}
        guestName={displayName}
        onLeave={handleLeave}
      /></>
    );
  }

  if (sessionMatchesLink && pendingHandoff && resolved && showBoard) {
    return (<>
      {leaveError && <p role="alert" className="bl-error">{leaveError}</p>}
      <GuestBoard
        projectId={resolved.project_id}
        guestToken={pendingHandoff.token}
        guestName={displayName}
        onBack={() => setShowBoard(false)}
        onLeave={handleLeave}
        continueLabel="Back to review"
        onContinue={() => {
          setShowBoard(false);
        }}
      /></>
    );
  }

  if (sessionMatchesLink && pendingHandoff && resolved) {
    return (
      <div className="bl-gate-scrim">
        <div className="bl-gate-modal" role="dialog" aria-modal="true" aria-labelledby="ggTitle">
          <div className="bl-gate-head">
            <h3 id="ggTitle">Review {resolved.project_name}</h3>
            <p id="ggSub">Joined as {displayName}. Choose how to open the website.</p>
          </div>
          <div className="bl-gate-body">
            <ol className="bl-review-steps" aria-label="Review steps"><li>Joined review</li><li aria-current="step">Open website</li><li>Leave feedback</li></ol>
            <fieldset className="bl-review-question"><legend>Does this website ask you to sign in?</legend>
              <label><input type="radio" name="site-login" checked={siteNeedsLogin === "yes"} onChange={() => setSiteNeedsLogin("yes")} />Yes, or I'm not sure</label>
              <label><input type="radio" name="site-login" checked={siteNeedsLogin === "no"} onChange={() => setSiteNeedsLogin("no")} />No, it's a public page</label>
            </fieldset>
            {siteNeedsLogin === null && <p role="status">Choose an option above to continue to the website.</p>}
            {siteNeedsLogin === "yes" && <p>Use your normal browser and website account. We'll guide you through the extension setup if needed.</p>}
            {siteNeedsLogin === "no" && <p>Open the review in a new tab, click an element and save your feedback. Keep this page open to return to your review.</p>}
            <p className="bl-policy-note">Website sign-in is separate from joining Backline. A review link doesn't give access to the website's private pages.</p>
            {leaveError && <p role="alert" className="bl-error">{leaveError}</p>}
            {!online && <p role="status">You're offline. Reconnect to start or rejoin a review.</p>}
          </div>
          <div className="bl-gate-foot" style={{ flexDirection: "column" }}>
            {siteNeedsLogin === "yes" && <NativeReviewButton projectId={resolved.project_id} url={resolved.start_url ?? resolved.target_origin}
              guest={{ kind: "guest", token: pendingHandoff.token, shareToken, displayName }} onGuestSessionExpired={() => void handleLeave()} />}
            {siteNeedsLogin === "no" && <>
              <a className="bl-button" href={pendingHandoff.destination} target="_blank" rel="noopener noreferrer">Open website review ↗</a>
              <details><summary>Page doesn't load or asks for sign-in?</summary><p>Open the real website with the extension to keep its normal login.</p><NativeReviewButton projectId={resolved.project_id} url={resolved.start_url ?? resolved.target_origin} guest={{ kind: "guest", token: pendingHandoff.token, shareToken, displayName }} onGuestSessionExpired={() => void handleLeave()} /></details>
            </>}
            {resolved.show_board_to_client && <button className="bl-quiet" style={{ width: "100%" }} onClick={() => setShowBoard(true)}>
              View the board
            </button>}
            <button type="button" className="bl-quiet" disabled={leaving} onClick={() => void handleLeave()}>{leaving ? "Leaving…" : "Leave review"}</button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading || isRecovering) {
    return (
      <div className="bl-gate-scrim">
        <div className="bl-gate-modal" role="dialog" aria-modal="true">
          <div className="bl-gate-head">
            <h3>Opening review...</h3>
          </div>
        </div>
      </div>
    );
  }

  if (resolveError) {
    const message =
      resolveError instanceof ApiError
        ? resolveError.message
        : "This review link could not be opened.";
    return <ErrorScreen message={message} onRetry={() => void reloadReview()} />;
  }

  if (!resolved) {
    return <ErrorScreen message="Review details need to be loaded again." onRetry={() => void reloadReview()} />;
  }

  // The dashboard canvas's own link (TDR-0057): sessions on it are only issued to a
  // signed-in member from inside the dashboard, so there is no name to ask for here.
  if (resolved.canvas_only) {
    return (
      <ErrorScreen message="This link only opens inside the Backline dashboard. Sign in to review this project, or ask the team for a client review link." signIn />
    );
  }

  return (
    <div className="bl-gate-scrim" id="ggScrim">
      <div className="bl-gate-modal" role="dialog" aria-modal="true" aria-labelledby="ggTitle">
        <div className="bl-gate-head">
          <h3 id="ggTitle">Review {resolved.project_name}</h3>
          <p id="ggSub">Tell us who&apos;s reviewing - no account needed.</p>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "contents" }}>
          <div className="bl-gate-body">
            {recoveryBlocked ? <div role="alert"><p>{error}</p><button type="button" className="bl-button" disabled={!online} onClick={() => setRecoveryAttempt(value => value + 1)}>Check saved session again</button><p>Your earlier review identity is kept until we can check it.</p><button type="button" className="bl-quiet" disabled={leaving} onClick={() => void handleLeave()}>Leave and rejoin</button>{leaveError && <p className="bl-error">{leaveError}</p>}</div> : <>
            {resolved.ask_reviewer_name !== false && (
              <div className="bl-gate-field">
                <label htmlFor="reviewer-name">Your name</label>
                <input
                  required
                  id="reviewer-name"
                  maxLength={100}
                  autoComplete="name"
                  enterKeyHint={resolved.requires_passcode ? "next" : "go"}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Ravi Kulkarni"
                  type="text"
                />
                <div className="bl-gate-hint">Your name is shown with your feedback. Review activity and any submitted evidence are saved for this project.</div>
              </div>
            )}

            {resolved.requires_passcode && (
              <div className="bl-gate-field">
                <label htmlFor="review-passcode">Review passcode</label>
                <input
                  type="password"
                  id="review-passcode"
                  autoComplete="off"
                  required
                  enterKeyHint="go"
                  value={passcode}
                  onChange={(event) => setPasscode(event.target.value)}
                />
              </div>
            )}

            {error && <p role="alert" className="bl-error" style={{ margin: "4px 0" }}>{error}</p>}
            {!online && <p role="status">You're offline. Reconnect to join this review.</p>}
            </>}
          </div>
          <div className="bl-gate-foot">
            <button className="bl-button" type="submit" disabled={isSubmitting || recoveryBlocked || !online}>
              {isSubmitting ? "Joining…" : "Join review"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ErrorScreen({ message, onRetry, retryLabel = "Try again", signIn }: { message: string; onRetry?: () => void; retryLabel?: string; signIn?: boolean }) {
  return (
    <div className="bl-gate-scrim">
      <div className="bl-gate-modal" role="dialog" aria-modal="true">
        <div className="bl-gate-head">
          <h3>Could not join</h3>
        </div>
        <div className="bl-gate-body">
          <div className="bl-error" style={{ margin: 0 }}>{message}</div>
          <p>If the link has expired or been revoked, ask the project team for a new link.</p>
        </div>
        <div className="bl-gate-foot">{onRetry && <button type="button" className="bl-button" onClick={onRetry}>{retryLabel}</button>}{signIn && <Link className="bl-button" to="/login">Sign in to Backline</Link>}</div>
      </div>
    </div>
  );
}
