import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { API_BASE_URL, ApiError } from "../../lib/api-client";
import { qk } from "../../lib/query-keys";
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
  const { shareToken } = useParams<{ shareToken: string }>();
  const [displayName, setDisplayName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
  } = useQuery({
    queryKey: qk.review(shareToken ?? ""),
    queryFn: () => reviewApi.resolveShareLink(shareToken!),
    enabled: !!shareToken,
    retry: false,
  });

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
      const handoff = new URLSearchParams({
        backline_guest: session.guestSessionToken,
        backline_name: session.displayName,
      });
      const proxyBase = resolved.preview_origin ?? `${API_BASE_URL}/proxy/${shareToken}`;
      const destination =
        resolved.mode === "proxy"
          ? `${proxyBase}/?${handoff.toString()}`
          : `${resolved.target_origin}${resolved.target_origin.includes("?") ? "&" : "?"}${handoff.toString()}`;
      // Every website reviewer can choose native browser review before being sent
      // into a proxy that may not support the site's authentication.
      setPendingHandoff({ token: session.guestSessionToken, destination });
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
    setDisplayName(stored.displayName);
    routeGuest(stored);
  }, [shareToken, resolved, assetGuest, pendingHandoff, isSubmitting, routeGuest]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!shareToken || !resolved) return;
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
      setDisplayName(result.display_name);
      routeGuest(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join this review.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleLeave() {
    if (shareToken) clearStoredGuestSession(shareToken);
    // Full reload, not just resetting local state: it also drops the in-memory
    // React Query cache for this guest's session-scoped data and returns to a
    // clean gate, matching the reference product's own "Leave review" behavior.
    window.location.reload();
  }

  if (!shareToken) {
    return <ErrorScreen message="Missing share link." />;
  }
  if (assetGuest && resolved) {
    return (
      <AssetReview
        projectId={resolved.project_id}
        title={resolved.project_name}
        guest={assetGuest}
        guestName={displayName}
        onLeave={handleLeave}
      />
    );
  }

  if (pendingHandoff && resolved && showBoard) {
    return (
      <GuestBoard
        projectId={resolved.project_id}
        guestToken={pendingHandoff.token}
        guestName={displayName}
        onBack={() => setShowBoard(false)}
        onLeave={handleLeave}
        continueLabel="Continue to site"
        onContinue={() => {
          setShowBoard(false);
        }}
      />
    );
  }

  if (pendingHandoff && resolved) {
    return (
      <div className="bl-gate-scrim">
        <div className="bl-gate-modal" role="dialog" aria-modal="true" aria-labelledby="ggTitle">
          <div className="bl-gate-head">
            <h3 id="ggTitle">You&apos;re in</h3>
            <p id="ggSub">For websites with sign-in, use Browser review. Sign in normally and leave comments in the same tab.</p>
          </div>
          <div className="bl-gate-foot" style={{ flexDirection: "column" }}>
            <NativeReviewButton projectId={resolved.project_id} url={resolved.target_origin}
              guest={{ kind: "guest", token: pendingHandoff.token, shareToken, displayName }} />
            <button className="bl-button" style={{ width: "100%" }} onClick={() => (window.location.href = pendingHandoff.destination)}>
              {resolved.mode === "proxy" ? "Open embedded review" : "Open installed website review"}
            </button>
            {resolved.show_board_to_client && <button className="bl-quiet" style={{ width: "100%" }} onClick={() => setShowBoard(true)}>
              View the board
            </button>}
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
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
    return <ErrorScreen message={message} />;
  }

  if (!resolved) {
    return null;
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
            {resolved.ask_reviewer_name !== false && (
              <div className="bl-gate-field">
                <label>Your name</label>
                <input
                  required
                  autoComplete="name"
                  enterKeyHint={resolved.requires_passcode ? "next" : "go"}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Ravi Kulkarni"
                  type="text"
                />
                <div className="bl-gate-hint">Shown next to your comments. Nothing else is stored.</div>
              </div>
            )}

            {resolved.requires_passcode && (
              <div className="bl-gate-field">
                <label>Passcode</label>
                <input
                  type="password"
                  required
                  enterKeyHint="go"
                  value={passcode}
                  onChange={(event) => setPasscode(event.target.value)}
                />
              </div>
            )}

            {error && <p className="bl-error" style={{ margin: "4px 0" }}>{error}</p>}
          </div>
          <div className="bl-gate-foot">
            <button className="bl-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Starting..." : "Start reviewing"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="bl-gate-scrim">
      <div className="bl-gate-modal" role="dialog" aria-modal="true">
        <div className="bl-gate-head">
          <h3>Could not join</h3>
        </div>
        <div className="bl-gate-body">
          <div className="bl-error" style={{ margin: 0 }}>{message}</div>
        </div>
      </div>
    </div>
  );
}
