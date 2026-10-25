import { WidgetApiError, type ApiClient } from "./api-client";
import type { Schemas } from "../../../packages/types/src/index";

export interface StoredGuestSession {
  guestSessionToken: string;
  displayName: string;
}

// sessionStorage, not localStorage: a share link's guest identity shouldn't silently
// persist across unrelated future visits from the same device (07-Review-SDK.md §7.2).
function storageKey(shareToken: string): string {
  return `backline:guest-session:${shareToken}`;
}

export function getStoredGuestSession(shareToken: string): StoredGuestSession | null {
  try {
    const raw = sessionStorage.getItem(storageKey(shareToken));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredGuestSession> | null;
    if (typeof parsed?.guestSessionToken === "string" && parsed.guestSessionToken && typeof parsed.displayName === "string") {
      return { guestSessionToken: parsed.guestSessionToken, displayName: parsed.displayName };
    }
    clearStoredGuestSession(shareToken);
    return null;
  } catch {
    clearStoredGuestSession(shareToken);
    return null;
  }
}

function setStoredGuestSession(shareToken: string, session: StoredGuestSession): void {
  try { sessionStorage.setItem(storageKey(shareToken), JSON.stringify(session)); } catch { /* Continue without tab recovery when storage is unavailable. */ }
}

export function clearStoredGuestSession(shareToken: string): void {
  try { sessionStorage.removeItem(storageKey(shareToken)); } catch { /* Storage may be disabled. */ }
}

// Milestone 9: the dashboard's ReviewEntryPage already creates a guest session (name +
// passcode, if required) before handing off to the real page - in both snippet mode
// (redirected to the agency's own site) and proxy mode (redirected to Backline's own
// /proxy/{token}/ route, which injects this exact script). Without this, the widget
// would immediately prompt for a name *again*, right after the guest just gave one.
// FLOW-01: current dashboards send `backline_handoff`, a code that works once for two
// minutes, so the session token never sits in the site's URL. `backline_guest` (the
// token itself) is still read for links opened from an older dashboard.
type UrlHandoff = { code: string } | StoredGuestSession;

function takeHandoffFromUrl(): UrlHandoff | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("backline_handoff");
  const token = params.get("backline_guest");
  if (!code && !token) return null;
  const displayName = params.get("backline_name") ?? "";

  params.delete("backline_handoff");
  params.delete("backline_guest");
  params.delete("backline_name");
  const query = params.toString();
  const cleanedUrl = window.location.pathname + (query ? `?${query}` : "") + window.location.hash;
  window.history.replaceState(null, "", cleanedUrl);

  return code ? { code } : { guestSessionToken: token!, displayName };
}

async function redeemHandoff(api: ApiClient, handoff: UrlHandoff | null): Promise<StoredGuestSession | null> {
  if (!handoff || !("code" in handoff)) return handoff;
  try {
    const session = await api.request<Schemas["GuestSessionOut"]>("/api/v1/guest-sessions/handoff/redeem", {
      method: "POST",
      body: JSON.stringify({ code: handoff.code }),
    });
    return { guestSessionToken: session.guest_session_token, displayName: session.display_name };
  } catch (error) {
    // Already used (a reload of the first URL) or expired: this tab may still hold the
    // session it redeemed earlier, which the caller falls back to.
    if (error instanceof WidgetApiError && error.status === 404) return null;
    throw error;
  }
}

// The dashboard's own canvas preview (ProjectOverviewPage) is only ever opened by a
// signed-in team member, whose name the dashboard already knows - so instead of showing
// the "Your name" prompt there, ask the parent frame for it. Resolves null if no answer
// arrives in time (no dashboard parent, or an older dashboard build), in which case the
// caller falls back to the normal prompt.
export function requestDashboardDisplayName(timeoutMs = 3000): Promise<string | null> {
  if (window.parent === window) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(null), timeoutMs);
    function finish(name: string | null): void {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(name);
    }
    function onMessage(event: MessageEvent): void {
      if (event.source !== window.parent) return;
      if (event.data?.type !== "backline:display-name") return;
      const name = typeof event.data.displayName === "string" ? event.data.displayName.trim() : "";
      // 100 = GuestSessionCreate.display_name's max_length (share_links/schemas.py).
      finish(name ? name.slice(0, 100) : null);
    }
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "backline:request-display-name" }, "*");
  });
}

// The dashboard's canvas loads through the project's canvas link (TDR-0057), whose
// sessions the API only issues to a signed-in member - so the widget there doesn't make
// one, it asks the dashboard for the member's own. Never stored: the next page load
// asks again, and the dashboard answers from its cache. Resolves null when nothing
// answers in time (not inside a dashboard, or a dashboard from before TDR-0057), and
// the caller falls back to the guest flow above.
export function requestDashboardCanvasSession(timeoutMs = 3000): Promise<StoredGuestSession | null> {
  if (window.parent === window) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(null), timeoutMs);
    function finish(session: StoredGuestSession | null): void {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(session);
    }
    function onMessage(event: MessageEvent): void {
      if (event.source !== window.parent) return;
      if (event.data?.type !== "backline:canvas-session") return;
      const token: unknown = event.data.guestSessionToken;
      const name: unknown = event.data.displayName;
      finish(typeof token === "string" && token ? { guestSessionToken: token, displayName: typeof name === "string" ? name : "" } : null);
    }
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "backline:request-canvas-session" }, "*");
  });
}

export async function ensureGuestSession(
  api: ApiClient,
  shareToken: string,
  promptForName: () => Promise<{ name: string; email?: string | null }>,
  expectedShareLinkId: string,
): Promise<StoredGuestSession> {
  const fromHandoff = await redeemHandoff(api, takeHandoffFromUrl());
  const existing = fromHandoff ?? getStoredGuestSession(shareToken);
  if (existing) {
    try {
      const current = await api.request<Schemas["GuestSessionStatusOut"]>("/api/v1/guest-sessions/current", {
        headers: { "X-Guest-Session": existing.guestSessionToken }, cache: "no-store",
      });
      if (current.share_link_id !== expectedShareLinkId) {
        throw new WidgetApiError(403, "WRONG_REVIEW_LINK", "Open the original review link to join again.");
      }
      const session = { ...existing, displayName: current.display_name };
      setStoredGuestSession(shareToken, session);
      return session;
    } catch (error) {
      if (error instanceof WidgetApiError && [401, 403, 404].includes(error.status)) {
        clearStoredGuestSession(shareToken);
        // Rejoin through the normal gate, including passcode/member requirements.
        // Never silently turn a member-bound identity into an ordinary guest.
        throw new Error("This review session ended. Open your review link to join again.");
      }
      throw error;
    }
  }

  const reviewer = await promptForName();
  const result = await api.request<{ guest_session_token: string; display_name: string }>(
    "/api/v1/guest-sessions",
    {
      method: "POST",
      body: JSON.stringify({
        share_token: shareToken,
        display_name: reviewer.name,
        ...(reviewer.email ? { email: reviewer.email } : {}),
      }),
    },
  );
  const session: StoredGuestSession = {
    guestSessionToken: result.guest_session_token,
    displayName: result.display_name,
  };
  setStoredGuestSession(shareToken, session);
  return session;
}
