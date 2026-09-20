import type { ApiClient } from "./api-client";

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
  const raw = sessionStorage.getItem(storageKey(shareToken));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredGuestSession;
  } catch {
    return null;
  }
}

function setStoredGuestSession(shareToken: string, session: StoredGuestSession): void {
  sessionStorage.setItem(storageKey(shareToken), JSON.stringify(session));
}

// Milestone 9: the dashboard's ReviewEntryPage already creates a guest session (name +
// passcode, if required) before handing off to the real page - in both snippet mode
// (redirected to the agency's own site) and proxy mode (redirected to Backline's own
// /proxy/{token}/ route, which injects this exact script). Without this, the widget
// would immediately prompt for a name *again*, right after the guest just gave one.
function getGuestSessionFromQueryParam(): StoredGuestSession | null {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("backline_guest");
  if (!token) return null;
  const displayName = params.get("backline_name") ?? "";

  params.delete("backline_guest");
  params.delete("backline_name");
  const query = params.toString();
  const cleanedUrl = window.location.pathname + (query ? `?${query}` : "") + window.location.hash;
  window.history.replaceState(null, "", cleanedUrl);

  return { guestSessionToken: token, displayName };
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

export async function ensureGuestSession(
  api: ApiClient,
  shareToken: string,
  promptForName: () => Promise<string>,
): Promise<StoredGuestSession> {
  const fromHandoff = getGuestSessionFromQueryParam();
  if (fromHandoff) {
    setStoredGuestSession(shareToken, fromHandoff);
    return fromHandoff;
  }

  const existing = getStoredGuestSession(shareToken);
  if (existing) return existing;

  const displayName = await promptForName();
  const result = await api.request<{ guest_session_token: string; display_name: string }>(
    "/api/v1/guest-sessions",
    {
      method: "POST",
      body: JSON.stringify({ share_token: shareToken, display_name: displayName }),
    },
  );
  const session: StoredGuestSession = {
    guestSessionToken: result.guest_session_token,
    displayName: result.display_name,
  };
  setStoredGuestSession(shareToken, session);
  return session;
}
